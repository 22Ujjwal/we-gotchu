import { createFileRoute } from '@tanstack/react-router'
import { getRequestDeps } from '../../server/events/local-runtime'
import { handle, json, readJson } from '../../server/events/errors'
import { updateBrief } from '../../server/events/service'

// Body: { expectedBriefRevision, changes: { ...brief fields } }.
// Brief fields at the top level are also accepted as changes.
export const Route = createFileRoute('/api/events/$id/brief')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        handle(async () => {
          const body = ((await readJson(request)) ?? {}) as Record<string, unknown>
          const { expectedBriefRevision, changes, ...rest } = body
          return json(await updateBrief(await getRequestDeps(), params.id, expectedBriefRevision, changes ?? rest))
        }),
    },
  },
})
