import { beforeAll, describe, expect, it } from 'vitest'
import { planReadyEvent, researchResultFixture, type Attempt, type Brief, type ResearchResult } from '../../contracts'
import { OpenApprovalExistsError, type Store } from '../store'
import { createTestStore } from './client'

const brief: Brief = planReadyEvent.event.brief

let store: Store
beforeAll(async () => {
  store = await createTestStore()
})

const resultFor = (eventId: string, runId: string, briefRevision: number, outcome: ResearchResult['outcome'] = 'success'): ResearchResult => ({
  ...researchResultFixture,
  eventId,
  runId,
  briefRevision,
  outcome,
  missing: outcome === 'awaiting_input' ? ['location'] : [],
})

const planFor = (eventId: string, runId: string, revision: number, briefRevision = 1) => ({
  ...planReadyEvent.plan!,
  planId: `plan_${eventId}_${revision}_${briefRevision}`,
  eventId,
  runId,
  revision,
  briefRevision,
})

async function approve(eventId: string, runId: string) {
  const plan = planFor(eventId, runId, 1)
  await store.savePlan(plan)
  const approvalId = `appr_${eventId}`
  await store.createApproval(
    {
      approvalId,
      eventId,
      planId: plan.planId,
      planRevision: 1,
      actionIds: plan.actions.map((a) => a.actionId),
      approvedTotal: plan.total,
      currency: plan.currency,
      approvedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 31 * 60_000).toISOString(),
      revokedAt: null,
    },
    {
      paymentId: `pay_${eventId}`,
      approvalId,
      checkoutSessionId: `cs_${eventId}`,
      paymentIntentId: null,
      amount: plan.total,
      currency: plan.currency,
      state: 'pending',
      refundId: null,
      refundState: 'none',
      refundReason: null,
      mode: 'simulated',
    },
  )
  return { plan, approvalId, checkoutSessionId: `cs_${eventId}` }
}

const attemptFor = (eventId: string, approvalId: string, overrides: Partial<Attempt> = {}): Attempt => ({
  attemptId: `att_${crypto.randomUUID()}`,
  eventId,
  actionId: 'act_sim_venue',
  approvalId,
  kind: 'commit',
  executionKey: `${approvalId}:act_sim_venue:commit`,
  state: 'running',
  providerReference: null,
  actualAmount: null,
  evidence: null,
  errorReason: null,
  mode: 'simulated',
  updatedAt: new Date().toISOString(),
  ...overrides,
})

describe('events and runs', () => {
  it('createEvent stores revision 1, researching, and a research run with a stable key', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    expect(event.eventId).toMatch(/^evt_/)
    expect(event).toMatchObject({ customerId: 'cust_1', briefRevision: 1, status: 'researching', planRevision: 0, progressSequence: 0 })
    expect(run).toMatchObject({ phase: 'research', state: 'running', idempotencyKey: `${event.eventId}:research:1`, correctionsUsed: 0 })
    expect(await store.getEvent(event.eventId)).toEqual(event)
  })

  it('getEventView returns the contract shape and filters progress by sequence', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    await store.appendProgress(event.eventId, 'system', 'one')
    await store.appendProgress(event.eventId, 'agent', 'two')
    const view = await store.getEventView(event.eventId, 1)
    expect(view).not.toBeNull()
    expect(view!.run?.runId).toBe(run.runId)
    expect(view!.event.progressSequence).toBe(2)
    expect(view!.progress.map((p) => p.message)).toEqual(['two'])
    expect(view!.researchResult).toBeNull()
    expect(view!.plan).toBeNull()
    expect(await store.getEventView('evt_missing')).toBeNull()
  })

  it('createRun returns the existing run for a repeated idempotency key', async () => {
    const { event } = await store.createEvent({ customerId: 'cust_1', brief })
    const input = { eventId: event.eventId, phase: 'execute' as const, briefRevision: 1, idempotencyKey: `${event.eventId}:execute:1` }
    const a = await store.createRun(input)
    const b = await store.createRun(input)
    expect(a.existing).toBe(false)
    expect(b).toEqual({ run: a.run, existing: true })
  })

  it('setEventStatus and requestCancel are conditional', async () => {
    const { event } = await store.createEvent({ customerId: 'cust_1', brief })
    expect(await store.setEventStatus(event.eventId, ['plan_ready'], 'awaiting_payment')).toBe(false)
    expect(await store.setEventStatus(event.eventId, ['researching'], 'plan_ready')).toBe(true)
    const at = new Date('2026-11-08T02:00:00.000Z')
    const c1 = await store.requestCancel(event.eventId, at)
    const c2 = await store.requestCancel(event.eventId, new Date('2026-11-08T03:00:00.000Z'))
    expect(c1?.status).toBe('canceling')
    expect(c2?.cancelRequestedAt).toBe(at.toISOString())
    await store.setEventStatus(event.eventId, ['canceling'], 'canceled')
    expect(await store.requestCancel(event.eventId, new Date())).toBeNull()
  })
})

describe('updateBrief', () => {
  it('refuses a stale revision', async () => {
    const { event } = await store.createEvent({ customerId: 'cust_1', brief })
    expect(await store.updateBrief({ eventId: event.eventId, expectedBriefRevision: 2, brief })).toEqual({ ok: false, reason: 'stale_brief' })
    expect(await store.updateBrief({ eventId: 'evt_missing', expectedBriefRevision: 1, brief })).toEqual({ ok: false, reason: 'not_found' })
  })

  it('only one of two concurrent updates on the same revision wins', async () => {
    const { event } = await store.createEvent({ customerId: 'cust_1', brief })
    const results = await Promise.all([
      store.updateBrief({ eventId: event.eventId, expectedBriefRevision: 1, brief: { ...brief, headcount: 30 } }),
      store.updateBrief({ eventId: event.eventId, expectedBriefRevision: 1, brief: { ...brief, headcount: 40 } }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'stale_brief' }])
  })

  it('supersedes the result, drops the plan, cancels the old run, and starts a new run', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    expect(await store.publishResearchResult(resultFor(event.eventId, run.runId, 1))).toEqual({ ok: true })
    await store.savePlan(planFor(event.eventId, run.runId, 1))
    expect((await store.getEvent(event.eventId))?.planRevision).toBe(1)

    const updated = await store.updateBrief({ eventId: event.eventId, expectedBriefRevision: 1, brief: { ...brief, headcount: 25 } })
    if (!updated.ok) throw new Error(updated.reason)
    expect(updated.event).toMatchObject({ briefRevision: 2, status: 'researching' })
    expect(updated.event.brief.headcount).toBe(25)
    expect(updated.run).toMatchObject({ briefRevision: 2, state: 'running', idempotencyKey: `${event.eventId}:research:2` })
    expect(updated.run.runId).not.toBe(run.runId)
    // The old run had already succeeded, so it is not canceled.
    expect(updated.previousRun).toMatchObject({ runId: run.runId, state: 'succeeded' })
    expect((await store.getResearchResult(run.runId))?.superseded).toBe(true)
    expect(await store.getPlan(event.eventId)).toBeNull()

    const view = await store.getEventView(event.eventId)
    expect(view?.researchResult).toBeNull()
    expect(view?.run?.runId).toBe(updated.run.runId)
    expect(await store.getCurrentRun(event.eventId, 'research')).toEqual(updated.run)

    // A plan can then be saved at the next plan revision for the new brief.
    await store.savePlan(planFor(event.eventId, updated.run.runId, 2, 2))
    expect((await store.getPlan(event.eventId))?.revision).toBe(2)
  })

  it('cancels a still-running research run', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    const updated = await store.updateBrief({ eventId: event.eventId, expectedBriefRevision: 1, brief })
    expect(updated.ok && updated.previousRun).toMatchObject({ runId: run.runId, state: 'canceled' })
  })

  it('refuses once the current plan has an unrevoked approval', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    await approve(event.eventId, run.runId)
    expect(await store.updateBrief({ eventId: event.eventId, expectedBriefRevision: 1, brief })).toEqual({ ok: false, reason: 'already_approved' })
    await store.revokeApprovals(event.eventId, new Date())
    expect((await store.updateBrief({ eventId: event.eventId, expectedBriefRevision: 1, brief })).ok).toBe(true)
  })

  it('savePlan refuses a plan for a stale brief revision', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    await store.updateBrief({ eventId: event.eventId, expectedBriefRevision: 1, brief })
    await expect(store.savePlan(planFor(event.eventId, run.runId, 1, 1))).rejects.toThrow(/stale/)
  })
})

describe('run lease and corrections', () => {
  it('two concurrent claims yield exactly one lease', async () => {
    const { run } = await store.createEvent({ customerId: 'cust_1', brief })
    const now = new Date()
    const claims = await Promise.all([store.claimRunAdvance(run.runId, now, 30_000), store.claimRunAdvance(run.runId, now, 30_000)])
    expect(claims.filter((c) => c !== null)).toHaveLength(1)
  })

  it('can be claimed again after the lease expires or is released, never when not running', async () => {
    const { run } = await store.createEvent({ customerId: 'cust_1', brief })
    const t0 = new Date('2026-11-08T01:00:00.000Z')
    expect(await store.claimRunAdvance(run.runId, t0, 30_000)).not.toBeNull()
    expect(await store.claimRunAdvance(run.runId, new Date(t0.getTime() + 10_000), 30_000)).toBeNull()
    const reclaimed = await store.claimRunAdvance(run.runId, new Date(t0.getTime() + 31_000), 30_000)
    expect(reclaimed?.advancingUntil).toBe(new Date(t0.getTime() + 61_000).toISOString())

    await store.releaseRunAdvance(run.runId, 12)
    await store.releaseRunAdvance(run.runId, 5)
    const released = await store.getRun(run.runId)
    expect(released).toMatchObject({ advancingUntil: null, lastSequence: 12 })

    expect(await store.setRunState(run.runId, ['running'], 'failed')).toBe(true)
    expect(await store.setRunState(run.runId, ['running'], 'succeeded')).toBe(false)
    expect(await store.claimRunAdvance(run.runId, new Date(t0.getTime() + 100_000), 30_000)).toBeNull()
  })

  it('records a correction only once, even concurrently', async () => {
    const { run } = await store.createEvent({ customerId: 'cust_1', brief })
    const results = await Promise.all([store.recordCorrection(run.runId), store.recordCorrection(run.runId)])
    expect(results.sort()).toEqual([false, true])
    expect(await store.recordCorrection(run.runId)).toBe(false)
    expect((await store.getRun(run.runId))?.correctionsUsed).toBe(1)
  })

  it('setRunSession stores the Naive session id', async () => {
    const { run } = await store.createEvent({ customerId: 'cust_1', brief })
    await store.setRunSession(run.runId, 'ses_1')
    expect((await store.getRun(run.runId))?.naiveSessionId).toBe('ses_1')
  })
})

describe('publishResearchResult', () => {
  it('stores a success result once and marks the run succeeded without touching event status', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    const result = resultFor(event.eventId, run.runId, 1)
    expect(await store.publishResearchResult(result)).toEqual({ ok: true })
    expect(await store.getResearchResult(run.runId)).toEqual(result)
    expect((await store.getRun(run.runId))?.state).toBe('succeeded')
    expect((await store.getEvent(event.eventId))?.status).toBe('researching')
    expect(await store.publishResearchResult(result)).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('rejects a duplicate when published concurrently', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    const result = resultFor(event.eventId, run.runId, 1)
    const outcomes = await Promise.all([store.publishResearchResult(result), store.publishResearchResult(result)])
    expect(outcomes).toContainEqual({ ok: true })
    expect(outcomes).toContainEqual({ ok: false, reason: 'duplicate' })
  })

  it('rejects a result for a stale brief revision', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    const updated = await store.updateBrief({ eventId: event.eventId, expectedBriefRevision: 1, brief })
    if (!updated.ok) throw new Error(updated.reason)
    expect(await store.publishResearchResult(resultFor(event.eventId, run.runId, 1))).toEqual({ ok: false, reason: 'stale_brief' })
    // The new run cannot publish under the old revision either.
    expect(await store.publishResearchResult(resultFor(event.eventId, updated.run.runId, 1))).toEqual({ ok: false, reason: 'stale_brief' })
    expect(await store.getResearchResult(run.runId)).toBeNull()
    expect(await store.publishResearchResult(resultFor(event.eventId, updated.run.runId, 2))).toEqual({ ok: true })
  })

  it('rejects a run that is not running, and an unknown run', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    await store.setRunState(run.runId, ['running'], 'canceled')
    expect(await store.publishResearchResult(resultFor(event.eventId, run.runId, 1))).toEqual({ ok: false, reason: 'run_not_active' })
    expect(await store.publishResearchResult(resultFor(event.eventId, 'run_missing', 1))).toEqual({ ok: false, reason: 'not_found' })
  })

  it('awaiting_input sets the run awaiting_input and the event needs_input', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    expect(await store.publishResearchResult(resultFor(event.eventId, run.runId, 1, 'awaiting_input'))).toEqual({ ok: true })
    expect((await store.getRun(run.runId))?.state).toBe('awaiting_input')
    expect((await store.getEvent(event.eventId))?.status).toBe('needs_input')
    expect((await store.getEventView(event.eventId))?.researchResult?.missing).toEqual(['location'])
  })

  it('failed sets the event failed', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    await store.publishResearchResult(resultFor(event.eventId, run.runId, 1, 'failed'))
    expect((await store.getEvent(event.eventId))?.status).toBe('failed')
    expect((await store.getRun(run.runId))?.state).toBe('failed')
  })
})

describe('approval and payment', () => {
  it('refuses a second open approval for the same plan revision (concurrent approve)', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    const { plan } = await approve(event.eventId, run.runId)
    const now = new Date()
    const second = {
      approvalId: `appr_${event.eventId}_2`,
      eventId: event.eventId,
      planId: plan.planId,
      planRevision: 1,
      actionIds: plan.actions.map((a) => a.actionId),
      approvedTotal: plan.total,
      currency: plan.currency,
      approvedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 31 * 60_000).toISOString(),
      revokedAt: null,
    }
    await expect(
      store.createApproval(second, {
        paymentId: `pay_${event.eventId}_2`,
        approvalId: second.approvalId,
        checkoutSessionId: `cs_${event.eventId}_2`,
        paymentIntentId: null,
        amount: plan.total,
        currency: plan.currency,
        state: 'pending',
        refundId: null,
        refundState: 'none',
        refundReason: null,
        mode: 'simulated',
      }),
    ).rejects.toBeInstanceOf(OpenApprovalExistsError)
    expect(await store.getApproval(second.approvalId)).toBeNull()
  })

  it('finds an open approval, marks payment paid only once, and stores refunds', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    const { approvalId, checkoutSessionId } = await approve(event.eventId, run.runId)
    const open = await store.findOpenApproval(event.eventId, 1, new Date())
    expect(open?.approval.approvalId).toBe(approvalId)
    expect(open?.payment.state).toBe('pending')
    expect(await store.findOpenApproval(event.eventId, 1, new Date(Date.now() + 60 * 60_000))).toBeNull()

    const paid = await Promise.all([
      store.markPaymentPaid(checkoutSessionId, 'pi_1'),
      store.markPaymentPaid(checkoutSessionId, 'pi_2'),
    ])
    expect(paid.filter((p) => p !== null)).toHaveLength(1)
    expect(await store.markPaymentPaid(checkoutSessionId, 'pi_3')).toBeNull()
    expect(await store.markPaymentExpired(checkoutSessionId)).toBe(false)
    const payment = await store.getPaymentByApproval(approvalId)
    expect(payment?.state).toBe('paid')

    await store.setRefund(payment!.paymentId, { refundId: 're_1', refundState: 'pending', refundReason: 'customer_cancellation' })
    expect(await store.getPaymentByCheckoutSession(checkoutSessionId)).toMatchObject({ refundId: 're_1', refundState: 'pending' })

    const revoked = await store.revokeApprovals(event.eventId, new Date())
    expect(revoked.map((a) => a.approvalId)).toEqual([approvalId])
    expect(await store.revokeApprovals(event.eventId, new Date())).toEqual([])
    expect((await store.getApproval(approvalId))?.revokedAt).not.toBeNull()
    expect(await store.findOpenApproval(event.eventId, 1, new Date())).toBeNull()
  })

  it('refuses an approval for a dropped plan', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    await store.savePlan(planFor(event.eventId, run.runId, 1))
    await store.updateBrief({ eventId: event.eventId, expectedBriefRevision: 1, brief })
    await expect(approve(event.eventId, run.runId)).rejects.toThrow()
  })

  it('records a Stripe event id only the first time', async () => {
    expect(await store.recordStripeEvent('evt_stripe_1')).toBe(true)
    expect(await store.recordStripeEvent('evt_stripe_1')).toBe(false)
  })
})

describe('attempts', () => {
  it('replays an insert on the same executionKey without creating a second row', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    const { approvalId } = await approve(event.eventId, run.runId)
    const first = await store.insertAttempt(attemptFor(event.eventId, approvalId))
    const concurrent = await Promise.all([
      store.insertAttempt(attemptFor(event.eventId, approvalId)),
      store.insertAttempt(attemptFor(event.eventId, approvalId)),
    ])
    expect(first.replayed).toBe(false)
    for (const r of concurrent) expect(r).toEqual({ attempt: first.attempt, replayed: true })
    expect(await store.listAttempts(event.eventId)).toHaveLength(1)
  })

  it('transitions only from the expected state and only along legal moves', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cust_1', brief })
    const { approvalId } = await approve(event.eventId, run.runId)
    const { attempt } = await store.insertAttempt(attemptFor(event.eventId, approvalId))

    expect(await store.transitionAttempt(attempt.attemptId, 'unknown', 'succeeded', {})).toBeNull()
    expect(await store.transitionAttempt(attempt.attemptId, 'running', 'pending', {})).toBeNull()
    const done = await store.transitionAttempt(attempt.attemptId, 'running', 'succeeded', {
      providerReference: 'sim_1',
      actualAmount: 30000,
      evidence: { providerReference: 'sim_1', confirmation: 'ok' },
    })
    expect(done).toMatchObject({ state: 'succeeded', providerReference: 'sim_1', actualAmount: 30000, evidence: { providerReference: 'sim_1' } })
    expect(await store.transitionAttempt(attempt.attemptId, 'running', 'failed', { errorReason: 'late' })).toBeNull()
    expect((await store.listAttempts(event.eventId))[0].state).toBe('succeeded')
  })
})

describe('progress', () => {
  it('assigns strictly increasing sequences under concurrent appends', async () => {
    const { event } = await store.createEvent({ customerId: 'cust_1', brief })
    const entries = await Promise.all(Array.from({ length: 20 }, (_, i) => store.appendProgress(event.eventId, 'agent', `m${i}`)))
    expect(entries.map((e) => e.sequence).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect((await store.getEvent(event.eventId))?.progressSequence).toBe(20)
    expect((await store.getEventView(event.eventId))?.progress.map((p) => p.sequence)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    await expect(store.appendProgress('evt_missing', 'agent', 'x')).rejects.toThrow()
  })
})

describe('authorized commitment claim', () => {
  it('serializes cancellation and claim so cancellation cannot finish over an unseen commitment', async () => {
    const { event, run } = await store.createEvent({ customerId: 'cancel-race', brief })
    const approval = await approve(event.eventId, run.runId)
    await store.markPaymentPaid(approval.checkoutSessionId, 'pi_race')
    await store.requestCancel(event.eventId, new Date())
    expect(await store.claimCommit(attemptFor(event.eventId, approval.approvalId), new Date())).toBeNull()
    expect(await store.listAttempts(event.eventId)).toEqual([])
  })

  it('records a winning claim before cancellation and replays it without starting a second attempt', async () => {
    const { event, run } = await store.createEvent({ customerId: 'claim-race', brief })
    const approval = await approve(event.eventId, run.runId)
    await store.markPaymentPaid(approval.checkoutSessionId, 'pi_claim')
    const attempt = attemptFor(event.eventId, approval.approvalId)
    expect(await store.claimCommit(attempt, new Date())).toMatchObject({ replayed: false })
    await store.requestCancel(event.eventId, new Date())
    expect(await store.claimCommit(attempt, new Date())).toMatchObject({ replayed: true })
    expect(await store.listAttempts(event.eventId)).toHaveLength(1)
  })
})
