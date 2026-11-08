import { createFileRoute } from '@tanstack/react-router'
import { handle } from '../../server/events/errors'
import { getPlanningCompanyTools } from '../../server/planning/runtime'
import { authorizeCompanyTransport } from '../../server/planning/company-tools'

export const Route = createFileRoute('/api/planning/tools')({
  server: { handlers: { POST: ({ request }) => handle(async () => {
    authorizeCompanyTransport(request)
    return (await getPlanningCompanyTools())(request)
  }) } },
})
