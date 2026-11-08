import { createFileRoute } from '@tanstack/react-router'
import { getDeps } from '../../server/events/deps'
import { handle, json, readJson } from '../../server/events/errors'
import { createEvent } from '../../server/events/service'

export const Route = createFileRoute('/api/events')({
  server: {
    handlers: {
      POST: ({ request }) => handle(async () => json(await createEvent(getDeps(), await readJson(request)), 201)),
    },
  },
})
