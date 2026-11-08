import { notifyPlanningPaymentConfirmed } from '../../server/planning/runtime'
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
          const { outcome, event } = await handleStripeWebhook(await getRequestDeps(), raw, request.headers.get('stripe-signature'))
          // The handler above verifies the raw payload before any notification can run.
          if (outcome === 'paid' || outcome === 'already_processed' || outcome === 'duplicate') {
            if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')
              && typeof event.data?.object?.id === 'string') await notifyPlanningPaymentConfirmed(event.data.object.id)
          }
          return json({ received: true, outcome })
        }),
    },
  },
})
