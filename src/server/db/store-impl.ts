import { createResearchCheckpointStore } from './research-checkpoints'
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import {
  Approval,
  Attempt,
  Event,
  EventView,
  Payment,
  Plan,
  ProgressEntry,
  ResearchResult,
  Run,
  canTransitionAttempt,
  type EventStatus,
} from '../../contracts'
import { ApprovalCanceledError, OpenApprovalExistsError, type Store } from '../store'
import { approvals, attempts, events, payments, plans, progressEntries, researchResults, runs, schema, stripeEvents } from './schema'

// Store implementation over Drizzle. Works with any Postgres driver Drizzle
// supports (Neon serverless Pool in production, PGlite in tests).
//
// Every invariant is a conditional write (UPDATE ... WHERE <expected state>
// RETURNING) or a uniqueness constraint (INSERT ... ON CONFLICT DO NOTHING).
// Reads that follow a failed write only explain *why* it failed; they never
// decide whether a write happens.

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '')}`
const iso = (d: Date | null) => (d === null ? null : d.toISOString())

// Thrown inside a transaction to roll it back with a typed reason.
class Abort<R extends string> extends Error {
  constructor(readonly reason: R) {
    super(reason)
  }
}

type EventRow = typeof events.$inferSelect
type RunRow = typeof runs.$inferSelect
type ResultRow = typeof researchResults.$inferSelect
type PlanRow = typeof plans.$inferSelect
type ApprovalRow = typeof approvals.$inferSelect
type PaymentRow = typeof payments.$inferSelect
type AttemptRow = typeof attempts.$inferSelect
type ProgressRow = typeof progressEntries.$inferSelect

const toEvent = (r: EventRow): Event =>
  Event.parse({
    eventId: r.id,
    customerId: r.customerId,
    brief: r.brief,
    briefRevision: r.briefRevision,
    status: r.status,
    planRevision: r.planRevision,
    cancelRequestedAt: iso(r.cancelRequestedAt),
    progressSequence: r.progressSequence,
    createdAt: r.createdAt.toISOString(),
  })

const toRun = (r: RunRow): Run =>
  Run.parse({
    runId: r.id,
    eventId: r.eventId,
    phase: r.phase,
    briefRevision: r.briefRevision,
    idempotencyKey: r.idempotencyKey,
    naiveSessionId: r.naiveSessionId,
    lastSequence: r.lastSequence,
    state: r.state,
    advancingUntil: iso(r.advancingUntil),
    correctionsUsed: r.correctionsUsed,
    createdAt: r.createdAt.toISOString(),
  })

const toResult = (r: ResultRow): ResearchResult => ResearchResult.parse({ ...r.data, superseded: r.superseded })

const toPlan = (r: PlanRow): Plan => Plan.parse(r.data)

const toApproval = (r: ApprovalRow): Approval =>
  Approval.parse({
    approvalId: r.id,
    eventId: r.eventId,
    planId: r.planId,
    planRevision: r.planRevision,
    actionIds: r.actionIds,
    approvedTotal: r.approvedTotal,
    currency: r.currency,
    approvedAt: r.approvedAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    revokedAt: iso(r.revokedAt),
  })

const toPayment = (r: PaymentRow): Payment =>
  Payment.parse({
    paymentId: r.id,
    approvalId: r.approvalId,
    checkoutSessionId: r.checkoutSessionId,
    paymentIntentId: r.paymentIntentId,
    amount: r.amount,
    currency: r.currency,
    state: r.state,
    refundId: r.refundId,
    refundState: r.refundState,
    refundReason: r.refundReason,
    mode: r.mode,
  })

const toAttempt = (r: AttemptRow): Attempt =>
  Attempt.parse({
    attemptId: r.id,
    eventId: r.eventId,
    actionId: r.actionId,
    approvalId: r.approvalId,
    kind: r.kind,
    executionKey: r.executionKey,
    state: r.state,
    providerReference: r.providerReference,
    actualAmount: r.actualAmount,
    evidence: r.evidence,
    errorReason: r.errorReason,
    mode: r.mode,
    updatedAt: r.updatedAt.toISOString(),
  })

const toProgress = (r: ProgressRow): ProgressEntry =>
  ProgressEntry.parse({
    eventId: r.eventId,
    sequence: r.sequence,
    actor: r.actor,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
  })

const RUN_STATE_FOR_OUTCOME: Record<ResearchResult['outcome'], Run['state']> = {
  success: 'succeeded',
  partial: 'partial',
  awaiting_input: 'awaiting_input',
  failed: 'failed',
  canceled: 'canceled',
}

const EVENT_STATUS_FOR_OUTCOME: Partial<Record<ResearchResult['outcome'], EventStatus>> = {
  awaiting_input: 'needs_input',
  failed: 'failed',
  canceled: 'canceled',
}

export function createStore(db: Db): Store {
  const first = <T>(rows: T[]): T | null => rows[0] ?? null

  const getEvent = async (eventId: string) => {
    const row = first(await db.select().from(events).where(eq(events.id, eventId)))
    return row ? toEvent(row) : null
  }

  const getRun = async (runId: string) => {
    const row = first(await db.select().from(runs).where(eq(runs.id, runId)))
    return row ? toRun(row) : null
  }

  const getPlan = async (eventId: string) => {
    const row = first(
      await db
        .select()
        .from(plans)
        .where(and(eq(plans.eventId, eventId), eq(plans.dropped, false)))
        .orderBy(desc(plans.revision))
        .limit(1),
    )
    return row ? toPlan(row) : null
  }

  const listAttempts = async (eventId: string) =>
    (await db.select().from(attempts).where(eq(attempts.eventId, eventId)).orderBy(asc(attempts.seq))).map(toAttempt)

  return {
    researchCheckpoints: createResearchCheckpointStore(db),
    async createEvent({ customerId, brief }) {
      const eventId = newId('evt')
      const now = new Date()
      return db.transaction(async (tx) => {
        const [e] = await tx
          .insert(events)
          .values({ id: eventId, customerId, brief, briefRevision: 1, status: 'researching', createdAt: now })
          .returning()
        const [r] = await tx
          .insert(runs)
          .values({
            id: newId('run'),
            eventId,
            phase: 'research',
            briefRevision: 1,
            idempotencyKey: `${eventId}:research:1`,
            state: 'running',
            createdAt: now,
          })
          .returning()
        return { event: toEvent(e), run: toRun(r) }
      })
    },

    getEvent,

    async getEventView(eventId, afterSequence = 0) {
      const event = await getEvent(eventId)
      if (!event) return null
      const run = first(await db.select().from(runs).where(eq(runs.eventId, eventId)).orderBy(desc(runs.seq)).limit(1))
      const result = first(
        await db
          .select()
          .from(researchResults)
          .where(and(eq(researchResults.eventId, eventId), eq(researchResults.superseded, false)))
          .orderBy(desc(researchResults.seq))
          .limit(1),
      )
      const approval = first(
        await db.select().from(approvals).where(eq(approvals.eventId, eventId)).orderBy(desc(approvals.approvedAt)).limit(1),
      )
      const payment = approval ? first(await db.select().from(payments).where(eq(payments.approvalId, approval.id))) : null
      const progress = await db
        .select()
        .from(progressEntries)
        .where(and(eq(progressEntries.eventId, eventId), gt(progressEntries.sequence, afterSequence)))
        .orderBy(asc(progressEntries.sequence))
      return EventView.parse({
        event,
        run: run ? toRun(run) : null,
        researchResult: result ? toResult(result) : null,
        plan: await getPlan(eventId),
        approval: approval ? toApproval(approval) : null,
        payment: payment ? toPayment(payment) : null,
        attempts: await listAttempts(eventId),
        progress: progress.map(toProgress),
      })
    },

    async updateBrief({ eventId, expectedBriefRevision, brief }) {
      try {
        return await db.transaction(async (tx) => {
          // Locks the event row; concurrent updates on the same revision block
          // here and then see a changed brief_revision.
          const [e] = await tx
            .update(events)
            .set({ brief, briefRevision: sql`${events.briefRevision} + 1`, status: 'researching' })
            .where(
              and(
                eq(events.id, eventId),
                eq(events.briefRevision, expectedBriefRevision),
                sql`not exists (select 1 from ${approvals} a join ${plans} p on p.id = a.plan_id
                    where a.event_id = ${events.id} and a.plan_revision = ${events.planRevision}
                      and a.revoked_at is null and p.dropped = false)`,
              ),
            )
            .returning()
          if (!e) {
            const current = first(await tx.select().from(events).where(eq(events.id, eventId)))
            if (!current) throw new Abort('not_found')
            if (current.briefRevision !== expectedBriefRevision) throw new Abort('stale_brief')
            throw new Abort('already_approved')
          }
          await tx
            .update(researchResults)
            .set({ superseded: true })
            .where(and(eq(researchResults.eventId, eventId), eq(researchResults.superseded, false)))
          await tx.update(plans).set({ dropped: true }).where(and(eq(plans.eventId, eventId), eq(plans.dropped, false)))

          const prev = first(
            await tx
              .select()
              .from(runs)
              .where(and(eq(runs.eventId, eventId), eq(runs.phase, 'research')))
              .orderBy(desc(runs.seq))
              .limit(1),
          )
          let previousRun: Run | null = prev ? toRun(prev) : null
          if (prev) {
            const [canceled] = await tx
              .update(runs)
              .set({ state: 'canceled', advancingUntil: null })
              .where(and(eq(runs.id, prev.id), inArray(runs.state, ['running', 'awaiting_input'])))
              .returning()
            if (canceled) previousRun = toRun(canceled)
          }
          const [r] = await tx
            .insert(runs)
            .values({
              id: newId('run'),
              eventId,
              phase: 'research',
              briefRevision: e.briefRevision,
              idempotencyKey: `${eventId}:research:${e.briefRevision}`,
              state: 'running',
              createdAt: new Date(),
            })
            .returning()
          return { ok: true as const, event: toEvent(e), run: toRun(r), previousRun }
        })
      } catch (err) {
        if (err instanceof Abort) return { ok: false as const, reason: err.reason as 'not_found' | 'stale_brief' | 'already_approved' }
        throw err
      }
    },

    async setEventStatus(eventId, from, to, expectedBriefRevision) {
      if (from.length === 0) return false
      const rows = await db
        .update(events)
        .set({ status: to })
        .where(and(eq(events.id, eventId), inArray(events.status, [...from]),
          expectedBriefRevision === undefined ? undefined : eq(events.briefRevision, expectedBriefRevision)))
        .returning({ id: events.id })
      return rows.length > 0
    },

    async requestCancel(eventId, at) {
      const [e] = await db
        .update(events)
        .set({ cancelRequestedAt: sql`coalesce(${events.cancelRequestedAt}, ${at.toISOString()}::timestamptz)`, status: 'canceling' })
        .where(and(eq(events.id, eventId), ne(events.status, 'canceled')))
        .returning()
      return e ? toEvent(e) : null
    },

    getRun,

    async getCurrentRun(eventId, phase) {
      const row = first(
        await db
          .select()
          .from(runs)
          .where(and(eq(runs.eventId, eventId), eq(runs.phase, phase)))
          .orderBy(desc(runs.seq))
          .limit(1),
      )
      return row ? toRun(row) : null
    },

    async createRun({ eventId, phase, briefRevision, idempotencyKey }) {
      const [inserted] = await db
        .insert(runs)
        .values({ id: newId('run'), eventId, phase, briefRevision, idempotencyKey, state: 'running', createdAt: new Date() })
        .onConflictDoNothing({ target: runs.idempotencyKey })
        .returning()
      if (inserted) return { run: toRun(inserted), existing: false }
      const [existing] = await db.select().from(runs).where(eq(runs.idempotencyKey, idempotencyKey))
      return { run: toRun(existing), existing: true }
    },

    async setRunSession(runId, naiveSessionId) {
      await db.update(runs).set({ naiveSessionId }).where(eq(runs.id, runId))
    },

    async claimRunAdvance(runId, now, leaseMs) {
      const [r] = await db
        .update(runs)
        .set({ advancingUntil: new Date(now.getTime() + leaseMs) })
        .where(
          and(eq(runs.id, runId), eq(runs.state, 'running'), or(isNull(runs.advancingUntil), lte(runs.advancingUntil, now))),
        )
        .returning()
      return r ? toRun(r) : null
    },

    async releaseRunAdvance(runId, lastSequence, lease) {
      await db
        .update(runs)
        .set({ advancingUntil: null, lastSequence: sql`greatest(${runs.lastSequence}, ${lastSequence})` })
        .where(and(eq(runs.id, runId), lease ? eq(runs.advancingUntil, new Date(lease)) : undefined))
    },

    async recordCorrection(runId) {
      const rows = await db
        .update(runs)
        .set({ correctionsUsed: 1 })
        .where(and(eq(runs.id, runId), eq(runs.correctionsUsed, 0)))
        .returning({ id: runs.id })
      return rows.length > 0
    },

    async setRunState(runId, from, to) {
      if (from.length === 0) return false
      const rows = await db
        .update(runs)
        .set({ state: to })
        .where(and(eq(runs.id, runId), inArray(runs.state, [...from])))
        .returning({ id: runs.id })
      return rows.length > 0
    },

    async publishResearchResult(input, lease, lastSequence = 0) {
      const result = ResearchResult.parse(input)
      const nextStatus = EVENT_STATUS_FOR_OUTCOME[result.outcome]
      type R = 'stale_brief' | 'run_not_active' | 'duplicate' | 'not_found'
      try {
        await db.transaction(async (tx) => {
          // 1. Lock the event, only if the result is for its current brief
          //    revision. Lock order (event, then run) matches updateBrief.
          const [e] = await tx
            .update(events)
            .set({ status: nextStatus ?? sql`${events.status}` })
            .where(and(eq(events.id, result.eventId), eq(events.briefRevision, result.briefRevision), isNull(events.cancelRequestedAt)))
            .returning({ id: events.id })
          if (!e) throw new Abort<R>('stale_brief')
          // 2. The run must be this event's research run, still running, and for
          //    the same brief revision (equal to the locked event's).
          const [r] = await tx
            .update(runs)
            .set({ state: RUN_STATE_FOR_OUTCOME[result.outcome], advancingUntil: null,
              lastSequence: sql`greatest(${runs.lastSequence}, ${lastSequence})` })
            .where(
              and(
                eq(runs.id, result.runId),
                eq(runs.eventId, result.eventId),
                eq(runs.phase, 'research'),
                eq(runs.state, 'running'),
                eq(runs.briefRevision, result.briefRevision),
                lease ? eq(runs.advancingUntil, new Date(lease)) : undefined,
                lease ? gt(runs.advancingUntil, new Date()) : undefined,
              ),
            )
            .returning({ id: runs.id })
          if (!r) throw new Abort<R>('run_not_active')
          // 3. One result per run.
          const [inserted] = await tx
            .insert(researchResults)
            .values({
              runId: result.runId,
              eventId: result.eventId,
              briefRevision: result.briefRevision,
              outcome: result.outcome,
              superseded: false,
              data: { ...result, superseded: false },
              createdAt: new Date(result.createdAt),
            })
            .onConflictDoNothing({ target: researchResults.runId })
            .returning({ runId: researchResults.runId })
          if (!inserted) throw new Abort<R>('duplicate')
        })
        return { ok: true as const }
      } catch (err) {
        if (!(err instanceof Abort)) throw err
        // The writes were rolled back; work out the most useful reason.
        const [event, run, existing] = await Promise.all([
          getEvent(result.eventId),
          getRun(result.runId),
          db.select({ runId: researchResults.runId }).from(researchResults).where(eq(researchResults.runId, result.runId)),
        ])
        let reason: R = err.reason as R
        if (!event || !run || run.eventId !== event.eventId) reason = 'not_found'
        else if (existing.length > 0) reason = 'duplicate'
        else if (run.briefRevision !== event.briefRevision || result.briefRevision !== event.briefRevision) reason = 'stale_brief'
        return { ok: false as const, reason }
      }
    },

    async getResearchResult(runId) {
      const row = first(await db.select().from(researchResults).where(eq(researchResults.runId, runId)))
      return row ? toResult(row) : null
    },

    async savePlan(input) {
      const plan = Plan.parse(input)
      await db.transaction(async (tx) => {
        // Only for the event's current brief revision; never lowers planRevision.
        const [e] = await tx
          .update(events)
          .set({ planRevision: sql`greatest(${events.planRevision}, ${plan.revision})` })
          .where(and(eq(events.id, plan.eventId), eq(events.briefRevision, plan.briefRevision)))
          .returning({ id: events.id })
        if (!e) throw new Error(`savePlan: event ${plan.eventId} not found or brief revision ${plan.briefRevision} is stale`)
        await tx.insert(plans).values({
          id: plan.planId,
          eventId: plan.eventId,
          revision: plan.revision,
          briefRevision: plan.briefRevision,
          runId: plan.runId,
          data: plan,
        })
      })
    },

    getPlan,

    async findOpenApproval(eventId, planRevision, now) {
      const [row] = await db
        .select({ approval: approvals, payment: payments })
        .from(approvals)
        .innerJoin(payments, eq(payments.approvalId, approvals.id))
        .where(
          and(
            eq(approvals.eventId, eventId),
            eq(approvals.planRevision, planRevision),
            isNull(approvals.revokedAt),
            gt(approvals.expiresAt, now),
          ),
        )
        .orderBy(desc(approvals.approvedAt))
        .limit(1)
      return row ? { approval: toApproval(row.approval), payment: toPayment(row.payment) } : null
    },

    async createApproval(approvalInput, paymentInput) {
      const approval = Approval.parse(approvalInput)
      const payment = Payment.parse(paymentInput)
      await db.transaction(async (tx) => {
        // Lock the event so a concurrent updateBrief cannot drop the plan
        // between this check and the insert (updateBrief locks the same row).
        const locked = await tx
          .select({ cancelRequestedAt: events.cancelRequestedAt })
          .from(events)
          .innerJoin(plans, eq(plans.eventId, events.id))
          .where(
            and(
              eq(events.id, approval.eventId),
              eq(plans.id, approval.planId),
              eq(plans.revision, approval.planRevision),
              eq(plans.dropped, false),
            ),
          )
          .for('update', { of: events })
        if (locked.length === 0) throw new Error(`createApproval: plan ${approval.planId} revision ${approval.planRevision} is not current`)
        if (locked[0].cancelRequestedAt !== null) throw new ApprovalCanceledError()
        // Re-check under the event lock: a concurrent approve may have inserted first.
        const [open] = await tx
          .select({ id: approvals.id })
          .from(approvals)
          .where(
            and(
              eq(approvals.eventId, approval.eventId),
              eq(approvals.planRevision, approval.planRevision),
              isNull(approvals.revokedAt),
              gt(approvals.expiresAt, new Date(approval.approvedAt)),
            ),
          )
          .limit(1)
        if (open) throw new OpenApprovalExistsError(approval.eventId, approval.planRevision)
        await tx.insert(approvals).values({
          id: approval.approvalId,
          eventId: approval.eventId,
          planId: approval.planId,
          planRevision: approval.planRevision,
          actionIds: approval.actionIds,
          approvedTotal: approval.approvedTotal,
          currency: approval.currency,
          approvedAt: new Date(approval.approvedAt),
          expiresAt: new Date(approval.expiresAt),
          revokedAt: approval.revokedAt ? new Date(approval.revokedAt) : null,
        })
        await tx.insert(payments).values({
          id: payment.paymentId,
          approvalId: payment.approvalId,
          checkoutSessionId: payment.checkoutSessionId,
          paymentIntentId: payment.paymentIntentId,
          amount: payment.amount,
          currency: payment.currency,
          state: payment.state,
          refundId: payment.refundId,
          refundState: payment.refundState,
          refundReason: payment.refundReason,
          mode: payment.mode,
        })
      })
    },

    async getApproval(approvalId) {
      const row = first(await db.select().from(approvals).where(eq(approvals.id, approvalId)))
      return row ? toApproval(row) : null
    },

    async revokeApprovals(eventId, at) {
      const rows = await db
        .update(approvals)
        .set({ revokedAt: at })
        .where(and(eq(approvals.eventId, eventId), isNull(approvals.revokedAt)))
        .returning()
      return rows.map(toApproval)
    },

    async getPaymentByCheckoutSession(checkoutSessionId) {
      const row = first(await db.select().from(payments).where(eq(payments.checkoutSessionId, checkoutSessionId)))
      return row ? toPayment(row) : null
    },

    async getPaymentByApproval(approvalId) {
      const row = first(await db.select().from(payments).where(eq(payments.approvalId, approvalId)))
      return row ? toPayment(row) : null
    },

    async listPaidApprovalIds(eventId) {
      const rows = await db.select({ id: approvals.id }).from(approvals)
        .innerJoin(payments, eq(payments.approvalId, approvals.id))
        .where(and(eq(approvals.eventId, eventId), eq(payments.state, 'paid')))
      return rows.map(row => row.id)
    },

    async markPaymentPaid(checkoutSessionId, paymentIntentId) {
      const [row] = await db
        .update(payments)
        .set({ state: 'paid', paymentIntentId })
        .where(and(eq(payments.checkoutSessionId, checkoutSessionId), eq(payments.state, 'pending')))
        .returning()
      return row ? toPayment(row) : null
    },

    async markPaymentExpired(checkoutSessionId) {
      const rows = await db
        .update(payments)
        .set({ state: 'expired' })
        .where(and(eq(payments.checkoutSessionId, checkoutSessionId), eq(payments.state, 'pending')))
        .returning({ id: payments.id })
      return rows.length > 0
    },

    async setRefund(paymentId, refund) {
      await db
        .update(payments)
        .set({ refundId: refund.refundId, refundState: refund.refundState, refundReason: refund.refundReason })
        .where(eq(payments.id, paymentId))
    },

    async hasStripeEvent(stripeEventId) {
      const [row] = await db.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.id, stripeEventId))
      return Boolean(row)
    },

    async recordStripeEvent(stripeEventId) {
      const rows = await db
        .insert(stripeEvents)
        .values({ id: stripeEventId, receivedAt: new Date() })
        .onConflictDoNothing({ target: stripeEvents.id })
        .returning({ id: stripeEvents.id })
      return rows.length > 0
    },

    async claimCommit(input, now) {
      return db.transaction(async (tx) => {
        // The event lock orders cancellation against the durable start of a commitment.
        const [event] = await tx.select().from(events).where(eq(events.id, input.eventId)).for('update')
        const [prior] = await tx.select().from(attempts).where(eq(attempts.executionKey, input.executionKey))
        if (prior) return { attempt: toAttempt(prior), replayed: true }
        if (!event || event.cancelRequestedAt || ['canceling', 'canceled'].includes(event.status)) return null
        const [approval] = await tx.select().from(approvals).where(eq(approvals.id, input.approvalId)).for('update')
        if (!approval || approval.eventId !== input.eventId || approval.revokedAt || approval.expiresAt <= now ||
            approval.planRevision !== event.planRevision || !approval.actionIds.includes(input.actionId)) return null
        const [payment] = await tx.select().from(payments).where(eq(payments.approvalId, approval.id)).for('update')
        if (!payment || payment.state !== 'paid' || payment.amount !== approval.approvedTotal ||
            payment.currency !== approval.currency || (input.mode === 'live' && payment.mode !== 'live')) return null
        return createStore(tx as unknown as Db).insertAttempt(input)
      })
    },

    async insertAttempt(input) {
      const a = Attempt.parse(input)
      const [inserted] = await db
        .insert(attempts)
        .values({
          id: a.attemptId,
          eventId: a.eventId,
          actionId: a.actionId,
          approvalId: a.approvalId,
          kind: a.kind,
          executionKey: a.executionKey,
          state: a.state,
          providerReference: a.providerReference,
          actualAmount: a.actualAmount,
          evidence: a.evidence,
          errorReason: a.errorReason,
          mode: a.mode,
          updatedAt: new Date(a.updatedAt),
        })
        .onConflictDoNothing({ target: attempts.executionKey })
        .returning()
      if (inserted) return { attempt: toAttempt(inserted), replayed: false }
      const [existing] = await db.select().from(attempts).where(eq(attempts.executionKey, a.executionKey))
      return { attempt: toAttempt(existing), replayed: true }
    },

    async transitionAttempt(attemptId, from, to, patch) {
      if (!canTransitionAttempt(from, to)) return null
      const [row] = await db
        .update(attempts)
        .set({
          state: to,
          updatedAt: new Date(),
          ...(patch.providerReference !== undefined && { providerReference: patch.providerReference }),
          ...(patch.actualAmount !== undefined && { actualAmount: patch.actualAmount }),
          ...(patch.evidence !== undefined && { evidence: patch.evidence }),
          ...(patch.errorReason !== undefined && { errorReason: patch.errorReason }),
        })
        .where(and(eq(attempts.id, attemptId), eq(attempts.state, from)))
        .returning()
      return row ? toAttempt(row) : null
    },

    listAttempts,

    async appendProgress(eventId, actor, message) {
      return db.transaction(async (tx) => {
        const [e] = await tx
          .update(events)
          .set({ progressSequence: sql`${events.progressSequence} + 1` })
          .where(eq(events.id, eventId))
          .returning({ sequence: events.progressSequence })
        if (!e) throw new Error(`appendProgress: event ${eventId} not found`)
        const [row] = await tx
          .insert(progressEntries)
          .values({ eventId, sequence: e.sequence, actor, message, createdAt: new Date() })
          .returning()
        return toProgress(row)
      })
    },
  }
}
