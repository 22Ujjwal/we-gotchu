import { describe, expect, it } from 'vitest'
import {
  Approval,
  Candidate,
  EventView,
  Plan,
  ResearchInput,
  ResearchResult,
  CONTRACT_VERSION,
  approvalMatchesPlan,
  assessPlanForApproval,
  bookedEvent,
  buildPlanFromResult,
  canceledEvent,
  canPublishResult,
  canSendCorrection,
  canTransitionAttempt,
  modeAllowsAction,
  paymentCoversApproval,
  planReadyEvent,
  researchResultFixture,
  tryClaimAdvance,
} from './index'

const plan = bookedEvent.plan!
const approval = bookedEvent.approval!
const payment = bookedEvent.payment!
const now = new Date('2026-11-08T01:10:00.000Z')

describe('fixtures', () => {
  it.each([
    ['plan ready', planReadyEvent],
    ['booked', bookedEvent],
    ['canceled with pending refund', canceledEvent],
  ])('%s parses', (_name, fixture) => {
    expect(EventView.safeParse(fixture).success).toBe(true)
  })

  it('are all labeled simulated', () => {
    for (const f of [planReadyEvent, bookedEvent, canceledEvent]) {
      expect(f.plan?.mode).toBe('simulated')
      expect(f.attempts.every((a) => a.mode === 'simulated')).toBe(true)
    }
  })

  it('the canceled fixture keeps the original commits succeeded and shows a pending refund', () => {
    expect(canceledEvent.attempts.filter((a) => a.kind === 'commit').every((a) => a.state === 'succeeded')).toBe(true)
    expect(canceledEvent.payment?.refundState).toBe('pending')
  })
})

describe('schemas reject invalid input', () => {
  it('an approval with no identity', () => {
    const { approvalId: _omit, ...rest } = approval
    expect(Approval.safeParse(rest).success).toBe(false)
  })

  it('an approval with no actions', () => {
    expect(Approval.safeParse({ ...approval, actionIds: [] }).success).toBe(false)
  })

  it('an unsupported event status', () => {
    expect(EventView.safeParse({ ...bookedEvent, event: { ...bookedEvent.event, status: 'refunded' } }).success).toBe(false)
  })

  it('a service fee other than zero', () => {
    expect(Plan.safeParse({ ...plan, serviceFee: 100 }).success).toBe(false)
  })

  it('a non-integer money amount', () => {
    expect(Plan.safeParse({ ...plan, total: 315.5 }).success).toBe(false)
  })

  it('research input for the wrong contract version', () => {
    const input = { contractVersion: '0.1', eventId: 'e', briefRevision: 1, runId: 'r', brief: planReadyEvent.event.brief }
    expect(ResearchInput.safeParse(input).success).toBe(false)
    expect(ResearchInput.safeParse({ ...input, contractVersion: CONTRACT_VERSION }).success).toBe(true)
  })
})

describe('attempt transitions', () => {
  it('allows the documented moves', () => {
    expect(canTransitionAttempt('pending', 'running')).toBe(true)
    expect(canTransitionAttempt('running', 'unknown')).toBe(true)
    expect(canTransitionAttempt('unknown', 'succeeded')).toBe(true)
  })

  it('never moves a terminal attempt', () => {
    for (const to of ['pending', 'running', 'failed', 'unknown', 'skipped'] as const) {
      expect(canTransitionAttempt('succeeded', to)).toBe(false)
    }
    expect(canTransitionAttempt('failed', 'running')).toBe(false)
  })

  it('does not retry an unknown attempt as a new run', () => {
    expect(canTransitionAttempt('unknown', 'running')).toBe(false)
  })
})

describe('approval rules', () => {
  it('approves a plan with known terms', () => {
    expect(assessPlanForApproval(plan)).toEqual({ ok: true })
  })

  it('refuses an action with unknown cancellation terms', () => {
    const actions = plan.actions.map((a, i) => (i === 0 ? { ...a, cancellationTerms: { known: false } } : a))
    expect(assessPlanForApproval({ ...plan, actions })).toMatchObject({ ok: false, errorCode: 'budget_not_verified' })
  })

  it('refuses action amounts above the plan total', () => {
    expect(assessPlanForApproval({ ...plan, total: 1 })).toMatchObject({ ok: false })
  })

  it('matches an approval to the exact plan', () => {
    expect(approvalMatchesPlan(approval, plan)).toEqual({ ok: true })
  })

  it('rejects an approval with a mismatched currency, stale revision or changed total', () => {
    expect(approvalMatchesPlan({ ...approval, currency: 'eur' }, plan)).toMatchObject({ reason: 'currency_mismatch' })
    expect(approvalMatchesPlan({ ...approval, planRevision: 2 }, plan)).toMatchObject({ reason: 'stale_revision' })
    expect(approvalMatchesPlan({ ...approval, approvedTotal: 1 }, plan)).toMatchObject({ reason: 'total_mismatch' })
  })
})

describe('payment rules', () => {
  it('lets a matching paid payment cover the approval', () => {
    expect(paymentCoversApproval(payment, approval, now)).toEqual({ ok: true })
  })

  it('refuses unpaid, revoked, expired and mismatched payments', () => {
    expect(paymentCoversApproval({ ...payment, state: 'pending' }, approval, now)).toMatchObject({ reason: 'unpaid' })
    expect(paymentCoversApproval(payment, { ...approval, revokedAt: '2026-11-08T01:06:00.000Z' }, now)).toMatchObject({ reason: 'revoked' })
    expect(paymentCoversApproval(payment, approval, new Date('2026-11-08T02:00:00.000Z'))).toMatchObject({ reason: 'expired' })
    expect(paymentCoversApproval({ ...payment, paidAt: now.toISOString() }, approval, new Date('2026-11-08T02:00:00.000Z'))).toEqual({ ok: true })
    expect(paymentCoversApproval({ ...payment, paidAt: approval.expiresAt }, approval, now)).toMatchObject({ reason: 'expired' })
    expect(paymentCoversApproval({ ...payment, amount: 1 }, approval, now)).toMatchObject({ reason: 'amount_mismatch' })
    expect(paymentCoversApproval({ ...payment, currency: 'eur' }, approval, now)).toMatchObject({ reason: 'amount_mismatch' })
  })

  it('never lets a simulated or test payment unlock a live action', () => {
    expect(modeAllowsAction('simulated', 'live')).toBe(false)
    expect(modeAllowsAction('test', 'live')).toBe(false)
    expect(modeAllowsAction('live', 'live')).toBe(true)
    expect(modeAllowsAction('test', 'simulated')).toBe(true)
  })
})

const result = researchResultFixture
const brief = planReadyEvent.event.brief
const ids = { cand_venue_a: 'act_v', cand_item_plates: 'act_i', cand_venue_b: 'act_b' }
const build = (r = result) =>
  buildPlanFromResult({ result: r, brief, planId: 'plan_x', revision: 1, actionIds: ids, executionMode: 'simulated' })

describe('research result versus bookable plan', () => {
  it('a research result is not a plan and a plan is not a research result', () => {
    expect(ResearchResult.safeParse(result).success).toBe(true)
    expect(Plan.safeParse(result).success).toBe(false)
    expect(ResearchResult.safeParse(plan).success).toBe(false)
  })

  it('derives a plan from the top-ranked venue and supply', () => {
    const r = build()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.plan.selectedCandidateIds).toEqual(['cand_venue_a', 'cand_item_plates'])
      expect(r.plan.total).toBe(31500)
      expect(r.plan.actions[1].dependsOn).toEqual([r.plan.actions[0].actionId])
      expect(Plan.safeParse(r.plan).success).toBe(true)
    }
  })

  it('does not derive a plan from partial evidence about the budget', () => {
    expect(build({ ...result, budgetFit: 'unknown' })).toMatchObject({ ok: false })
    expect(build({ ...result, budgetFit: 'over' })).toMatchObject({ ok: false })
  })

  it('does not derive a plan from failed, canceled, awaiting-input, or superseded results', () => {
    for (const outcome of ['failed', 'canceled', 'awaiting_input'] as const) {
      expect(build({ ...result, outcome })).toMatchObject({ ok: false })
    }
    expect(build({ ...result, superseded: true })).toMatchObject({ ok: false })
  })

  it('does not select a recommended candidate with an unknown price or terms', () => {
    const noPrice = result.candidates.map((c) => (c.candidateId === 'cand_venue_a' ? { ...c, priceEstimate: null } : c))
    expect(build({ ...result, candidates: noPrice })).toMatchObject({ ok: false })
    const noTerms = result.candidates.map((c) => (c.candidateId === 'cand_item_plates' ? { ...c, cancellationTerms: { known: false } } : c))
    expect(build({ ...result, candidates: noTerms })).toMatchObject({ ok: false })
  })
})

describe('candidate evidence', () => {
  const candidate = result.candidates[0]

  it('requires at least one source with a tool and retrieval time', () => {
    expect(Candidate.safeParse({ ...candidate, sources: [] }).success).toBe(false)
    expect(Candidate.safeParse({ ...candidate, sources: [{ url: 'https://example.com', stage: 'detail' }] }).success).toBe(false)
  })

  it('does not accept a category page as a candidate kind', () => {
    expect(Candidate.safeParse({ ...candidate, kind: 'category' }).success).toBe(false)
  })

  it('keeps unknown prices explicit instead of zero', () => {
    expect(Candidate.safeParse({ ...candidate, priceEstimate: null }).success).toBe(true)
    expect(Candidate.safeParse({ ...candidate, priceEstimate: undefined }).success).toBe(false)
  })
})

describe('stale results and concurrent polling', () => {
  const event = planReadyEvent.event
  const run = { ...planReadyEvent.run!, state: 'running' as const }

  it('publishes a result for the current run and brief revision', () => {
    expect(canPublishResult(event, run, result)).toEqual({ ok: true })
  })

  it('rejects an older brief revision, a different run, and a finished run', () => {
    expect(canPublishResult({ ...event, briefRevision: 2 }, run, result)).toMatchObject({ reason: 'stale_brief' })
    expect(canPublishResult(event, { ...run, runId: 'other' }, result)).toMatchObject({ reason: 'run_mismatch' })
    expect(canPublishResult(event, { ...run, state: 'canceled' }, result)).toMatchObject({ reason: 'run_not_active' })
  })

  it('lets exactly one of two concurrent polls claim a run', () => {
    const now = new Date('2026-11-08T02:00:00.000Z')
    const first = tryClaimAdvance(run, now, 30_000)
    expect(first.claimed).toBe(true)
    const second = tryClaimAdvance(first.run, new Date(now.getTime() + 1000), 30_000)
    expect(second.claimed).toBe(false)
  })

  it('lets a later poll claim after the lease expires, but never a finished run', () => {
    const now = new Date('2026-11-08T02:00:00.000Z')
    const first = tryClaimAdvance(run, now, 30_000)
    expect(tryClaimAdvance(first.run, new Date(now.getTime() + 31_000), 30_000).claimed).toBe(true)
    expect(tryClaimAdvance({ ...run, state: 'succeeded' }, now, 30_000).claimed).toBe(false)
  })

  it('allows only one corrective message per run', () => {
    expect(canSendCorrection({ ...run, correctionsUsed: 0 })).toBe(true)
    expect(canSendCorrection({ ...run, correctionsUsed: 1 })).toBe(false)
  })
})
