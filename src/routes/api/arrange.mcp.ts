import { createFileRoute } from '@tanstack/react-router'
import { getArrangeApp } from '#/server/arrange/runtime'
import { handle } from '#/server/events/errors'
import { methodNotAllowed } from '#/server/mcp/http'

// The ARRANGE agent's tools. Naïve calls this with the static bearer from its vault.
export const Route = createFileRoute('/api/arrange/mcp')({
  server: {
    handlers: {
      POST: ({ request }) => handle(async () => (await getArrangeApp()).handleMcp(request)),
      GET: async () => methodNotAllowed(),
    },
  },
})
