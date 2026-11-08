import type { Payment } from '../../contracts'
import type { Deps } from '../events/deps'
import { ApiError } from '../events/errors'
import type { CheckoutSessionLike, RefundLike } from './stripe'

// Stripe webhook handling and refunds (contract 0.4, Approval and payment). Server-only.

export type WebhookOutcome =
  | 'paid'
  | 'refunded_late_or_revoked'
  | 'duplicate'
  | 'mismatch'
  | 'unknown_session'
  | 'already_processed'
  | 'expired'
  | 'ignored'

function refundState(r: RefundLike): Payment['refundState'] {
  if (r.status === 'succeeded') return 'succeeded'
  if (r.status === 'failed' || r.status === 'canceled') return 'failed'
  return 'pending'
}

function paymentIntentId(session: CheckoutSessionLike): string | null {
  if (!session.payment_intent) return null
  return typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id
}

async function refund(deps: Deps, payment: Payment, amount: number, reason: string): Promise<RefundLike> {
  if (!payment.paymentIntentId) throw new Error(`payment ${payment.paymentId} has no payment intent to refund`)
  const r = await deps.stripe.refunds.create(
    {
      payment_intent: payment.paymentIntentId,
      amount,
      reason: 'requested_by_customer',
      metadata: { paymentId: payment.paymentId, approvalId: payment.approvalId, reason },
    },
    { idempotencyKey: `${payment.paymentId}:refund` },
  )
  await deps.store.setRefund(payment.paymentId, { refundId: r.id, refundState: refundState(r), refundReason: reason })
  return r
}

/** Verifies and processes one Stripe webhook delivery. Throws ApiError 400 on a bad signature. */
export async function handleStripeWebhook(deps: Deps, rawBody: string, signature: string | null): Promise<WebhookOutcome> {
  const secret = deps.config.stripeWebhookSecret
  if (!secret) throw new ApiError(500, 'webhook_not_configured', 'STRIPE_WEBHOOK_SECRET is not set.')
  if (!signature) throw new ApiError(400, 'invalid_signature', 'Missing Stripe-Signature header.')
  let event
  try {
    event = await deps.stripe.webhooks.constructEventAsync(rawBody, signature, secret)
  } catch {
    throw new ApiError(400, 'invalid_signature', 'Stripe signature verification failed.')
  }

  // Process first and record the event id afterwards, so a crash mid-processing
  // lets Stripe's retry run again. Every step below is idempotent on its own
  // (conditional payment update, refund idempotency key), so a duplicate
  // delivery that races in does no extra work.
  if (await deps.store.hasStripeEvent(event.id)) return 'duplicate'
  const outcome = await dispatchStripeEvent(deps, event)
  const fresh = await deps.store.recordStripeEvent(event.id)
  return fresh ? outcome : 'duplicate'
}

async function dispatchStripeEvent(deps: Deps, event: { type: string; created: number; data: { object: unknown } }): Promise<WebhookOutcome> {
  if (event.type === 'checkout.session.completed') {
    return onCheckoutCompleted(deps, event.data.object as CheckoutSessionLike, new Date(event.created * 1000))
  }
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as CheckoutSessionLike
    const changed = await deps.store.markPaymentExpired(session.id)
    const payment = await deps.store.getPaymentByCheckoutSession(session.id)
    const approval = payment && (await deps.store.getApproval(payment.approvalId))
    if (changed && approval) {
      // The customer can approve again from the same plan.
      await deps.store.setEventStatus(approval.eventId, ['awaiting_payment'], 'plan_ready')
      await deps.store.appendProgress(approval.eventId, 'system', 'Checkout expired without payment.')
    }
    return 'expired'
  }
  return 'ignored'
}

async function onCheckoutCompleted(deps: Deps, session: CheckoutSessionLike, paidAt: Date): Promise<WebhookOutcome> {
  const payment = await deps.store.getPaymentByCheckoutSession(session.id)
  if (!payment) return 'unknown_session'
  const approval = await deps.store.getApproval(payment.approvalId)
  if (!approval) return 'unknown_session'

  const md = session.metadata ?? {}
  const matches =
    session.payment_status === 'paid' &&
    session.amount_total === payment.amount &&
    payment.amount === approval.approvedTotal &&
    session.currency?.toLowerCase() === approval.currency.toLowerCase() &&
    md.approvalId === approval.approvalId &&
    md.eventId === approval.eventId &&
    md.planRevision === String(approval.planRevision)
  if (!matches) {
    console.error('[stripe] completed session does not match its approval', session.id)
    await deps.store.appendProgress(approval.eventId, 'system', 'A payment did not match the approval and was not accepted.')
    return 'mismatch'
  }

  const intentId = paymentIntentId(session)
  if (!intentId) return 'mismatch'
  const changed = await deps.store.markPaymentPaid(session.id, intentId)
  const paid = changed ?? await deps.store.getPaymentByCheckoutSession(session.id)
  if (!paid || paid.state !== 'paid' || paid.paymentIntentId !== intentId) return 'already_processed'
  // This durable receipt is written only after the handoff finishes. A paid row
  // alone is not evidence that execution or a refund was delivered.
  const receipt = `${paid.paymentId}:paid-handoff`
  if (await deps.store.hasStripeEvent(receipt)) return 'already_processed'
  const current = await deps.store.getEvent(approval.eventId)
  if (!current) throw new Error('Paid event was not found')
  const late = approval.revokedAt !== null || paidAt.getTime() >= new Date(approval.expiresAt).getTime()
  const started = ['executing', 'booked', 'partially_booked', 'failed'].includes(current.status)
  const moved = !late && !current.cancelRequestedAt &&
    (started || await deps.store.setEventStatus(approval.eventId, ['awaiting_payment'], 'executing'))
  if (!moved && !late && !current.cancelRequestedAt && current.status === 'awaiting_payment') {
    // Another delivery or cancellation changed the event after our read. A lost
    // conditional update is not refund authorization. Let Stripe retry against
    // fresh state; do not acknowledge this delivery or invoke either handoff.
    throw new Error('Payment event changed during handoff; retry delivery')
  }
  if (!moved) {
    // An interrupted handoff may have already committed suppliers before cancel.
    const attempts = await deps.store.listAttempts(approval.eventId)
    if (attempts.some(a => a.kind === 'commit' && ['running', 'pending', 'unknown', 'succeeded'].includes(a.state))) {
      const result = await issueFinalRefund(deps, approval.eventId)
      if (!result.ok) throw new Error('Payment cancellation is awaiting supplier settlement')
    } else {
      await refund(deps, paid, paid.amount, 'late_or_revoked')
    }
    await deps.store.recordStripeEvent(receipt)
    await deps.store.appendProgress(approval.eventId, 'system', 'Payment cancellation refund was requested.')
    return 'refunded_late_or_revoked'
  }
  if (changed) await deps.store.appendProgress(approval.eventId, 'system', `Payment confirmed (${paid.mode}).`)
  // Hooks must be idempotent by approval/payment identity because delivery is at least once.
  await onPaymentConfirmed(deps, { eventId: approval.eventId, approvalId: approval.approvalId, paymentId: paid.paymentId })
  await deps.store.recordStripeEvent(receipt)
  return 'paid'
}

/** Hook point: starts the execution session for a paid approval. Wired later via Deps.hooks. */
export async function onPaymentConfirmed(deps: Deps, input: { eventId: string; approvalId: string; paymentId: string }): Promise<void> {
  await deps.hooks.onPaymentConfirmed(input)
}

export type FinalRefundResult =
  | { ok: true; refundId: string; refundState: Payment['refundState']; amount: number; retainedFees: number }
  | { ok: false; reason: 'not_found' | 'no_paid_payment' | 'commitments_not_canceled' | 'nothing_to_refund' }

/**
 * After every succeeded commitment has a succeeded cancellation, refunds the paid
 * amount minus retained supplier fees. A cancel attempt's actualAmount is taken as
 * the fee the supplier kept. Records Stripe's refund state; never assumes it arrived.
 */
export async function issueFinalRefund(deps: Deps, eventId: string): Promise<FinalRefundResult> {
  const view = await deps.store.getEventView(eventId)
  if (!view) return { ok: false, reason: 'not_found' }
  const payment = view.payment
  if (!payment || payment.state !== 'paid') return { ok: false, reason: 'no_paid_payment' }

  const attempts = view.attempts.filter((a) => a.approvalId === payment.approvalId)
  if (attempts.some(a => a.kind === 'commit' && ['pending', 'running', 'unknown'].includes(a.state))) {
    return { ok: false, reason: 'commitments_not_canceled' }
  }
  const commits = attempts.filter((a) => a.kind === 'commit' && a.state === 'succeeded')
  const cancels = new Map(attempts.filter((a) => a.kind === 'cancel' && a.state === 'succeeded').map((a) => [a.actionId, a]))
  if (commits.some((c) => !cancels.has(c.actionId))) return { ok: false, reason: 'commitments_not_canceled' }

  const retainedFees = commits.reduce((sum, c) => sum + (cancels.get(c.actionId)?.actualAmount ?? 0), 0)
  const amount = Math.max(0, payment.amount - retainedFees)
  if (amount === 0) return { ok: false, reason: 'nothing_to_refund' }
  const r = await refund(deps, payment, amount, 'customer_cancellation')
  return { ok: true, refundId: r.id, refundState: refundState(r), amount, retainedFees }
}
