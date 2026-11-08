import { isAuthorized, unauthorizedResponse } from './auth'
import { handleJsonRpc, type ToolDefinition } from './protocol'

// HTTP transport for POST /api/mcp: bearer check, then plain JSON-RPC JSON
// responses. Whether Naive needs SSE responses is unverified; if it does, the
// streaming variant belongs here and protocol.ts stays as it is.

const MAX_BODY_BYTES = 1_000_000

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export async function handleMcpRequest(request: Request, tools: readonly ToolDefinition<any>[], expectedToken?: string): Promise<Response> {
  if (!isAuthorized(request.headers.get('authorization'), expectedToken ?? process.env.MCP_BEARER_TOKEN)) {
    console.warn('[mcp] rejected unauthenticated request')
    return unauthorizedResponse()
  }
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } })
  }
  const outcome = await handleJsonRpc(raw, tools)
  if (outcome.kind === 'accepted') return new Response(null, { status: 202 })
  if ('result' in outcome.body) console.log(`[mcp] ok ${describeRequest(raw)}`)
  return json(outcome.status, outcome.body)
}

function describeRequest(raw: string): string {
  try {
    const message = JSON.parse(raw) as { method?: string; params?: { name?: string } }
    return message.method === 'tools/call' ? `tools/call ${message.params?.name}` : String(message.method)
  } catch {
    return 'unparsed'
  }
}

/** GET would open an SSE stream in Streamable HTTP; this server does not offer one. */
export function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { allow: 'POST' } })
}
