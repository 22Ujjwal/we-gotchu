import { createFileRoute } from '@tanstack/react-router'
import { getRequestDeps } from '../../server/events/local-runtime'
import { handle, json, readJson } from '../../server/events/errors'
import { createEvent } from '../../server/events/service'

export const Route = createFileRoute('/api/events')({
  server: {
    handlers: {
      POST: ({ request }) => handle(async () => json(await createEvent(await getRequestDeps(), await readJson(request)), 201)),
    },
  },
})
