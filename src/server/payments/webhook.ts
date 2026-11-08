import type Stripe from 'stripe'
import type { Payment } from '../../contracts'
import type { Deps } from '../events/deps'
import { ApiError } from '../events/errors'
import type { CheckoutSession, Refund } from './stripe'

// Stripe webhook handling and refunds (contract 0.4, Approval and payment). Server-only.

export type WebhookOutcome =
  | 'refund_updated'
  | 'paid'
  | 'refunded_late_or_revoked'
  | 'duplicate'
  | 'mismatch'
  | 'unknown_session'
  | 'already_processed'
  | 'expired'
  | 'ignored'

function refundState(r: Refund): Payment['refundState'] {
  if (r.status === 'succeeded') return 'succeeded'
  if (r.status === 'failed' || r.status === 'canceled') return 'failed'
  return 'pending'
}

function paymentIntentId(session: CheckoutSession): string | null {
  if (!session.payment_intent) return null
  return typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id
}

async function refund(deps: Deps, payment: Payment, amount: number, reason: string): Promise<Refund> {
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
export async function handleStripeWebhook(deps: Deps, rawBody: string, signature: string | null): Promise<{ outcome: WebhookOutcome; event: Stripe.Event }> {
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
  if (await deps.store.hasStripeEvent(event.id)) return { outcome: 'duplicate', event }
  const outcome = await dispatchStripeEvent(deps, event)
  const fresh = await deps.store.recordStripeEvent(event.id)
  return { outcome: fresh ? outcome : 'duplicate', event }
}

async function dispatchStripeEvent(deps: Deps, event: Stripe.Event): Promise<WebhookOutcome> {
  if (event.type === 'refund.updated' || event.type === 'refund.failed') {
    const incoming = event.data.object
    if (!incoming || typeof incoming.id !== 'string') return 'mismatch'
    const payment = await deps.store.getPaymentByRefundId(incoming.id)
    if (!payment) {
      // Stripe can deliver an update before refunds.create returns and its ID is
      // stored. Only our matching paid payment warrants a retry; unrelated
      // refunds must not acquire a local payment through metadata alone.
      const approvalId = incoming.metadata?.approvalId
      const pending = approvalId && await deps.store.getPaymentByApproval(approvalId)
      const intent = typeof incoming.payment_intent === 'string' ? incoming.payment_intent : incoming.payment_intent?.id
      if (pending && pending.state === 'paid' && (!pending.refundId || pending.refundId === incoming.id) &&
          pending.paymentId === incoming.metadata?.paymentId && intent && pending.paymentIntentId === intent) {
        throw new Error('Refund is awaiting initial persistence; retry delivery')
      }
      return 'ignored'
    }
    // Events can arrive out of order. Read Stripe's current state rather than
    // applying the delivery's historical snapshot or trusting its metadata.
    const current = await deps.stripe.refunds.retrieve(incoming.id)
    const intent = typeof current.payment_intent === 'string' ? current.payment_intent : current.payment_intent?.id
    if (current.id !== payment.refundId || !intent || intent !== payment.paymentIntentId || payment.state !== 'paid') return 'mismatch'
    if (!await deps.store.reconcileRefund({ paymentId: payment.paymentId, refundId: current.id, paymentIntentId: intent, expectedState: payment.refundState, refundState: refundState(current) })) {
      throw new Error('Refund changed during reconciliation; retry delivery')
    }
    return 'refund_updated'
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    return onCheckoutCompleted(deps, event.data.object, new Date(event.created * 1000))
  }
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object
    await deps.store.markPaymentExpired(session.id)
    // Retry repair even when a prior delivery already persisted expiration.
    const eventId = await deps.store.repairExpiredCheckout(session.id)
    if (eventId) await deps.store.appendProgress(eventId, 'system', 'Checkout expired without payment.')
    return 'expired'
  }
  return 'ignored'
}

async function onCheckoutCompleted(deps: Deps, session: CheckoutSession, paidAt: Date): Promise<WebhookOutcome> {
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
  const changed = await deps.store.markPaymentPaid(session.id, intentId, paidAt)
  const paid = changed ?? await deps.store.getPaymentByCheckoutSession(session.id)
  if (!paid || paid.state !== 'paid' || paid.paymentIntentId !== intentId) return 'already_processed'
  const confirmedPaidAt = paid.paidAt ? new Date(paid.paidAt) : paidAt
  // This durable receipt is written only after the handoff finishes. A paid row
  // alone is not evidence that execution or a refund was delivered.
  const receipt = `${paid.paymentId}:paid-handoff`
  if (await deps.store.hasStripeEvent(receipt)) return 'already_processed'
  const current = await deps.store.getEvent(approval.eventId)
  if (!current) throw new Error('Paid event was not found')
  const plan = await deps.store.getPlan(approval.eventId)
  const staleOffer = !!plan?.planningOffer && (plan.planId !== approval.planId || !(await deps.store.validatePlanOffer?.(plan, confirmedPaidAt)))
  const late = staleOffer || approval.revokedAt !== null || confirmedPaidAt.getTime() >= new Date(approval.expiresAt).getTime()
  const started = ['executing', 'booked', 'partially_booked', 'failed'].includes(current.status)
  const moved = !late && !current.cancelRequestedAt &&
    (started || await deps.store.setEventStatus(approval.eventId, ['awaiting_payment'], 'executing'))
  if (!moved && !late && !current.cancelRequestedAt && current.status === 'awaiting_payment') {
    // Another delivery or cancellation changed the event after our read. A lost
    // conditional update is not refund authorization. Let Stripe retry against
    // fresh state; do not acknowledge this delivery or invoke either handoff.
    throw new Error('Payment event changed during handoff; retry delivery')
  }
  if (!moved) return settleUnapprovedPayment(deps, approval.eventId, paid, receipt, staleOffer)
  if (changed) await deps.store.appendProgress(approval.eventId, 'system', `Payment confirmed (${paid.mode}).`)
  // Hooks must be idempotent by approval/payment identity because delivery is at least once.
  await deps.hooks.onPaymentConfirmed({ eventId: approval.eventId, approvalId: approval.approvalId, paymentId: paid.paymentId })
  if (plan?.planningOffer && !(await deps.store.validatePlanOffer?.(plan, confirmedPaidAt))) {
    return settleUnapprovedPayment(deps, approval.eventId, paid, receipt, true)
  }
  await deps.store.recordStripeEvent(receipt)
  return 'paid'
}

async function settleUnapprovedPayment(deps: Deps, eventId: string, paid: Payment, receipt: string, staleOffer: boolean): Promise<WebhookOutcome> {
  if (staleOffer) {
    await deps.store.requestCancel(eventId, deps.now())
    await deps.store.revokeApprovals(eventId, deps.now())
  }
  // An interrupted handoff may already have committed suppliers before the offer changed.
  const attempts = await deps.store.listAttempts(eventId)
  if (attempts.some(attempt => attempt.kind === 'commit' && ['running', 'pending', 'unknown', 'succeeded'].includes(attempt.state))) {
    if (staleOffer) await deps.hooks.startSupplierCancellation({ eventId, paidApprovalIds: [paid.approvalId] })
    const result = await issueFinalRefund(deps, eventId)
    if (!result.ok) throw new Error('Payment cancellation is awaiting supplier settlement')
  } else {
    await refund(deps, paid, paid.amount, 'late_or_revoked')
    if (staleOffer) await deps.store.setEventStatus(eventId, ['canceling'], 'canceled')
  }
  await deps.store.recordStripeEvent(receipt)
  await deps.store.appendProgress(eventId, 'system', 'Payment cancellation refund was requested.')
  return 'refunded_late_or_revoked'
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
  // The idempotent create response may predate a webhook reconciliation.
  const recorded = await deps.store.getPaymentByRefundId(r.id)
  return { ok: true, refundId: r.id, refundState: recorded?.refundState ?? refundState(r), amount, retainedFees }
}
