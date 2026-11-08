import { createFileRoute } from '@tanstack/react-router'
import { handle } from '../../server/events/errors'
import { getPlanningCompanyWebhook } from '../../server/planning/runtime'

export const Route = createFileRoute('/api/planning/company-webhook')({
  server: { handlers: { POST: ({ request }) => handle(async () => (await getPlanningCompanyWebhook())(request)) } },
})
