import { createFileRoute } from '@tanstack/react-router'
import { getRequestDeps } from '../../server/events/local-runtime'
import { handle, json, readJson } from '../../server/events/errors'
import { getEventView } from '../../server/events/service'
import { getPlanningDeps } from '../../server/planning/runtime'
import { arrangeResearchedEvent } from '../../server/planning/event-handoff'

export const Route = createFileRoute('/api/events/$id/arrange')({
  server: { handlers: { POST: ({ request, params }) => handle(async () => {
    const event = await getEventView(await getRequestDeps(), params.id)
    const view = await arrangeResearchedEvent(await getPlanningDeps(), event, await readJson(request))
    return json({ url: `/planning/${encodeURIComponent(view.id)}` })
  }) } },
})
