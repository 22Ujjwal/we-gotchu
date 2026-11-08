import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { createStripeAdapter } from './stripe'

describe('sandbox-only Stripe adapter', () => {
  it.each(['sk_live_not_a_real_key', 'rk_live_not_a_real_key'])(
    'rejects a live credential before exposing payment operations: %s',
    (key) => {
      expect(() => createStripeAdapter(key)).toThrow(/sandbox-only/i)
    },
  )

  it.each(['sk_test_not_a_real_key', 'rk_test_not_a_real_key'])(
    'permits sandbox credentials: %s',
    (key) => {
      expect(() => createStripeAdapter(key)).not.toThrow()
    },
  )

  it('verifies signed webhook payloads without an API key', async () => {
    const secret = 'whsec_test_only'
    const event = { id: 'evt_test', type: 'checkout.session.completed', created: 1, data: { object: { id: 'cs_test' } } }
    const payload = JSON.stringify(event)
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret })
    const adapter = createStripeAdapter(undefined)

    await expect(adapter.webhooks.constructEventAsync(payload, header, secret)).resolves.toEqual(event)
    await expect(adapter.checkout.sessions.retrieve('cs_test')).rejects.toThrow(/STRIPE_SECRET_KEY is not set/)
  })
})
