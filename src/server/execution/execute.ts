import { randomUUID } from 'node:crypto'
import {
  approvalMatchesPlan,
  modeAllowsAction,
  paymentCoversApproval,
  type Approval,
  type Attempt,
  type AttemptState,
  type Event,
  type EventStatus,
  type Payment,
  type Plan,
  type PlannedAction,
} from '../../contracts'
import type { Store } from '../store'
import type { AdapterResult, SupplierAdapter } from './adapter'

// Guarded execution for the MCP tools execute_action, cancel_action and
// reconcile_action (contract 0.4, "Guarded MCP tools" and "Attempt states").
// The agent only names eventId and actionId; every permission comes from
// stored records, and the execution key is derived here.

export type ExecutionDeps = {
  store: Store
  /** Picks the supplier adapter for an action. Its mode must equal the action's mode. */
  adapterFor: (action: PlannedAction) => SupplierAdapter
  now?: () => Date
  /** An adapter call slower than this is recorded as unknown. Default 20 s. */
  adapterTimeoutMs?: number
  /** Called once when every succeeded commitment has a succeeded cancellation (the refund hook). */
  onAllCanceled?: (eventId: string) => Promise<void>
}

export type RefusalReason =
  | 'no_approval'
  | 'expired'
  | 'revoked'
  | 'stale_revision'
  | 'unpaid'
  | 'mode_mismatch'
  | 'event_canceling'
  | 'dependency_pending'
  | 'unknown_action'
  | 'cancel_not_requested'
  | 'no_commitment'
  | 'commit_unknown'
  | 'not_unknown'
  | string

export type Refusal = {
  ok: false
  errorCode: 'not_allowed' | 'amount_exceeded' | 'not_found'
  reason: RefusalReason
  message: string
  attempt?: Attempt
}

export type AttemptOutcome = {
  ok: true
  attempt: Attempt
  replayed: boolean
  eventStatus: EventStatus | null
}

export type ExecutionResult = AttemptOutcome | Refusal

const DEFAULT_TIMEOUT_MS = 20_000

function refuse(reason: RefusalReason, message: string, errorCode: Refusal['errorCode'] = 'not_allowed'): Refusal {
  return { ok: false, errorCode, reason, message }
}

export function commitKey(approvalId: string, actionId: string): string {
  return `${approvalId}:${actionId}:commit`
}

export function cancelKey(approvalId: string, actionId: string): string {
  return `${approvalId}:${actionId}:cancel`
}

type CommitContext = {
  event: Event
  plan: Plan
  action: PlannedAction
  approval: Approval
  payment: Payment
  adapter: SupplierAdapter
  attempts: Attempt[]
}

/**
 * The execute_action checks, in contract order, with no side effects.
 * get_event uses it to report which actions are currently allowed.
 */
export async function checkCommit(deps: ExecutionDeps, event: Event, actionId: string): Promise<{ ok: true; ctx: CommitContext } | Refusal> {
  const { store } = deps
  const now = (deps.now ?? (() => new Date()))()

  // 1. Event not canceling.
  if (event.cancelRequestedAt !== null || event.status === 'canceling' || event.status === 'canceled') {
    return refuse('event_canceling', 'Cancellation was requested for this event; no new commitments run.')
  }

  const plan = await store.getPlan(event.eventId)
  if (!plan) return refuse('no_approval', 'This event has no plan.')
  if (plan.revision !== event.planRevision) return refuse('stale_revision', 'The stored plan is not the current plan revision.')
  const action = plan.actions.find((a) => a.actionId === actionId)
  if (!action) return refuse('unknown_action', `Action ${actionId} is not in the current plan.`)

  // 2. Approval for the current plan revision includes the action, unexpired, unrevoked.
  const open = await store.findOpenApproval(event.eventId, event.planRevision, now)
  if (!open) return approvalRefusal(store, event, now)
  const { approval, payment } = open
  const matches = approvalMatchesPlan(approval, plan)
  if (!matches.ok) return refuse(matches.reason, `The approval does not match the current plan (${matches.reason}).`)
  if (!approval.actionIds.includes(actionId)) return refuse('no_approval', `The approval does not include action ${actionId}.`)

  // 3. Payment paid and covering the approval exactly.
  const covered = paymentCoversApproval(payment, approval, now)
  if (!covered.ok) return refuse(covered.reason, `Payment does not cover the approval (${covered.reason}).`)

  // 4. Mode: a simulated or test payment never unlocks a live action, and the
  // adapter must run in the action's own mode.
  const adapter = deps.adapterFor(action)
  if (!modeAllowsAction(payment.mode, action.mode)) {
    return refuse('mode_mismatch', `A ${payment.mode} payment cannot unlock a ${action.mode} action.`)
  }
  if (adapter.mode !== action.mode) {
    return refuse('mode_mismatch', `The ${adapter.mode} supplier adapter cannot run a ${action.mode} action.`)
  }

  // 5. Dependencies succeeded under this approval.
  const attempts = await store.listAttempts(event.eventId)
  const pending = action.dependsOn.filter(
    (dep) => !attempts.some((a) => a.kind === 'commit' && a.actionId === dep && a.approvalId === approval.approvalId && a.state === 'succeeded'),
  )
  if (pending.length > 0) return refuse('dependency_pending', `Waiting for ${pending.join(', ')} to succeed first.`)

  // Amount: this action's maximum plus what already committed must fit the approved total.
  const committed = attempts
    .filter((a) => a.kind === 'commit' && a.approvalId === approval.approvalId && a.actionId !== actionId && a.state !== 'failed' && a.state !== 'skipped')
    .reduce((sum, a) => sum + (a.actualAmount ?? plan.actions.find((p) => p.actionId === a.actionId)?.maximumAmount ?? 0), 0)
  if (committed + action.maximumAmount > approval.approvedTotal) {
    return refuse('amount_exceeded', 'This action would exceed the approved total.', 'amount_exceeded')
  }

  return { ok: true, ctx: { event, plan, action, approval, payment, adapter, attempts } }
}

// findOpenApproval only returns usable approvals, so the latest approval from the
// event view explains why none is usable.
async function approvalRefusal(store: Store, event: Event, now: Date): Promise<Refusal> {
  const view = await store.getEventView(event.eventId, event.progressSequence)
  const latest = view?.approval ?? null
  if (!latest) return refuse('no_approval', 'No approval exists for this event.')
  if (latest.planRevision !== event.planRevision) return refuse('stale_revision', 'The approval is for an older plan revision.')
  if (latest.revokedAt !== null) return refuse('revoked', 'The approval was revoked.')
  if (now.getTime() >= new Date(latest.expiresAt).getTime()) return refuse('expired', 'The approval has expired.')
  return refuse('no_approval', 'No usable approval exists for the current plan revision.')
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`supplier adapter timed out after ${ms} ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Calls the adapter; a throw or timeout becomes outcome unknown. */
async function callAdapter(deps: ExecutionDeps, call: () => Promise<AdapterResult>): Promise<AdapterResult> {
  try {
    return await withTimeout(call(), deps.adapterTimeoutMs ?? DEFAULT_TIMEOUT_MS)
  } catch (error) {
    return { outcome: 'unknown', errorReason: error instanceof Error ? error.message : 'supplier adapter error' }
  }
}

/** Maps an adapter result to a conditional attempt transition from `from`. */
async function recordResult(store: Store, attempt: Attempt, from: AttemptState, result: AdapterResult): Promise<Attempt> {
  let to: AttemptState
  if (result.outcome === 'succeeded' && result.providerReference) to = 'succeeded'
  else if (result.outcome === 'failed') to = 'failed'
  else to = 'unknown'

  // From unknown, only definite evidence moves the attempt.
  if (from === 'unknown' && to === 'unknown') return attempt

  const reference = result.providerReference ?? null
  const updated = await store.transitionAttempt(attempt.attemptId, from, to, {
    providerReference: reference,
    actualAmount: result.actualAmount ?? null,
    evidence: result.evidence ?? (to === 'succeeded' && reference ? { providerReference: reference } : null),
    errorReason:
      result.errorReason ?? (result.outcome === 'succeeded' && !reference ? 'adapter reported success without a provider reference' : null),
  })
  if (updated) return updated
  // Another call moved it first; return what is stored now.
  const current = (await store.listAttempts(attempt.eventId)).find((a) => a.attemptId === attempt.attemptId)
  return current ?? attempt
}

function newAttempt(input: { event: Event; actionId: string; approvalId: string; kind: Attempt['kind']; executionKey: string; mode: Attempt['mode']; now: Date }): Attempt {
  return {
    attemptId: `att_${randomUUID()}`,
    eventId: input.event.eventId,
    actionId: input.actionId,
    approvalId: input.approvalId,
    kind: input.kind,
    executionKey: input.executionKey,
    // Inserted directly as running: one atomic write claims the key, so a crash
    // never leaves a pending row that nothing will move.
    state: 'running',
    providerReference: null,
    actualAmount: null,
    evidence: null,
    errorReason: null,
    mode: input.mode,
    updatedAt: input.now.toISOString(),
  }
}

/** Inserts the attempt once, already running. `replayed` true means this call must not call the supplier. */
async function claimAttempt(store: Store, attempt: Attempt): Promise<{ attempt: Attempt; replayed: boolean }> {
  return store.insertAttempt(attempt)
}

const EXECUTION_STATUSES: readonly EventStatus[] = ['plan_ready', 'awaiting_payment', 'executing', 'booked', 'partially_booked', 'failed']

/** Derives booked / partially_booked / executing / failed from the commit attempts under the approval. */
export function executionStatus(approval: Approval, attempts: Attempt[]): EventStatus {
  const states = approval.actionIds.map(
    (id) => attempts.find((a) => a.kind === 'commit' && a.approvalId === approval.approvalId && a.actionId === id)?.state ?? null,
  )
  const succeeded = states.filter((s) => s === 'succeeded').length
  const failed = states.filter((s) => s === 'failed').length
  if (succeeded === states.length) return 'booked'
  if (states.some((s) => s === 'pending' || s === 'running' || s === 'unknown')) return 'executing'
  if (failed > 0) return succeeded > 0 ? 'partially_booked' : 'failed'
  return 'executing'
}

async function settleExecution(store: Store, eventId: string, approval: Approval): Promise<EventStatus | null> {
  const attempts = await store.listAttempts(eventId)
  const status = executionStatus(approval, attempts)
  await store.setEventStatus(eventId, EXECUTION_STATUSES, status)
  return (await store.getEvent(eventId))?.status ?? null
}

export async function settleCancellation(deps: ExecutionDeps, eventId: string): Promise<EventStatus | null> {
  const { store } = deps
  const attempts = await store.listAttempts(eventId)
  const commits = attempts.filter((a) => a.kind === 'commit' && a.state === 'succeeded')
  const open = attempts.some((a) => a.kind === 'commit' && (a.state === 'running' || a.state === 'unknown' || a.state === 'pending'))
  const allCanceled =
    !open &&
    commits.every((c) => attempts.some((a) => a.kind === 'cancel' && a.executionKey === cancelKey(c.approvalId, c.actionId) && a.state === 'succeeded'))
  if (allCanceled && (await store.getEvent(eventId))?.status === 'canceling') {
    // Keep cancellation retryable until the idempotent refund handoff succeeds.
    if (deps.onAllCanceled) await deps.onAllCanceled(eventId)
    if (await store.setEventStatus(eventId, ['canceling'], 'canceled')) {
      await store.appendProgress(eventId, 'system', 'Every commitment is canceled.')
    }
  }
  return (await store.getEvent(eventId))?.status ?? null
}

function describe(action: PlannedAction, attempt: Attempt): string {
  const ref = attempt.providerReference ? `, reference ${attempt.providerReference}` : ''
  const why = attempt.errorReason ? `: ${attempt.errorReason}` : ''
  return `${attempt.kind === 'commit' ? action.kind : `cancel ${action.kind}`} with ${action.supplierName} ${attempt.state} (${attempt.mode}${ref})${why}.`
}

async function loadEvent(store: Store, eventId: string): Promise<Event | Refusal> {
  const event = await store.getEvent(eventId)
  return event ?? refuse('event_not_found', `Event ${eventId} was not found.`, 'not_found')
}

function isRefusal(value: unknown): value is Refusal {
  return typeof value === 'object' && value !== null && (value as Refusal).ok === false
}

export async function executeAction(deps: ExecutionDeps, input: { eventId: string; actionId: string; reason: string }): Promise<ExecutionResult> {
  const { store } = deps
  const now = (deps.now ?? (() => new Date()))()
  const event = await loadEvent(store, input.eventId)
  if (isRefusal(event)) return event
  await store.appendProgress(event.eventId, 'agent', input.reason)

  // A retry of a commit that already ran returns the stored attempt, even if the
  // approval has since expired or the event is canceling: the result is the
  // truth, and no supplier call happens. Failed and skipped attempts can be retried
  // under a new approval, so they are not replays.
  const prior = (await store.listAttempts(event.eventId)).find(
    (a) => a.kind === 'commit' && a.actionId === input.actionId && a.state !== 'failed' && a.state !== 'skipped',
  )
  if (prior) return { ok: true, attempt: prior, replayed: true, eventStatus: event.status }

  const checked = await checkCommit(deps, event, input.actionId)
  if (!checked.ok) {
    await store.appendProgress(event.eventId, 'system', `Refused ${input.actionId}: ${checked.reason}.`)
    return checked
  }
  const { action, approval, adapter } = checked.ctx

  const claimed = await store.claimCommit(
    newAttempt({ event, actionId: action.actionId, approvalId: approval.approvalId, kind: 'commit', executionKey: commitKey(approval.approvalId, action.actionId), mode: adapter.mode, now }),
    (deps.now ?? (() => new Date()))(),
  )
  if (!claimed) return refuse('authorization_changed', 'Cancellation or approval changed before the commitment started.')
  if (claimed.replayed) {
    return { ok: true, attempt: claimed.attempt, replayed: true, eventStatus: (await store.getEvent(event.eventId))?.status ?? null }
  }

  await store.setEventStatus(event.eventId, ['plan_ready', 'awaiting_payment', 'executing', 'partially_booked', 'failed'], 'executing')
  const result = await callAdapter(deps, () => adapter.commit(action, claimed.attempt.executionKey))
  const attempt = await recordResult(store, claimed.attempt, 'running', result)
  await store.appendProgress(event.eventId, 'system', describe(action, attempt))
  const eventStatus = await settleExecution(store, event.eventId, approval)

  if (attempt.state === 'failed' && attempt.errorReason === 'amount_exceeded') {
    return { ...refuse('amount_exceeded', 'The supplier price is above the approved maximum; nothing was committed.', 'amount_exceeded'), attempt }
  }
  return { ok: true, attempt, replayed: false, eventStatus }
}

export async function cancelAction(deps: ExecutionDeps, input: { eventId: string; actionId: string; reason: string }): Promise<ExecutionResult> {
  const { store } = deps
  const now = (deps.now ?? (() => new Date()))()
  const event = await loadEvent(store, input.eventId)
  if (isRefusal(event)) return event
  await store.appendProgress(event.eventId, 'agent', input.reason)

  const refusal = async (r: Refusal) => {
    await store.appendProgress(event.eventId, 'system', `Refused cancel of ${input.actionId}: ${r.reason}.`)
    return r
  }

  if (event.cancelRequestedAt === null) return refusal(refuse('cancel_not_requested', 'The customer has not requested cancellation.'))
  const attempts = await store.listAttempts(event.eventId)
  const commits = attempts.filter((a) => a.kind === 'commit' && a.actionId === input.actionId)
  const commit = commits.find((a) => a.state === 'succeeded')
  if (!commit) {
    if (commits.some((a) => a.state === 'unknown' || a.state === 'running' || a.state === 'pending')) {
      return refusal(refuse('commit_unknown', 'The commitment outcome is not settled; reconcile it first.'))
    }
    return refusal(refuse('no_commitment', `There is no succeeded commitment for ${input.actionId} to cancel.`))
  }
  const plan = await store.getPlan(event.eventId)
  const action = plan?.actions.find((a) => a.actionId === input.actionId)
  if (!action) return refusal(refuse('unknown_action', `Action ${input.actionId} is not in the current plan.`))
  const adapter = deps.adapterFor(action)
  if (adapter.mode !== commit.mode) {
    return refusal(refuse('mode_mismatch', `The ${adapter.mode} adapter cannot cancel a ${commit.mode} commitment.`))
  }

  const claimed = await claimAttempt(
    store,
    newAttempt({ event, actionId: action.actionId, approvalId: commit.approvalId, kind: 'cancel', executionKey: cancelKey(commit.approvalId, action.actionId), mode: adapter.mode, now }),
  )
  if (claimed.replayed) {
    return { ok: true, attempt: claimed.attempt, replayed: true, eventStatus: (await store.getEvent(event.eventId))?.status ?? null }
  }

  const result = await callAdapter(deps, () => adapter.cancel(action, commit.providerReference!, claimed.attempt.executionKey))
  const attempt = await recordResult(store, claimed.attempt, 'running', result)
  await store.appendProgress(event.eventId, 'system', describe(action, attempt))
  const eventStatus = await settleCancellation(deps, event.eventId)
  return { ok: true, attempt, replayed: false, eventStatus }
}

export async function reconcileAction(deps: ExecutionDeps, input: { eventId: string; actionId: string; reason?: string }): Promise<ExecutionResult> {
  const { store } = deps
  const event = await loadEvent(store, input.eventId)
  if (isRefusal(event)) return event
  if (input.reason) await store.appendProgress(event.eventId, 'agent', input.reason)

  const attempts = await store.listAttempts(event.eventId)
  // A cancel attempt is newer than its commit, so prefer it when both are unknown.
  const unknown =
    attempts.find((a) => a.actionId === input.actionId && a.kind === 'cancel' && a.state === 'unknown') ??
    attempts.find((a) => a.actionId === input.actionId && a.kind === 'commit' && a.state === 'unknown')
  if (!unknown) return refuse('not_unknown', `No attempt for ${input.actionId} is in state unknown.`)

  const plan = await store.getPlan(event.eventId)
  const action = plan?.actions.find((a) => a.actionId === input.actionId)
  if (!action) return refuse('unknown_action', `Action ${input.actionId} is not in the current plan.`)
  const adapter = deps.adapterFor(action)
  if (adapter.mode !== unknown.mode) return refuse('mode_mismatch', `The ${adapter.mode} adapter cannot reconcile a ${unknown.mode} attempt.`)

  const result = await callAdapter(deps, () => adapter.reconcile(action, unknown.executionKey))
  const attempt = await recordResult(store, unknown, 'unknown', result)
  await store.appendProgress(event.eventId, 'system', `Reconciled: ${describe(action, attempt)}`)

  let eventStatus: EventStatus | null
  if (attempt.kind === 'cancel') {
    eventStatus = await settleCancellation(deps, event.eventId)
  } else {
    const approval = await store.getApproval(attempt.approvalId)
    eventStatus = approval ? await settleExecution(store, event.eventId, approval) : event.status
    if (event.cancelRequestedAt !== null) eventStatus = await settleCancellation(deps, event.eventId)
  }
  return { ok: true, attempt, replayed: false, eventStatus }
}
