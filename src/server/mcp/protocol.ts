import { z } from 'zod'

// Hand-written JSON-RPC 2.0 handler for the MCP methods Naive is documented to
// use: initialize, tools/list and tools/call (plus notifications and ping).
// This module knows nothing about HTTP; http.ts maps its result to a Response,
// so an SSE transport could be added there without touching this file.

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const
export const SERVER_INFO = { name: 'we-gotchu', version: '0.4.0' }

export const JSONRPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const

export type JsonRpcId = string | number | null

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId; result: unknown }
  | { jsonrpc: '2.0'; id: JsonRpcId; error: { code: number; message: string; data?: unknown } }

export type ToolCallResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export type ToolDefinition<T = unknown> = {
  name: string
  description: string
  input: z.ZodType<T>
  handler: (args: T) => Promise<ToolCallResult>
}

/** Either a JSON-RPC response to send, or nothing (a notification, HTTP 202). */
export type ProtocolOutcome = { kind: 'response'; status: number; body: JsonRpcResponse } | { kind: 'accepted' }

/** Wraps a JSON-serialisable value as MCP text content. */
export function toolResult(value: unknown, isError = false): ToolCallResult {
  const result: ToolCallResult = { content: [{ type: 'text', text: JSON.stringify(value) }] }
  if (isError) result.isError = true
  return result
}

function errorResponse(id: JsonRpcId, code: number, message: string, status = 200, data?: unknown): ProtocolOutcome {
  const error: { code: number; message: string; data?: unknown } = { code, message }
  if (data !== undefined) error.data = data
  return { kind: 'response', status, body: { jsonrpc: '2.0', id, error } }
}

function ok(id: JsonRpcId, result: unknown): ProtocolOutcome {
  return { kind: 'response', status: 200, body: { jsonrpc: '2.0', id, result } }
}

const RequestShape = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
})

const CallParams = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
})

export function toolInputSchema(tool: ToolDefinition<any>): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(tool.input, { io: 'input' }) as Record<string, unknown>
  return schema
}

export async function handleJsonRpc(raw: string, tools: readonly ToolDefinition<any>[]): Promise<ProtocolOutcome> {
  let message: unknown
  try {
    message = JSON.parse(raw)
  } catch {
    return errorResponse(null, JSONRPC_ERRORS.parseError, 'Parse error', 400)
  }

  const parsed = RequestShape.safeParse(message)
  if (!parsed.success) {
    // A JSON-RPC response or batch sent to us is not something this server accepts.
    const id = typeof message === 'object' && message !== null && 'id' in message ? ((message as { id: JsonRpcId }).id ?? null) : null
    return errorResponse(id, JSONRPC_ERRORS.invalidRequest, 'Invalid Request', 400)
  }
  const request = parsed.data

  // Notifications have no id and get no response body.
  if (request.id === undefined) return { kind: 'accepted' }
  const id = request.id

  switch (request.method) {
    case 'initialize': {
      const requested = request.params?.protocolVersion
      const protocolVersion =
        typeof requested === 'string' && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0]
      return ok(id, {
        protocolVersion,
        serverInfo: SERVER_INFO,
        capabilities: { tools: { listChanged: false } },
        instructions: 'We Gotchu guarded execution tools. Every purchase is checked against a stored, paid customer approval.',
      })
    }
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, {
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: toolInputSchema(t) })),
      })
    case 'tools/call': {
      const params = CallParams.safeParse(request.params ?? {})
      if (!params.success) return errorResponse(id, JSONRPC_ERRORS.invalidParams, 'Invalid params: expected name and arguments')
      const tool = tools.find((t) => t.name === params.data.name)
      if (!tool) return errorResponse(id, JSONRPC_ERRORS.invalidParams, `Unknown tool: ${params.data.name}`)
      const args = tool.input.safeParse(params.data.arguments ?? {})
      if (!args.success) {
        return errorResponse(id, JSONRPC_ERRORS.invalidParams, `Invalid arguments for ${tool.name}`, 200, z.flattenError(args.error))
      }
      try {
        return ok(id, await tool.handler(args.data))
      } catch (error) {
        console.error(`[mcp] tool ${tool.name} failed`, error)
        return ok(id, toolResult({ errorCode: 'internal_error', message: 'The tool failed on the server.' }, true))
      }
    }
    default:
      return errorResponse(id, JSONRPC_ERRORS.methodNotFound, `Method not found: ${request.method}`)
  }
}
