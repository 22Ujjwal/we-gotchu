import { createFileRoute } from '@tanstack/react-router'
import { getArrangeApp } from '#/server/arrange/runtime'
import { handle } from '#/server/events/errors'

export const Route = createFileRoute('/api/arrange/stripe/webhook')({
  server: { handlers: { POST: ({ request }) => handle(async () => (await getArrangeApp()).handleStripeWebhook(request)) } },
})
