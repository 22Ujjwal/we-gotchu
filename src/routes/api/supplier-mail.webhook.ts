import { createFileRoute } from '@tanstack/react-router'
import { handle } from '../../server/events/errors'
import { getSupplierMailWebhook } from '../../server/planning/runtime'

export const Route = createFileRoute('/api/supplier-mail/webhook')({
  server: { handlers: { POST: ({ request }) => handle(async () => (await getSupplierMailWebhook())(request)) } },
})
