import { OpenApprovalExistsError } from '../store'
import { randomUUID } from 'node:crypto'
import {
  assessPlanForApproval,
  Brief,
  buildPlanFromResult,
  CONTRACT_VERSION,
  type Approval,
  type Event,
  type EventView,
  type Payment,
  type Run,
} from '../../contracts'
import type { Deps } from './deps'
import { ApiError } from './errors'

// Customer API handlers (contract 0.4). Server-only. Each takes Deps so tests
// can run them against an in-memory Store and a fake Stripe.

export const APPROVAL_TTL_MS = 31 * 60 * 1000
const BRIEF_FIELDS = Object.keys(Brief.shape) as (keyof Brief)[]

const id = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '')}`

function isAbsent(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
}

function parseBrief(input: unknown): Brief {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const missing = BRIEF_FIELDS.filter((f) => isAbsent(obj[f]))
  if (missing.length > 0) {
    throw new ApiError(422, 'missing_fields', `Missing required fields: ${missing.join(', ')}.`, { missing })
  }
  const parsed = Brief.safeParse(obj)
  if (!parsed.success) {
    throw new ApiError(422, 'invalid_brief', 'The brief has invalid fields.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return parsed.data
}

/** Loads the event and checks it belongs to the signed-in customer. */
async function ownedEvent(deps: Deps, eventId: string): Promise<Event> {
  const customerId = await deps.requireCustomerId()
  const event = await deps.store.getEvent(eventId)
  if (!event) throw new ApiError(404, 'not_found', 'Event not found.')
  if (event.customerId !== customerId) throw new ApiError(403, 'forbidden', 'This event belongs to another customer.')
  return event
}

async function view(deps: Deps, eventId: string, afterSequence?: number): Promise<EventView> {
  const v = await deps.store.getEventView(eventId, afterSequence)
  if (!v) throw new ApiError(404, 'not_found', 'Event not found.')
  return v
}

/** Starts a research session for a run and records its session id. */
async function startRun(deps: Deps, event: Event, run: Run): Promise<void> {
  try {
    const { naiveSessionId } = await deps.research.startResearch({
      contractVersion: CONTRACT_VERSION,
      eventId: event.eventId,
      briefRevision: run.briefRevision,
      runId: run.runId,
      brief: event.brief,
    })
    await deps.store.setRunSession(run.runId, naiveSessionId)
    await deps.store.appendProgress(event.eventId, 'system', `Research started (brief revision ${run.briefRevision}).`)
  } catch (err) {
    // Uncertain outcome: record it on the run so it is reconciled, not silently retried.
    console.error('[research] startResearch failed', err)
    await deps.store.setRunState(run.runId, ['running'], 'unknown')
    await deps.store.appendProgress(event.eventId, 'system', 'Research could not be started; the outcome is unknown.')
    throw new ApiError(502, 'research_start_failed', 'Research could not be started. Try again shortly.')
  }
}

// POST /api/events
export async function createEvent(deps: Deps, body: unknown): Promise<EventView> {
  const customerId = await deps.requireCustomerId()
  const brief = parseBrief(body)
  const { event, run } = await deps.store.createEvent({ customerId, brief })
  await startRun(deps, event, run)
  return view(deps, event.eventId)
}

/** Advances a running research run under a single-flight lease. Errors are logged, not thrown. */
async function advanceRun(deps: Deps, event: Event, run: Run): Promise<void> {
  const claimed = await deps.store.claimRunAdvance(run.runId, deps.now(), deps.config.advanceLeaseMs)
  if (!claimed) return // another poll holds the lease; return stored state
  let lastSequence = claimed.lastSequence
  try {
    const step = await deps.research.advanceResearch({ event, run: claimed })
    if (step.status !== 'done') return
    lastSequence = step.lastSequence
    const published = await deps.store.publishResearchResult(step.result, claimed.advancingUntil)
    if (!published.ok) {
      console.warn('[research] result not stored', published.reason)
      return
    }
    const { result } = step
    if (result.outcome === 'awaiting_input') {
      await deps.store.appendProgress(event.eventId, 'agent', `More information needed: ${result.missing.join(', ') || 'see brief'}.`)
      return
    }
    if (result.outcome !== 'success' && result.outcome !== 'partial') {
      await deps.store.appendProgress(event.eventId, 'agent', `Research ended: ${result.outcome}.`)
      return
    }
    const actionIds = Object.fromEntries(result.candidates.map((c) => [c.candidateId, id('act')]))
    const built = buildPlanFromResult({
      result,
      brief: event.brief,
      planId: id('plan'),
      revision: event.planRevision + 1,
      actionIds,
      executionMode: deps.config.executionMode,
    })
    if (built.ok) {
      await deps.store.savePlan(built.plan)
      await deps.store.setEventStatus(event.eventId, ['researching'], 'plan_ready')
      await deps.store.appendProgress(event.eventId, 'agent', `Plan ready: total ${built.plan.total} ${built.plan.currency}.`)
    } else {
      await deps.store.setEventStatus(event.eventId, ['researching'], 'researched')
      await deps.store.appendProgress(event.eventId, 'agent', `Research finished but no bookable plan: ${built.reason}.`)
    }
  } catch (err) {
    console.error('[research] advance failed', err)
  } finally {
    await deps.store.releaseRunAdvance(run.runId, lastSequence, claimed.advancingUntil)
  }
}

// GET /api/events/:id?afterSequence=N
export async function getEventView(deps: Deps, eventId: string, afterSequence?: number): Promise<EventView> {
  const event = await ownedEvent(deps, eventId)
  if (event.status === 'researching' || event.status === 'needs_input') {
    const run = await deps.store.getCurrentRun(eventId, 'research')
    if (run && run.state === 'running' && run.briefRevision === event.briefRevision) {
      await advanceRun(deps, event, run)
    }
  }
  return view(deps, eventId, afterSequence)
}

// PATCH /api/events/:id/brief
export async function updateBrief(
  deps: Deps,
  eventId: string,
  expectedBriefRevision: unknown,
  changes: unknown,
): Promise<EventView> {
  const event = await ownedEvent(deps, eventId)
  if (typeof expectedBriefRevision !== 'number' || !Number.isInteger(expectedBriefRevision)) {
    throw new ApiError(422, 'invalid_input', 'expectedBriefRevision must be an integer.')
  }
  if (!changes || typeof changes !== 'object') throw new ApiError(422, 'invalid_input', 'changes must be an object.')
  const known = Object.fromEntries(Object.entries(changes).filter(([k]) => (BRIEF_FIELDS as string[]).includes(k)))
  const brief = parseBrief({ ...event.brief, ...known })

  const res = await deps.store.updateBrief({ eventId, expectedBriefRevision, brief })
  if (!res.ok) {
    if (res.reason === 'not_found') throw new ApiError(404, 'not_found', 'Event not found.')
    if (res.reason === 'stale_brief') throw new ApiError(409, 'stale_brief', 'The brief changed since you loaded it. Reload and try again.')
    throw new ApiError(409, 'already_approved', 'The plan is already approved; cancel before changing the brief.')
  }
  const prev = res.previousRun
  if (prev?.naiveSessionId) {
    try {
      await deps.research.cancelResearch(prev.naiveSessionId)
    } catch (err) {
      console.warn('[research] cancel of previous session failed', err)
    }
  }
  await deps.store.setEventStatus(eventId, ['needs_input', 'researched', 'plan_ready', 'failed'], 'researching')
  await deps.store.appendProgress(eventId, 'customer', `Updated the brief (revision ${res.event.briefRevision}).`)
  await startRun(deps, res.event, res.run)
  return view(deps, eventId)
}

export type ApproveResult = { approval: Approval; payment: Payment; checkoutUrl: string }

// POST /api/events/:id/approve
export async function approve(deps: Deps, eventId: string, planId: unknown, planRevision: unknown): Promise<ApproveResult> {
  const event = await ownedEvent(deps, eventId)
  if (typeof planId !== 'string' || typeof planRevision !== 'number') {
    throw new ApiError(422, 'invalid_input', 'planId and planRevision are required.')
  }
  const plan = await deps.store.getPlan(eventId)
  if (!plan || plan.planId !== planId || plan.revision !== planRevision || event.planRevision !== planRevision) {
    throw new ApiError(409, 'stale_plan', 'The plan changed since you loaded it. Reload and review it again.')
  }
  const assessed = assessPlanForApproval(plan)
  if (!assessed.ok) throw new ApiError(422, assessed.errorCode, `The plan cannot be approved: ${assessed.reason}.`)
  if (event.status !== 'plan_ready' && event.status !== 'awaiting_payment') {
    throw new ApiError(409, 'invalid_status', `The event is ${event.status} and cannot be approved.`)
  }

  const now = deps.now()
  const open = await deps.store.findOpenApproval(eventId, planRevision, now)
  if (open && open.payment.state === 'pending') {
    const session = await deps.stripe.checkout.sessions.retrieve(open.payment.checkoutSessionId)
    if (session.url) return { ...open, checkoutUrl: session.url }
  }

  // Approval and Checkout share one expiry, whole seconds because Stripe uses unix seconds.
  const expiresAtSec = Math.floor((now.getTime() + APPROVAL_TTL_MS) / 1000)
  const approval: Approval = {
    approvalId: id('appr'),
    eventId,
    planId: plan.planId,
    planRevision: plan.revision,
    actionIds: plan.actions.map((a) => a.actionId),
    approvedTotal: plan.total,
    currency: plan.currency,
    approvedAt: now.toISOString(),
    expiresAt: new Date(expiresAtSec * 1000).toISOString(),
    revokedAt: null,
  }
  const metadata = { approvalId: approval.approvalId, eventId, planRevision: String(plan.revision) }
  const base = deps.config.appUrl.replace(/\/$/, '')
  const session = await deps.stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: plan.currency,
            unit_amount: plan.total,
            product_data: { name: `${event.brief.eventType} plan (revision ${plan.revision})`, description: 'Service fee: 0' },
          },
        },
      ],
      expires_at: expiresAtSec,
      success_url: `${base}/events/${eventId}?checkout=success`,
      cancel_url: `${base}/events/${eventId}?checkout=canceled`,
      client_reference_id: eventId,
      metadata,
      payment_intent_data: { metadata },
    },
    { idempotencyKey: `${approval.approvalId}:checkout` },
  )
  if (!session.url) throw new ApiError(502, 'checkout_unavailable', 'Stripe did not return a Checkout URL.')

  const payment: Payment = {
    paymentId: id('pay'),
    approvalId: approval.approvalId,
    checkoutSessionId: session.id,
    paymentIntentId: null,
    amount: plan.total,
    currency: plan.currency,
    state: 'pending',
    refundId: null,
    refundState: 'none',
    refundReason: null,
    mode: deps.config.paymentMode,
  }
  try {
    await deps.store.createApproval(approval, payment)
  } catch (err) {
    await deps.stripe.checkout.sessions.expire(session.id).catch(() => undefined)
    if (err instanceof OpenApprovalExistsError) {
      // A concurrent approve won; hand back its Checkout instead of a second one.
      const winner = await deps.store.findOpenApproval(eventId, planRevision, now)
      if (winner && winner.payment.state === 'pending') {
        const existing = await deps.stripe.checkout.sessions.retrieve(winner.payment.checkoutSessionId)
        if (existing.url) return { ...winner, checkoutUrl: existing.url }
      }
      throw new ApiError(409, 'approval_in_progress', 'This plan is already being approved. Reload and try again.')
    }
    throw err
  }
  await deps.store.setEventStatus(eventId, ['plan_ready'], 'awaiting_payment')
  await deps.store.appendProgress(eventId, 'customer', `Approved plan revision ${plan.revision}; awaiting payment.`)
  return { approval, payment, checkoutUrl: session.url }
}

// POST /api/events/:id/cancel
export async function cancel(deps: Deps, eventId: string): Promise<EventView> {
  await ownedEvent(deps, eventId)
  const now = deps.now()
  const requested = await deps.store.requestCancel(eventId, now)
  if (!requested) return view(deps, eventId) // already canceled

  const revoked = await deps.store.revokeApprovals(eventId, now)
  const paidApprovalIds = await deps.store.listPaidApprovalIds(eventId)
  for (const approval of revoked) {
    const payment = await deps.store.getPaymentByApproval(approval.approvalId)
    if (payment?.state === 'pending') {
      try {
        await deps.stripe.checkout.sessions.expire(payment.checkoutSessionId)
      } catch (err) {
        console.warn('[cancel] could not expire Checkout session', payment.checkoutSessionId, err)
      }
    }
  }

  const run = await deps.store.getCurrentRun(eventId, 'research')
  if (run && (run.state === 'running' || run.state === 'awaiting_input')) {
    if (run.naiveSessionId) {
      try {
        await deps.research.cancelResearch(run.naiveSessionId)
      } catch (err) {
        console.warn('[cancel] research session cancel failed', err)
      }
    }
    await deps.store.setRunState(run.runId, ['running', 'awaiting_input'], 'canceled')
  }
  await deps.store.appendProgress(eventId, 'customer', 'Requested cancellation.')

  if (paidApprovalIds.length > 0) {
    await deps.hooks.startSupplierCancellation({ eventId, paidApprovalIds })
  } else {
    // Nothing was paid, so no supplier work or refund can exist.
    await deps.store.setEventStatus(eventId, ['canceling'], 'canceled')
    await deps.store.appendProgress(eventId, 'system', 'Canceled; no payment or supplier commitment existed.')
  }
  return view(deps, eventId)
}
