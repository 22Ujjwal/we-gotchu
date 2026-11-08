import { createFileRoute } from '@tanstack/react-router'
import { handle } from '../../server/events/errors'
import { getPlanningCompanyTools } from '../../server/planning/runtime'

export const Route = createFileRoute('/api/planning/tools')({
  server: { handlers: { POST: ({ request }) => handle(async () => (await getPlanningCompanyTools())(request)) } },
})
