import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { createAgentHttpBoundary, publicGatewayError } from '../../src/server/agent-connect/http.ts'

/**
 * Official stateless MCP transport. All policy remains in the shared gateway.
 * Not an app route: the integrator must supply real identity/admission/backend wiring.
 * @param {import('../../src/server/agent-connect/http.ts').AgentHttpOptions} opts
 * @returns {(request: Request) => Promise<Response>}
 */
export function createArrangeMcpHandler(opts) {
  const boundary = createAgentHttpBoundary(opts)
  return request => boundary(request, async (grant, boundedRequest) => {
    // Request-local closure: concurrent clients cannot overwrite a shared principal.
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'arrange-mcp-server', version: '0.1.0' })
      for (const tool of opts.gateway.listTools(grant)) {
        /**
         * @param {unknown} args
         * @returns {Promise<import('@modelcontextprotocol/server').CallToolResult>}
         */
        async function call(args) {
          try {
            const result = await opts.gateway.call(grant, tool.name, args)
            return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] }
          } catch (error) {
            const { error: safe } = publicGatewayError(error)
            return { isError: true, structuredContent: { error: safe }, content: [{ type: 'text', text: JSON.stringify({ error: safe }) }] }
          }
        }
        server.registerTool(tool.name, {
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        }, call)
      }
      return server
    }, { responseMode: 'json' })
    try { return await handler.fetch(boundedRequest) }
    finally { await handler.close() }
  })
}
