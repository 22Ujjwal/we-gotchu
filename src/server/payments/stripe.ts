import Stripe from 'stripe'

// The slice of Stripe the payment flow uses. Server-only.
// Tests pass a fake; production wraps the real SDK with createStripeAdapter.

export type CheckoutSession = Pick<Stripe.Checkout.Session,
  'id' | 'url' | 'expires_at' | 'amount_total' | 'currency' | 'metadata' | 'payment_status' | 'payment_intent'>
export type Refund = Pick<Stripe.Refund, 'id' | 'status' | 'payment_intent' | 'metadata'>

export interface StripeLike {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams, options: { idempotencyKey: string }): Promise<CheckoutSession>
      retrieve(id: string): Promise<CheckoutSession>
      expire(id: string): Promise<CheckoutSession>
    }
  }
  refunds: {
    retrieve(id: string): Promise<Refund>
    create(params: Stripe.RefundCreateParams, options: { idempotencyKey: string }): Promise<Refund>
  }
  webhooks: {
    constructEventAsync(payload: string, header: string, secret: string): Promise<Stripe.Event>
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
          return client.checkout.sessions.create(params, options)
        },
        async retrieve(id) {
          if (!client) missingKey()
          return client.checkout.sessions.retrieve(id)
        },
        async expire(id) {
          if (!client) missingKey()
          return client.checkout.sessions.expire(id)
        },
      },
    },
    refunds: {
      async retrieve(id) {
        if (!client) missingKey()
        return client.refunds.retrieve(id)
      },
      async create(params, options) {
        if (!client) missingKey()
        return client.refunds.create(params, options)
      },
    },
    webhooks: {
      async constructEventAsync(payload, header, secret) {
        return webhooks.constructEventAsync(payload, header, secret)
      },
    },
  }
}
