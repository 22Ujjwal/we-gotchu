import { createHash } from 'node:crypto'
import { ApiError, handle, json } from '../events/errors'
import { createStripeAdapter, type CheckoutSessionLike, type StripeLike } from '../payments/stripe'
import { LedgerRefusal, type EventLedger } from './ledger'

export function createArrangePayments(deps: { ledger: EventLedger; stripe?: StripeLike; appUrl?: string; webhookSecret?: string; flush: (eventId: string) => Promise<void> }) {
  const { ledger, stripe } = deps
  return {
    async createCheckout(customerId: string, eventId: string, offerId: string) {
      if (!stripe || !deps.appUrl) throw new ApiError(503, 'payment_unavailable', 'Payment is not available yet. Please try again later.')
      const checkout = await ledger.authorizeCheckout(customerId, eventId, offerId)
      if (checkout.expiresAt! <= Date.now()) throw new ApiError(409, 'checkout_expired', 'This payment link has expired. Please contact us before making a payment.')
      if (checkout.sessionId && checkout.url) return checkout
      const url = new URL(`/arrange/events/${encodeURIComponent(eventId)}`, deps.appUrl).href
      const metadata = { eventId, operationId: checkout.id, approvalId: checkout.approvalId, offerId }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', line_items: [{ quantity: 1, price_data: { currency: checkout.currency.toLowerCase(), unit_amount: checkout.amountMinor, product_data: { name: 'Your event plan' } } }],
        expires_at: Math.floor(checkout.expiresAt! / 1000), success_url: url, cancel_url: url,
        client_reference_id: eventId, metadata, payment_intent_data: { metadata },
      }, { idempotencyKey: `checkout:${checkout.id}` })
      if (!session.url || session.amount_total !== checkout.amountMinor || session.currency?.toUpperCase() !== checkout.currency) throw new Error('Stripe returned a different checkout amount')
      return ledger.recordCheckout(eventId, checkout.id, session.id, session.url, session.expires_at * 1000)
    },
    handleStripeWebhook(request: Request): Promise<Response> {
      return handle(async () => {
        if (!stripe || !deps.webhookSecret) throw new ApiError(503, 'payment_unavailable', 'Payment verification is not configured.')
        const signature = request.headers.get('stripe-signature')
        if (!signature) throw new ApiError(400, 'invalid_signature', 'Missing payment signature.')
        let event
        try { event = await stripe.webhooks.constructEventAsync(await request.text(), signature, deps.webhookSecret) }
        catch { throw new ApiError(400, 'invalid_signature', 'Invalid payment signature.') }
        if (event.livemode !== false) throw new ApiError(400, 'live_payment_refused', 'Only sandbox payments are accepted.')
        if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return json({ received: true, outcome: 'ignored' })
        const session = event.data.object as CheckoutSessionLike
        if (session.payment_status !== 'paid') return json({ received: true, outcome: 'pending' })
        const eventId = session.metadata?.eventId
        const operationId = session.metadata?.operationId
        const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
        if (!eventId || !operationId || !intent || !Number.isSafeInteger(session.amount_total) || !session.currency) throw new ApiError(422, 'payment_mismatch', 'Payment details are incomplete.')
        try {
          const facts = await ledger.readCommerce(eventId)
          const authorized = facts.checkout
          if (!authorized || authorized.id !== operationId || authorized.amountMinor !== session.amount_total || authorized.currency !== session.currency.toUpperCase() || authorized.approvalId !== session.metadata?.approvalId || authorized.offerId !== session.metadata?.offerId) throw new LedgerRefusal('payment_mismatch', 'Payment does not match the approved offer.')
          // A signed event may arrive before checkout creation returns to us.
          if (!authorized.sessionId) await ledger.recordCheckout(eventId, operationId, session.id, session.url ?? '', session.expires_at * 1000)
          await ledger.recordPayment(eventId, { providerEventId: event.id, checkoutId: session.id, operationId, amountMinor: session.amount_total!, currency: session.currency.toUpperCase(), paymentIntentId: intent })
        } catch (error) {
          if (error instanceof LedgerRefusal) throw new ApiError(422, error.code, error.message)
          throw error
        }
        try { await deps.flush(eventId) }
        catch { throw new ApiError(503, 'delivery_pending', 'Payment is recorded; the event lead will receive it when delivery retries.') }
        return json({ received: true, outcome: 'paid' })
      })
    },
  }
}

// The local gate fakes Checkout creation but uses the real Stripe signature verifier.
export function createLocalStripe(): StripeLike {
  const verifier = createStripeAdapter(undefined)
  const sessions = new Map<string, CheckoutSessionLike>()
  return {
    ...verifier,
    checkout: { sessions: {
      async create(params, options) {
        const sessionId = `cs_test_${createHash('sha256').update(options.idempotencyKey).digest('hex').slice(0, 24)}`
        const existing = sessions.get(sessionId)
        if (existing) return existing
        const session: CheckoutSessionLike = { id: sessionId, url: `${params.success_url}?checkout=${sessionId}`, expires_at: params.expires_at, amount_total: params.line_items.reduce((sum, line) => sum + line.quantity * line.price_data.unit_amount, 0), currency: params.line_items[0].price_data.currency, metadata: params.metadata, payment_status: 'unpaid', payment_intent: null }
        sessions.set(sessionId, session)
        return session
      },
      async retrieve(sessionId) { const session = sessions.get(sessionId); if (!session) throw new Error('Unknown local checkout'); return session },
      async expire(sessionId) { const session = sessions.get(sessionId); if (!session) throw new Error('Unknown local checkout'); session.expires_at = 0; return session },
    } },
  }
}
