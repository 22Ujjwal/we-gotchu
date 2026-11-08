import type { Approval, AttemptState, Payment, Plan } from './records'

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

// POST /approve is refused unless the research supports the budget claim and
// every action has known cancellation terms.
export function assessPlanForApproval(plan: Plan): RuleResult {
  if (plan.budgetFit !== 'within') {
    return { ok: false, errorCode: 'budget_not_verified', reason: `budgetFit is ${plan.budgetFit}` }
  }
  if (plan.researchOutcome !== 'success' && plan.researchOutcome !== 'partial') {
    return { ok: false, errorCode: 'budget_not_verified', reason: `research outcome is ${plan.researchOutcome}` }
  }
  if (plan.actions.length === 0) {
    return { ok: false, errorCode: 'budget_not_verified', reason: 'plan has no actions' }
  }
  if (plan.actions.some((a) => !a.cancellationTerms.known)) {
    return { ok: false, errorCode: 'budget_not_verified', reason: 'an action has unknown cancellation terms' }
  }
  if (plan.actions.reduce((sum, a) => sum + a.maximumAmount, 0) > plan.total) {
    return { ok: false, errorCode: 'budget_not_verified', reason: 'action amounts exceed the plan total' }
  }
  return { ok: true }
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
  if (now.getTime() >= new Date(approval.expiresAt).getTime()) return { ok: false, errorCode: 'not_allowed', reason: 'expired' }
  return { ok: true }
}

// Mode rule: a simulated or test payment can never unlock a live supplier action.
export function modeAllowsAction(paymentMode: Payment['mode'], actionMode: Plan['mode']): boolean {
  if (actionMode === 'live') return paymentMode === 'live'
  return true
}
