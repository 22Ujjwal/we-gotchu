import { createFileRoute } from '@tanstack/react-router'
import { getRequestDeps } from '../../server/events/local-runtime'
import { handle, json } from '../../server/events/errors'
import { handleStripeWebhook } from '../../server/payments/webhook'

// Stripe provider endpoint: no customer session; authenticity comes from the signature.
export const Route = createFileRoute('/api/stripe/webhook')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handle(async () => {
          const raw = await request.text()
          const outcome = await handleStripeWebhook(await getRequestDeps(), raw, request.headers.get('stripe-signature'))
          return json({ received: true, outcome })
        }),
    },
  },
})
