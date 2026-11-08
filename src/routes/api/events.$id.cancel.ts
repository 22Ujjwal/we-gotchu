import { createFileRoute } from '@tanstack/react-router'
import { getRequestDeps } from '../../server/events/local-runtime'
import { handle, json } from '../../server/events/errors'
import { cancel } from '../../server/events/service'

export const Route = createFileRoute('/api/events/$id/cancel')({
  server: {
    handlers: {
      POST: ({ params }) => handle(async () => json(await cancel(await getRequestDeps(), params.id))),
    },
  },
})
