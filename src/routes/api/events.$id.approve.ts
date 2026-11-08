import { createFileRoute } from '@tanstack/react-router'
import { getDeps } from '../../server/events/deps'
import { handle, json, readJson } from '../../server/events/errors'
import { approve } from '../../server/events/service'

// Body: { planId, planRevision }. Returns { approval, payment, checkoutUrl }.
export const Route = createFileRoute('/api/events/$id/approve')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        handle(async () => {
          const body = ((await readJson(request)) ?? {}) as Record<string, unknown>
          return json(await approve(getDeps(), params.id, body.planId, body.planRevision))
        }),
    },
  },
})
