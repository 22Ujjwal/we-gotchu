import { createFileRoute } from '@tanstack/react-router'
import { getDeps } from '../../server/events/deps'
import { handle, json } from '../../server/events/errors'
import { cancel } from '../../server/events/service'

export const Route = createFileRoute('/api/events/$id/cancel')({
  server: {
    handlers: {
      POST: ({ params }) => handle(async () => json(await cancel(getDeps(), params.id))),
    },
  },
})
