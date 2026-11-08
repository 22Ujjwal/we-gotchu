import Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../events/errors'
import { approve, cancel, createEvent, getEventView } from '../events/service'
import { makeDeps, validBrief, WEBHOOK_SECRET } from '../events/testFakes'
import { handleStripeWebhook, issueFinalRefund } from './webhook'

let seq = 0
function signed(type: string, object: unknown, created = Math.floor(Date.parse('2026-11-08T01:05:00.000Z') / 1000)) {
  const payload = JSON.stringify({ id: `evt_${++seq}`, object: 'event', type, created, data: { object } })
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
  return { payload, header }
}

async function awaitingPayment() {
  const ctx = makeDeps()
  const { event } = await createEvent(ctx.deps, validBrief)
  const view = await getEventView(ctx.deps, event.eventId)
  const res = await approve(ctx.deps, event.eventId, view.plan!.planId, 1)
  const session = {
    id: res.payment.checkoutSessionId,
    object: 'checkout.session',
    amount_total: res.payment.amount,
    currency: res.payment.currency,
    metadata: { approvalId: res.approval.approvalId, eventId: event.eventId, planRevision: '1' },
    payment_status: 'paid',
    payment_intent: 'pi_test_1',
  }
  return { ...ctx, eventId: event.eventId, approval: res.approval, payment: res.payment, session }
}

describe('stripe webhook', () => {
  it('rejects a bad signature with 400', async () => {
    const { deps, session } = await awaitingPayment()
    const { payload } = signed('checkout.session.completed', session)
    const bad = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_wrong' })
    const err = await handleStripeWebhook(deps, payload, bad).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(400)
  })

  it('marks paid, moves to executing, and calls onPaymentConfirmed once (duplicate ignored)', async () => {
    const { deps, store, session, payment, eventId, confirmed } = await awaitingPayment()
    const { payload, header } = signed('checkout.session.completed', session)
    expect(await handleStripeWebhook(deps, payload, header)).toBe('paid')
    expect(await handleStripeWebhook(deps, payload, header)).toBe('duplicate')
    expect(confirmed).toEqual([{ eventId, approvalId: payment.approvalId, paymentId: payment.paymentId }])
    expect(store.payments.get(payment.paymentId)?.state).toBe('paid')
    expect(store.events.get(eventId)?.status).toBe('executing')
  })

  it('retries a concurrent status-transition loser without refunding a valid payment', async () => {
    const { deps, store, stripe, session, eventId, payment, confirmed } = await awaitingPayment()
    const { payload, header } = signed('checkout.session.completed', session)
    const getEvent = store.getEvent.bind(store)
    let readers = 0
    let release!: () => void
    const bothRead = new Promise<void>((resolve) => { release = resolve })
    vi.spyOn(store, 'getEvent').mockImplementation(async (id) => {
      const snapshot = await getEvent(id)
      if (snapshot?.status === 'awaiting_payment' && readers < 2) {
        readers += 1
        if (readers === 2) release()
        await bothRead
      }
      return snapshot
    })

    const outcomes = await Promise.allSettled([
      handleStripeWebhook(deps, payload, header),
      handleStripeWebhook(deps, payload, header),
    ])
    expect(stripe.refundCalls).toHaveLength(0)
    expect(confirmed).toHaveLength(1)
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(store.events.get(eventId)?.status).toBe('executing')
    expect(store.payments.get(payment.paymentId)?.refundId).toBeNull()
    expect(await handleStripeWebhook(deps, payload, header)).toBe('duplicate')
    expect(confirmed).toHaveLength(1)
    expect(stripe.refundCalls).toHaveLength(0)
  })

  it('does not mark a mismatched amount as paid', async () => {
    const { deps, store, session, payment, confirmed } = await awaitingPayment()
    const { payload, header } = signed('checkout.session.completed', { ...session, amount_total: session.amount_total - 1 })
    expect(await handleStripeWebhook(deps, payload, header)).toBe('mismatch')
    expect(store.payments.get(payment.paymentId)?.state).toBe('pending')
    expect(confirmed).toHaveLength(0)
  })

  it('refunds a payment for a revoked approval and starts no supplier work', async () => {
    const { deps, store, stripe, session, payment, eventId, confirmed } = await awaitingPayment()
    await cancel(deps, eventId)
    const { payload, header } = signed('checkout.session.completed', session)
    expect(await handleStripeWebhook(deps, payload, header)).toBe('refunded_late_or_revoked')
    expect(confirmed).toHaveLength(0)
    expect(stripe.refundCalls).toHaveLength(1)
    expect(stripe.refundCalls[0].idempotencyKey).toBe(`${payment.paymentId}:refund`)
    expect(stripe.refundCalls[0].params.amount).toBe(payment.amount)
    const stored = store.payments.get(payment.paymentId)!
    expect(stored.refundReason).toBe('late_or_revoked')
    expect(stored.refundState).toBe('pending')
  })

  it('retries an interrupted refund on redelivery of the same webhook', async () => {
    const { deps, store, stripe, eventId, session, payment, confirmed } = await awaitingPayment()
    await cancel(deps, eventId)
    const { payload, header } = signed('checkout.session.completed', session)
    const create = vi.spyOn(stripe.refunds, 'create').mockRejectedValueOnce(new Error('connection lost'))

    await expect(handleStripeWebhook(deps, payload, header)).rejects.toThrow('connection lost')
    expect(store.payments.get(payment.paymentId)?.state).toBe('paid')
    expect(await handleStripeWebhook(deps, payload, header)).toBe('refunded_late_or_revoked')
    expect(store.payments.get(payment.paymentId)?.refundId).toBeTruthy()
    expect(await handleStripeWebhook(deps, payload, header)).toBe('duplicate')
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1]).toEqual(create.mock.calls[0])
    expect(stripe.refundCalls[0].params.amount).toBe(payment.amount)
    expect(confirmed).toHaveLength(0)
  })

  it('refunds a payment completed after the approval expired', async () => {
    const { deps, stripe, session, approval, confirmed } = await awaitingPayment()
    const late = Math.floor(Date.parse(approval.expiresAt) / 1000) + 1
    const { payload, header } = signed('checkout.session.completed', session, late)
    expect(await handleStripeWebhook(deps, payload, header)).toBe('refunded_late_or_revoked')
    expect(confirmed).toHaveLength(0)
    expect(stripe.refundCalls).toHaveLength(1)
  })

  it('repairs an interrupted expiration when the same webhook is retried', async () => {
    const { deps, store, session, payment, eventId, confirmed, stripe } = await awaitingPayment()
    const { payload, header } = signed('checkout.session.expired', { ...session, payment_status: 'unpaid' })
    vi.spyOn(store, 'setEventStatus').mockRejectedValueOnce(new Error('status unavailable'))

    await expect(handleStripeWebhook(deps, payload, header)).rejects.toThrow('status unavailable')
    expect(store.payments.get(payment.paymentId)?.state).toBe('expired')
    expect(store.events.get(eventId)?.status).toBe('awaiting_payment')
    expect(await handleStripeWebhook(deps, payload, header)).toBe('expired')
    expect(store.events.get(eventId)?.status).toBe('plan_ready')
    expect(await handleStripeWebhook(deps, payload, header)).toBe('duplicate')
    expect(store.progress.filter(p => p.message === 'Checkout expired without payment.')).toHaveLength(1)
    expect(confirmed).toHaveLength(0)
    expect(stripe.refundCalls).toHaveLength(0)
  })

  it.each(['canceled', 'cancel_requested', 'revoked', 'stale_plan', 'new_approval', 'paid'] as const)(
    'does not reopen an event on expiration with %s state', async (state) => {
      const { deps, store, session, payment, eventId, approval } = await awaitingPayment()
      const event = store.events.get(eventId)!
      if (state === 'canceled') await cancel(deps, eventId)
      if (state === 'cancel_requested') event.cancelRequestedAt = deps.now().toISOString()
      if (state === 'revoked') await store.revokeApprovals(eventId, deps.now())
      if (state === 'stale_plan') event.planRevision += 1
      if (state === 'new_approval') {
        await store.createApproval(
          { ...approval, approvalId: 'approval_new', approvedAt: new Date(deps.now().getTime() + 1000).toISOString() },
          { ...payment, paymentId: 'payment_new', approvalId: 'approval_new', checkoutSessionId: 'cs_new' },
        )
      }
      if (state === 'paid') await store.markPaymentPaid(session.id, 'pi_test_1')
      const previousStatus = event.status
      const { payload, header } = signed('checkout.session.expired', { ...session, payment_status: 'unpaid' })
      expect(await handleStripeWebhook(deps, payload, header)).toBe('expired')
      expect(store.events.get(eventId)?.status).toBe(previousStatus)
      expect(store.progress.filter(p => p.message === 'Checkout expired without payment.')).toHaveLength(0)
    },
  )

  it('marks an expired session and returns the event to plan_ready', async () => {
    const { deps, store, session, payment, eventId } = await awaitingPayment()
    const { payload, header } = signed('checkout.session.expired', { ...session, payment_status: 'unpaid' })
    expect(await handleStripeWebhook(deps, payload, header)).toBe('expired')
    expect(store.payments.get(payment.paymentId)?.state).toBe('expired')
    expect(store.events.get(eventId)?.status).toBe('plan_ready')
  })
})

describe('issueFinalRefund', () => {
  it('refunds the paid amount minus retained supplier fees once every commitment is canceled', async () => {
    const { deps, store, stripe, session, payment, approval, eventId } = await awaitingPayment()
    const { payload, header } = signed('checkout.session.completed', session)
    await handleStripeWebhook(deps, payload, header)
    const base = { eventId, approvalId: approval.approvalId, providerReference: 'sim', evidence: null, errorReason: null, mode: 'simulated' as const, updatedAt: '2026-11-08T02:00:00.000Z' }
    const actionId = approval.actionIds[0]
    await store.insertAttempt({ ...base, attemptId: 'a1', actionId, kind: 'commit', executionKey: `${approval.approvalId}:${actionId}:commit`, state: 'succeeded', actualAmount: 30000 })
    expect(await issueFinalRefund(deps, eventId)).toEqual({ ok: false, reason: 'commitments_not_canceled' })
    await store.insertAttempt({ ...base, attemptId: 'a2', actionId, kind: 'cancel', executionKey: `${approval.approvalId}:${actionId}:cancel`, state: 'succeeded', actualAmount: 1000 })
    const res = await issueFinalRefund(deps, eventId)
    expect(res).toMatchObject({ ok: true, amount: payment.amount - 1000, retainedFees: 1000, refundState: 'pending' })
    expect(stripe.refundCalls.at(-1)?.idempotencyKey).toBe(`${payment.paymentId}:refund`)
  })
})

describe('interrupted payment delivery', () => {
  it('retries an execution handoff after marking the payment paid', async () => {
    const { deps, session, confirmed } = await awaitingPayment()
    const { payload, header } = signed('checkout.session.completed', session)
    const original = deps.hooks.onPaymentConfirmed
    let calls = 0
    deps.hooks.onPaymentConfirmed = async args => {
      if (++calls === 1) throw new Error('execution unavailable')
      return original(args)
    }
    await expect(handleStripeWebhook(deps, payload, header)).rejects.toThrow('execution unavailable')
    expect(await handleStripeWebhook(deps, payload, header)).toBe('paid')
    expect(confirmed).toHaveLength(1)
    expect(await handleStripeWebhook(deps, payload, header)).toBe('duplicate')
  })

  it('retries a failed refund after marking the payment paid', async () => {
    const { deps, session, eventId, stripe } = await awaitingPayment()
    await cancel(deps, eventId)
    const { payload, header } = signed('checkout.session.completed', session)
    const original = deps.stripe.refunds.create
    let calls = 0
    deps.stripe.refunds.create = async (...args) => {
      if (++calls === 1) throw new Error('refund unavailable')
      return original(...args)
    }
    await expect(handleStripeWebhook(deps, payload, header)).rejects.toThrow('refund unavailable')
    expect(await handleStripeWebhook(deps, payload, header)).toBe('refunded_late_or_revoked')
    expect(stripe.refundCalls).toHaveLength(1)
  })
})
