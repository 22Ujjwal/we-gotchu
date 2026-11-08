import { describe, expect, it } from 'vitest'
import {
  Approval,
  EventView,
  Plan,
  ResearchInput,
  CONTRACT_VERSION,
  approvalMatchesPlan,
  assessPlanForApproval,
  bookedEvent,
  canceledEvent,
  canTransitionAttempt,
  modeAllowsAction,
  paymentCoversApproval,
  planReadyEvent,
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
  it('approves a plan with a verified budget and known terms', () => {
    expect(assessPlanForApproval(plan)).toEqual({ ok: true })
  })

  it('refuses an unknown budget fit even when the JSON is valid', () => {
    const r = assessPlanForApproval({ ...plan, budgetFit: 'unknown' })
    expect(r).toMatchObject({ ok: false, errorCode: 'budget_not_verified' })
  })

  it('refuses an action with unknown cancellation terms', () => {
    const actions = plan.actions.map((a, i) => (i === 0 ? { ...a, cancellationTerms: { known: false } } : a))
    expect(assessPlanForApproval({ ...plan, actions })).toMatchObject({ ok: false })
  })

  it('refuses a plan that research could not finish', () => {
    expect(assessPlanForApproval({ ...plan, researchOutcome: 'failed' })).toMatchObject({ ok: false })
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
