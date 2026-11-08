import Stripe from 'stripe'

// The slice of Stripe the payment flow uses. Server-only.
// Tests pass a fake; production wraps the real SDK with createStripeAdapter.

export type CheckoutSessionLike = {
  id: string
  url: string | null
  expires_at: number
  amount_total: number | null
  currency: string | null
  metadata: Record<string, string> | null
  payment_status: string
  payment_intent: string | { id: string } | null
}

export type StripeEventLike = {
  livemode?: boolean
  id: string
  type: string
  created: number
  data: { object: unknown }
}

export type CheckoutCreateParams = {
  mode: 'payment'
  line_items: Array<{
    quantity: number
    price_data: { currency: string; unit_amount: number; product_data: { name: string; description?: string } }
  }>
  expires_at: number
  success_url: string
  cancel_url: string
  client_reference_id: string
  metadata: Record<string, string>
  payment_intent_data: { metadata: Record<string, string> }
}

export type RefundCreateParams = {
  payment_intent: string
  amount: number
  reason: 'requested_by_customer'
  metadata: Record<string, string>
}

export type RefundLike = { id: string; status: string | null; payment_intent?: string | { id: string } | null; metadata?: Record<string, string> | null }

export interface StripeLike {
  checkout: {
    sessions: {
      create(params: CheckoutCreateParams, options: { idempotencyKey: string }): Promise<CheckoutSessionLike>
      retrieve(id: string): Promise<CheckoutSessionLike>
      expire(id: string): Promise<CheckoutSessionLike>
    }
  }
  refunds: {
    retrieve(id: string): Promise<RefundLike>
    create(params: RefundCreateParams, options: { idempotencyKey: string }): Promise<RefundLike>
  }
  webhooks: {
    constructEventAsync(payload: string, header: string, secret: string): Promise<StripeEventLike>
  }
}

function toSession(s: Stripe.Checkout.Session): CheckoutSessionLike {
  return {
    id: s.id,
    url: s.url,
    expires_at: s.expires_at,
    amount_total: s.amount_total,
    currency: s.currency,
    metadata: s.metadata,
    payment_status: s.payment_status,
    payment_intent: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent ? { id: s.payment_intent.id } : null,
  }
}

function missingKey(): never {
  throw new Error('STRIPE_SECRET_KEY is not set; Stripe calls are unavailable.')
}

/** Wraps the real Stripe SDK. Webhook verification works without a secret key. */
export function createStripeAdapter(secretKey: string | undefined): StripeLike {
  if (secretKey?.startsWith('sk_live_') || secretKey?.startsWith('rk_live_')) {
    throw new Error('Stripe payments are sandbox-only; use a test key instead of a live STRIPE_SECRET_KEY.')
  }
  const client = secretKey ? new Stripe(secretKey) : null
  const webhooks = Stripe.webhooks
  return {
    checkout: {
      sessions: {
        async create(params, options) {
          if (!client) missingKey()
          return toSession(await client.checkout.sessions.create(params, options))
        },
        async retrieve(id) {
          if (!client) missingKey()
          return toSession(await client.checkout.sessions.retrieve(id))
        },
        async expire(id) {
          if (!client) missingKey()
          return toSession(await client.checkout.sessions.expire(id))
        },
      },
    },
    refunds: {
      async retrieve(id) {
        if (!client) missingKey()
        const r = await client.refunds.retrieve(id)
        return { id: r.id, status: r.status, payment_intent: typeof r.payment_intent === 'string' ? r.payment_intent : r.payment_intent ? { id: r.payment_intent.id } : null }
      },
      async create(params, options) {
        if (!client) missingKey()
        const r = await client.refunds.create(params, options)
        return { id: r.id, status: r.status }
      },
    },
    webhooks: {
      async constructEventAsync(payload, header, secret) {
        const e = await webhooks.constructEventAsync(payload, header, secret)
        return { id: e.id, type: e.type, livemode: e.livemode, created: e.created, data: { object: e.data.object } }
      },
    },
  }
}
