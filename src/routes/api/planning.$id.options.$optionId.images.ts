import { createFileRoute } from '@tanstack/react-router'
import { handle } from '../../server/events/errors'
import { getPlanningDeps } from '../../server/planning/runtime'
import { venueImagesGet } from '../../server/planning/venue-images-http'

export const Route = createFileRoute('/api/planning/$id/options/$optionId/images')({
  server: {
    handlers: {
      GET: ({ params }) => handle(async () => venueImagesGet(await getPlanningDeps(), params.id, params.optionId)),
    },
  },
})
