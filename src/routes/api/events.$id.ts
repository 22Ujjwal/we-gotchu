import { createFileRoute } from '@tanstack/react-router'
import { getDeps } from '../../server/events/deps'
import { ApiError, handle, json } from '../../server/events/errors'
import { getEventView } from '../../server/events/service'

export const Route = createFileRoute('/api/events/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handle(async () => {
          const raw = new URL(request.url).searchParams.get('afterSequence')
          const afterSequence = raw === null ? undefined : Number(raw)
          if (afterSequence !== undefined && (!Number.isInteger(afterSequence) || afterSequence < 0)) {
            throw new ApiError(422, 'invalid_input', 'afterSequence must be a non-negative integer.')
          }
          return json(await getEventView(getDeps(), params.id, afterSequence))
        }),
    },
  },
})
