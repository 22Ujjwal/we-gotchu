import { z } from 'zod'
import { assertGrant } from './auth'
import { canonicalOrigin } from './gateway'
import type { AgentGateway } from './gateway'
import { GatewayError } from './types'
import type { AgentGrant, TokenVerifier } from './types'

export type AgentHttpOptions = {
  gateway: AgentGateway
  verifyToken: TokenVerifier
  endpointUrl: string
  allowedOrigins?: string[]
  bodyTimeoutMs?: number
  now?: () => number
}
const MAX_BYTES = 32 * 1024
export function publicGatewayError(error: unknown) {
  return error instanceof GatewayError
    ? { status: error.status, error: { code: error.code, message: error.message } }
    : { status: 503, error: { code: 'temporarily_unavailable', message: 'Arrange is temporarily unavailable. Do not repeat a write with a new request ID.' } }
}
function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'private, no-store')
  headers.set('vary', 'Authorization, Origin')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
async function boundedBody(request: Request, timeoutMs: number): Promise<string> {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new GatewayError(413, 'body_too_large', 'Use a smaller request.')
  if (!request.body) throw new GatewayError(400, 'invalid_body', 'A JSON request body is required.')
  const reader = request.body.getReader()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        let size = 0
        const chunks: Uint8Array[] = []
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > MAX_BYTES) throw new GatewayError(413, 'body_too_large', 'Use a smaller request.')
          chunks.push(value)
        }
        try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) }
        catch { throw new GatewayError(400, 'invalid_body', 'The request must contain valid UTF-8 JSON.') }
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new GatewayError(408, 'body_timeout', 'Request body timed out.')), timeoutMs) }),
    ])
  } finally {
    clearTimeout(timer)
    await reader.cancel().catch(() => {})
  }
}

/** Shared request gate for MCP and JSON. No token, cookie or customer-ID fallback. */
export function createAgentHttpBoundary(opts: AgentHttpOptions) {
  const endpoint = new URL(opts.endpointUrl)
  canonicalOrigin(endpoint.origin)
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Configure a canonical endpoint URL')
  const origins = new Set((opts.allowedOrigins ?? [endpoint.origin]).map(canonicalOrigin))
  return async (request: Request, handle: (grant: AgentGrant, boundedRequest: Request) => Promise<Response>): Promise<Response> => {
    try {
      const url = new URL(request.url)
      const host = request.headers.get('host')
      const origin = request.headers.get('origin')
      if (url.origin !== endpoint.origin || url.pathname !== endpoint.pathname || url.search || url.hash ||
        host && host.toLowerCase() !== endpoint.host.toLowerCase() || origin && !origins.has(origin)) {
        throw new GatewayError(403, 'untrusted_request_origin', 'Use the configured Arrange endpoint from an allowed origin.')
      }
      const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
      if (!token || token.length < 32 || token.length > 4096) throw new GatewayError(401, 'invalid_token', 'Connect using a customer-scoped Arrange token.')
      let candidate: AgentGrant | null
      try { candidate = await opts.verifyToken(token) }
      catch { throw new GatewayError(503, 'authorization_unavailable', 'Arrange cannot verify this connection right now. No action was started.') }
      if (!candidate) throw new GatewayError(401, 'invalid_token', 'Reconnect your Arrange account.')
      const grant = assertGrant(candidate, opts.gateway.audience, (opts.now ?? Date.now)())
      if (request.method !== 'POST') return privateResponse(new Response(null, { status: 405, headers: { allow: 'POST' } }))
      const body = await boundedBody(request, opts.bodyTimeoutMs ?? 5000)
      return privateResponse(await handle(grant, new Request(request.url, { method: 'POST', headers: request.headers, body, signal: request.signal })))
    } catch (error) {
      const safe = publicGatewayError(error)
      return privateResponse(Response.json({ error: safe.error }, { status: safe.status,
        headers: safe.status === 401 ? { 'www-authenticate': 'Bearer realm="arrange-agent-connect"' } : {} }))
    }
  }
}

const command = z.object({ name: z.string().min(1).max(100), arguments: z.record(z.string(), z.unknown()).default({}) }).strict()
export function createAgentJsonHandler(opts: AgentHttpOptions): (request: Request) => Promise<Response> {
  const boundary = createAgentHttpBoundary(opts)
  return request => boundary(request, async (grant, bounded) => {
    let body: unknown
    try { body = await bounded.json() }
    catch { throw new GatewayError(400, 'invalid_json', 'Use a valid JSON tool request.') }
    const parsed = command.safeParse(body)
    if (!parsed.success) throw new GatewayError(400, 'invalid_arguments', 'Provide only a tool name and arguments object.')
    return Response.json(await opts.gateway.call(grant, parsed.data.name, parsed.data.arguments))
  })
}
