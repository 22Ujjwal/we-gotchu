import { createFileRoute } from '@tanstack/react-router'
import { handleMcpRequest, methodNotAllowed } from '#/server/mcp/http'
import { createTools } from '#/server/mcp/tools'
import { getExecutionDeps } from '#/server/runtime'

// Guarded MCP endpoint for Naive. Accepts only the static bearer from Naive's vault.
const tools = createTools(getExecutionDeps)

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      POST: async ({ request }) => handleMcpRequest(request, tools),
      GET: async () => methodNotAllowed(),
    },
  },
})
