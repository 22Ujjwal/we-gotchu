import type {
  Approval,
  Attempt,
  AttemptState,
  Brief,
  Event,
  EventStatus,
  EventView,
  Payment,
  Plan,
  ProgressEntry,
  ResearchResult,
  Run,
} from '../contracts'

// The storage boundary for the transaction service (contract 0.4).
// Every method that guards an invariant must enforce it in the database with a
// conditional write or a uniqueness constraint, not with a read-then-write.
// Server-only: never import this from UI code.

export type Fail<R extends string> = { ok: false; reason: R }

export interface Store {
  // Events and research runs
  /** Creates the event (briefRevision 1, status researching) and its research Run with key `eventId:research:1`. */
  createEvent(input: { customerId: string; brief: Brief }): Promise<{ event: Event; run: Run }>
  getEvent(eventId: string): Promise<Event | null>
  /** Event plus current run, latest non-superseded result, current plan, latest approval and payment, attempts, and progress after the sequence. */
  getEventView(eventId: string, afterSequence?: number): Promise<EventView | null>
  /**
   * Atomically: checks expectedBriefRevision, stores the merged brief with revision + 1, marks the
   * previous result superseded, drops an unapproved plan, marks the old research run canceled, and
   * creates a new research Run. Refuses if an approval exists for the current plan.
   */
  updateBrief(input: {
    eventId: string
    expectedBriefRevision: number
    brief: Brief
  }): Promise<{ ok: true; event: Event; run: Run; previousRun: Run | null } | Fail<'not_found' | 'stale_brief' | 'already_approved'>>
  /** Conditional status change: only applies when the current status is in `from`. Returns false otherwise. */
  setEventStatus(eventId: string, from: readonly EventStatus[], to: EventStatus): Promise<boolean>
  /** Sets cancelRequestedAt once and status canceling; returns null if already canceled. */
  requestCancel(eventId: string, at: Date): Promise<Event | null>

  getRun(runId: string): Promise<Run | null>
  /** The latest Run of a phase for the event. */
  getCurrentRun(eventId: string, phase: Run['phase']): Promise<Run | null>
  createRun(input: { eventId: string; phase: Run['phase']; briefRevision: number; idempotencyKey: string }): Promise<{ run: Run; existing: boolean }>
  setRunSession(runId: string, naiveSessionId: string): Promise<void>
  /** Single-flight lease: sets advancingUntil only if it is null or past and the run is running. Returns the claimed run or null. */
  claimRunAdvance(runId: string, now: Date, leaseMs: number): Promise<Run | null>
  /** Clears the lease and records the last fully processed Naive sequence (never decreases it). */
  releaseRunAdvance(runId: string, lastSequence: number): Promise<void>
  /** Increments correctionsUsed from 0 to 1. Returns false if a correction was already used. */
  recordCorrection(runId: string): Promise<boolean>
  /** Conditional state change for a run: only from the listed states. */
  setRunState(runId: string, from: readonly Run['state'][], to: Run['state']): Promise<boolean>
  /**
   * Stores a result once per run, only if the run is running and its briefRevision equals the
   * event's (same statement). Sets the run state from the outcome and the event status
   * (awaiting_input -> needs_input, failed -> failed, canceled -> canceled; success/partial leave
   * the status for the caller to set after Plan derivation).
   */
  publishResearchResult(result: ResearchResult): Promise<{ ok: true } | Fail<'stale_brief' | 'run_not_active' | 'duplicate' | 'not_found'>>
  getResearchResult(runId: string): Promise<ResearchResult | null>
  /** Stores a plan; unique on (eventId, revision). Sets Event.planRevision. */
  savePlan(plan: Plan): Promise<void>
  getPlan(eventId: string): Promise<Plan | null>

  // Approval and payment
  /** Returns an unexpired, unrevoked approval for this plan revision with its payment, if any. */
  findOpenApproval(eventId: string, planRevision: number, now: Date): Promise<{ approval: Approval; payment: Payment } | null>
  /** Inserts approval and its pending payment together. */
  /** Throws OpenApprovalExistsError when another open approval for the same plan revision won the race. */
  createApproval(approval: Approval, payment: Payment): Promise<void>
  getApproval(approvalId: string): Promise<Approval | null>
  revokeApprovals(eventId: string, at: Date): Promise<Approval[]>
  getPaymentByCheckoutSession(checkoutSessionId: string): Promise<Payment | null>
  getPaymentByApproval(approvalId: string): Promise<Payment | null>
  /** Conditional pending -> paid. Returns null if it was not pending. */
  markPaymentPaid(checkoutSessionId: string, paymentIntentId: string): Promise<Payment | null>
  markPaymentExpired(checkoutSessionId: string): Promise<boolean>
  setRefund(paymentId: string, refund: { refundId: string; refundState: Payment['refundState']; refundReason: string }): Promise<void>
  /** Records a Stripe event id; returns true only the first time. */
  recordStripeEvent(stripeEventId: string): Promise<boolean>
  hasStripeEvent(stripeEventId: string): Promise<boolean>

  // Attempts
  /** Atomically authorize and claim a commitment, serialized with cancellation. */
  claimCommit(attempt: Attempt, now: Date): Promise<{ attempt: Attempt; replayed: boolean } | null>
  /** Inserts with a unique executionKey. On conflict returns the existing attempt with replayed true. */
  insertAttempt(attempt: Attempt): Promise<{ attempt: Attempt; replayed: boolean }>
  /** Conditional transition: applies only when the row is in `from`. Returns the updated row or null. */
  transitionAttempt(
    attemptId: string,
    from: AttemptState,
    to: AttemptState,
    patch: Partial<Pick<Attempt, 'providerReference' | 'actualAmount' | 'evidence' | 'errorReason'>>,
  ): Promise<Attempt | null>
  listAttempts(eventId: string): Promise<Attempt[]>

  // Progress
  /** Increments Event.progressSequence and inserts the entry in one transaction. */
  appendProgress(eventId: string, actor: ProgressEntry['actor'], message: string): Promise<ProgressEntry>
}

/** A concurrent approve already created an open approval for this plan revision. */
export class OpenApprovalExistsError extends Error {
  constructor(eventId: string, planRevision: number) {
    super(`An open approval already exists for event ${eventId} revision ${planRevision}`)
    this.name = 'OpenApprovalExistsError'
  }
}
