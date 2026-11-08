import type { Approval, AttemptState, Brief, Candidate, Event, Mode, Payment, Plan, PlannedAction, ResearchResult, Run } from './records'
import { CONTRACT_VERSION } from './records'

// Legal attempt moves. succeeded and failed are terminal. An unknown attempt
// can only be settled by reconcile evidence, never retried as a new purchase.
const ATTEMPT_TRANSITIONS: Record<AttemptState, readonly AttemptState[]> = {
  pending: ['running', 'skipped'],
  running: ['succeeded', 'failed', 'unknown'],
  unknown: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
  skipped: [],
}

export function canTransitionAttempt(from: AttemptState, to: AttemptState): boolean {
  return ATTEMPT_TRANSITIONS[from].includes(to)
}

export type RuleResult = { ok: true } | { ok: false; errorCode: string; reason: string }

// POST /approve is refused unless every action has known cancellation terms
// and the action amounts fit inside the plan total. A Plan can only exist for a
// verified within-budget result, so budget fit is checked when it is built.
export function assessPlanForApproval(plan: Plan): RuleResult {
  if (plan.actions.some((a) => !a.cancellationTerms.known)) {
    return { ok: false, errorCode: 'budget_not_verified', reason: 'an action has unknown cancellation terms' }
  }
  if (plan.actions.reduce((sum, a) => sum + a.maximumAmount, 0) > plan.total) {
    return { ok: false, errorCode: 'budget_not_verified', reason: 'action amounts exceed the plan total' }
  }
  return { ok: true }
}

export type BuildPlanInput = {
  result: ResearchResult
  brief: Brief
  planId: string
  revision: number
  actionIds: Record<string, string> // candidateId -> actionId
  executionMode: Mode
}

export type BuildPlanResult = { ok: true; plan: Plan } | { ok: false; reason: string }

function topRanked(result: ResearchResult, kind: Candidate['kind']): Candidate | undefined {
  const byId = new Map(result.candidates.map((c) => [c.candidateId, c]))
  return [...result.recommendations]
    .sort((a, b) => a.rank - b.rank)
    .map((r) => byId.get(r.candidateId))
    .find((c): c is Candidate => c !== undefined && c.kind === kind)
}

// A ResearchResult is read-only evidence. This derives a bookable Plan from it
// only when the result supports one: verified budget, known prices and terms.
// priceEstimate is the total for the required quantity, in minor units.
export function buildPlanFromResult(input: BuildPlanInput): BuildPlanResult {
  const { result, brief } = input
  if (result.outcome !== 'success' && result.outcome !== 'partial') return { ok: false, reason: `research outcome is ${result.outcome}` }
  if (result.superseded) return { ok: false, reason: 'result is superseded by a newer brief revision' }
  if (result.budgetFit !== 'within') return { ok: false, reason: `budgetFit is ${result.budgetFit}` }

  const venue = topRanked(result, 'venue')
  const supply = topRanked(result, 'supply')
  if (!venue) return { ok: false, reason: 'no recommended venue' }
  const selected = supply ? [venue, supply] : [venue]

  for (const c of selected) {
    if (c.priceEstimate === null) return { ok: false, reason: `${c.name} has an unknown price` }
    if (!c.cancellationTerms.known) return { ok: false, reason: `${c.name} has unknown cancellation terms` }
  }

  const venueAction: PlannedAction = {
    actionId: input.actionIds[venue.candidateId],
    kind: 'venue_booking',
    supplierName: venue.name,
    target: venue.name,
    quantityOrSchedule: `event start ${brief.startsAt}`,
    maximumAmount: venue.priceEstimate!,
    cancellationTerms: venue.cancellationTerms,
    sourceUrl: venue.sources[0].url,
    dependsOn: [],
    mode: input.executionMode,
  }
  const actions: PlannedAction[] = [venueAction]
  if (supply) {
    actions.push({
      actionId: input.actionIds[supply.candidateId],
      kind: 'item_purchase',
      supplierName: supply.name,
      target: supply.name,
      quantityOrSchedule: supply.quantityInfo ? `${supply.quantityInfo.packs} packs` : `${brief.headcount} units`,
      maximumAmount: supply.priceEstimate!,
      cancellationTerms: supply.cancellationTerms,
      sourceUrl: supply.sources[0].url,
      dependsOn: [venueAction.actionId],
      mode: input.executionMode,
    })
  }
  if (actions.some((a) => !a.actionId)) return { ok: false, reason: 'missing action id for a selected candidate' }

  const total = actions.reduce((sum, a) => sum + a.maximumAmount, 0)
  return {
    ok: true,
    plan: {
      planId: input.planId,
      eventId: result.eventId,
      contractVersion: CONTRACT_VERSION,
      briefRevision: result.briefRevision,
      revision: input.revision,
      runId: result.runId,
      selectedCandidateIds: selected.map((c) => c.candidateId),
      actions,
      total,
      currency: result.currency,
      serviceFee: 0,
      cancellationTerms: selected.map((c) => `${c.name}: ${c.cancellationTerms.summary ?? 'known'}`).join(' '),
      agentReasoning: selected.map((c) => c.whyChosenOrRejected).join(' '),
      mode: input.executionMode,
      budgetFit: 'within',
      budgetBasis: result.budgetBasis,
      warnings: result.warnings,
    },
  }
}

// Mirrors the conditional database write that stores a research result: an
// older run, a canceled run, or a superseded brief revision can never publish.
export function canPublishResult(event: Event, run: Run, result: ResearchResult): RuleResult {
  if (result.eventId !== event.eventId || run.eventId !== event.eventId) return { ok: false, errorCode: 'not_allowed', reason: 'event_mismatch' }
  if (result.runId !== run.runId) return { ok: false, errorCode: 'not_allowed', reason: 'run_mismatch' }
  if (run.phase !== 'research') return { ok: false, errorCode: 'not_allowed', reason: 'not_a_research_run' }
  if (run.briefRevision !== event.briefRevision || result.briefRevision !== event.briefRevision) {
    return { ok: false, errorCode: 'not_allowed', reason: 'stale_brief' }
  }
  if (run.state !== 'running') return { ok: false, errorCode: 'not_allowed', reason: 'run_not_active' }
  return { ok: true }
}

// Mirrors the single-flight lease taken before a poll calls Naive, so two
// concurrent polls cannot advance the same run or send two corrections.
export function tryClaimAdvance(run: Run, now: Date, leaseMs: number): { claimed: boolean; run: Run } {
  const leased = run.advancingUntil !== null && new Date(run.advancingUntil).getTime() > now.getTime()
  if (leased || run.state !== 'running') return { claimed: false, run }
  return { claimed: true, run: { ...run, advancingUntil: new Date(now.getTime() + leaseMs).toISOString() } }
}

export function canSendCorrection(run: Run): boolean {
  return run.state === 'running' && run.correctionsUsed < 1
}

// An approval must describe exactly the plan the customer saw.
export function approvalMatchesPlan(approval: Approval, plan: Plan): RuleResult {
  if (approval.eventId !== plan.eventId) return { ok: false, errorCode: 'not_allowed', reason: 'event_mismatch' }
  if (approval.planId !== plan.planId) return { ok: false, errorCode: 'not_allowed', reason: 'plan_mismatch' }
  if (approval.planRevision !== plan.revision) return { ok: false, errorCode: 'not_allowed', reason: 'stale_revision' }
  if (approval.currency !== plan.currency) return { ok: false, errorCode: 'not_allowed', reason: 'currency_mismatch' }
  if (approval.approvedTotal !== plan.total) return { ok: false, errorCode: 'not_allowed', reason: 'total_mismatch' }
  const planned = new Set(plan.actions.map((a) => a.actionId))
  if (approval.actionIds.some((id) => !planned.has(id))) {
    return { ok: false, errorCode: 'not_allowed', reason: 'unknown_action' }
  }
  return { ok: true }
}

// A payment only unlocks execution when it matches the approval exactly.
export function paymentCoversApproval(payment: Payment, approval: Approval, now: Date): RuleResult {
  if (payment.approvalId !== approval.approvalId) return { ok: false, errorCode: 'not_allowed', reason: 'approval_mismatch' }
  if (payment.state !== 'paid') return { ok: false, errorCode: 'not_allowed', reason: 'unpaid' }
  if (payment.currency !== approval.currency || payment.amount !== approval.approvedTotal) {
    return { ok: false, errorCode: 'not_allowed', reason: 'amount_mismatch' }
  }
  if (approval.revokedAt !== null) return { ok: false, errorCode: 'not_allowed', reason: 'revoked' }
  const authorizedAt = payment.paidAt ? Date.parse(payment.paidAt) : now.getTime()
  if (authorizedAt >= new Date(approval.expiresAt).getTime()) return { ok: false, errorCode: 'not_allowed', reason: 'expired' }
  return { ok: true }
}

// Mode rule: a simulated or test payment can never unlock a live supplier action.
export function modeAllowsAction(paymentMode: Payment['mode'], actionMode: Plan['mode']): boolean {
  if (actionMode === 'live') return paymentMode === 'live'
  return true
}
