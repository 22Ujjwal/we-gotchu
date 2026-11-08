import { createFileRoute } from '@tanstack/react-router'
import { handle } from '../../server/events/errors'
import { planningGet, planningPost } from '../../server/planning/http'
import { getPlanningDeps } from '../../server/planning/runtime'

export const Route = createFileRoute('/api/planning/$id')({
  server: {
    handlers: {
      GET: ({ params }) => handle(() => planningGet(getPlanningDeps(), params.id)),
      POST: ({ params, request }) => handle(() => planningPost(getPlanningDeps(), params.id, request)),
    },
  },
})
