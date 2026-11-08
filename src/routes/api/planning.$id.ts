import { createFileRoute } from '@tanstack/react-router'
import { handle } from '../../server/events/errors'
import { planningGet, planningPost } from '../../server/planning/http'
import { getPlanningDeps } from '../../server/planning/runtime'

export const Route = createFileRoute('/api/planning/$id')({
  server: {
    handlers: {
      GET: ({ params, request }) => handle(async () => planningGet(await getPlanningDeps(), params.id, request)),
      POST: ({ params, request }) => handle(async () => planningPost(await getPlanningDeps(), params.id, request)),
    },
  },
})
