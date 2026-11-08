import { createFileRoute } from '@tanstack/react-router'
import { handle } from '../../server/events/errors'
import { planningCollectionPost } from '../../server/planning/http'
import { getPlanningDeps } from '../../server/planning/runtime'

export const Route = createFileRoute('/api/planning')({
  server: {
    handlers: {
      POST: ({ request }) => handle(() => planningCollectionPost(getPlanningDeps(), request)),
    },
  },
})
