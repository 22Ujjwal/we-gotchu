import { createFileRoute } from '@tanstack/react-router'
import { getRequestDeps } from '../../server/events/local-runtime'
import { handle, json, readJson } from '../../server/events/errors'
import { approve } from '../../server/events/service'

// Body: { planId, planRevision }. Returns { approval, payment, checkoutUrl }.
export const Route = createFileRoute('/api/events/$id/approve')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(async () => {
          const body = ((await readJson(request)) ?? {}) as Record<string, unknown>
          return json(await approve(await getRequestDeps(), params.id, body.planId, body.planRevision))
        }),
    },
  },
})
