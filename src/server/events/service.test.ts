import { settleCancellation } from '../execution/execute'
import { issueFinalRefund } from '../payments/webhook'
import { describe, expect, it } from 'vitest'
import type { ResearchPort } from './deps'
import { ApiError } from './errors'
import { approve, cancel, createEvent, getEventView, updateBrief } from './service'
import { simulatedResult } from './simulatedResearch'
import { makeDeps, validBrief } from './testFakes'

async function expectApiError(p: Promise<unknown>, status: number, errorCode?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(ApiError)
  expect((err as ApiError).status).toBe(status)
  if (errorCode) expect((err as ApiError).errorCode).toBe(errorCode)
  return err as ApiError
}

async function planReady() {
  const ctx = makeDeps()
  const created = await createEvent(ctx.deps, validBrief)
  const view = await getEventView(ctx.deps, created.event.eventId)
  return { ...ctx, eventId: created.event.eventId, view }
}

describe('createEvent', () => {
  it('returns 422 with missing field names before any research', async () => {
    let started = 0
    const research: ResearchPort = {
      startResearch: async () => {
        started++
        return { naiveSessionId: 's' }
      },
      advanceResearch: async () => ({ status: 'running' }),
      cancelResearch: async () => {},
    }
    const { deps, store } = makeDeps({ research })
    const { location: _l, headcount: _h, ...partial } = validBrief
    const err = await expectApiError(createEvent(deps, { ...partial, eventType: '' }), 422, 'missing_fields')
    expect(err.extra.missing).toEqual(['eventType', 'location', 'headcount'])
    expect(started).toBe(0)
    expect(store.events.size).toBe(0)
  })

  it('creates the event, starts research, and records the session', async () => {
    const { deps } = makeDeps()
    const view = await createEvent(deps, validBrief)
    expect(view.event.status).toBe('researching')
    expect(view.run?.idempotencyKey).toBe(`${view.event.eventId}:research:1`)
    expect(view.run?.naiveSessionId).toMatch(/^sim_session_/)
    expect(view.progress.map((p) => p.actor)).toEqual(['system'])
  })
})

describe('getEventView', () => {
  it('returns 403 for another customer and 404 for an unknown event', async () => {
    const { deps, customer } = makeDeps()
    const view = await createEvent(deps, validBrief)
    customer.id = 'user_mallory'
    await expectApiError(getEventView(deps, view.event.eventId), 403, 'forbidden')
    await expectApiError(getEventView(deps, 'evt_missing'), 404, 'not_found')
  })

  it('advances research once under concurrent polls (single-flight lease)', async () => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const research: ResearchPort = {
      startResearch: async (i) => ({ naiveSessionId: `ses_${i.runId}` }),
      advanceResearch: async ({ event, run }) => {
        calls++
        await gate
        return { status: 'done', result: simulatedResult(event, run, new Date()), lastSequence: 7 }
      },
      cancelResearch: async () => {},
    }
    const { deps, store } = makeDeps({ research })
    const { event } = await createEvent(deps, validBrief)
    const a = getEventView(deps, event.eventId)
    const b = getEventView(deps, event.eventId)
    const bView = await b // the poll without the lease returns stored state immediately
    expect(bView.event.status).toBe('researching')
    release()
    const aView = await a
    expect(calls).toBe(1)
    expect(aView.event.status).toBe('plan_ready')
    const run = [...store.runs.values()][0]
    expect(run.advancingUntil).toBeNull()
    expect(run.lastSequence).toBe(7)
  })

  it('derives a plan and moves to plan_ready', async () => {
    const { view } = await planReady()
    expect(view.event.status).toBe('plan_ready')
    expect(view.plan?.revision).toBe(1)
    expect(view.plan?.total).toBe(31500)
    expect(view.plan?.serviceFee).toBe(0)
    expect(view.run?.state).toBe('succeeded')
  })

  it('moves to researched when the budget fit is unknown', async () => {
    const research: ResearchPort = {
      startResearch: async (i) => ({ naiveSessionId: `ses_${i.runId}` }),
      advanceResearch: async ({ event, run }) => ({
        status: 'done',
        result: { ...simulatedResult(event, run, new Date()), budgetFit: 'unknown' },
        lastSequence: 1,
      }),
      cancelResearch: async () => {},
    }
    const { deps } = makeDeps({ research })
    const { event } = await createEvent(deps, validBrief)
    const view = await getEventView(deps, event.eventId)
    expect(view.event.status).toBe('researched')
    expect(view.plan).toBeNull()
    expect(view.researchResult?.budgetFit).toBe('unknown')
  })
})

describe('updateBrief', () => {
  it('merges changes, rejects a stale revision, and cancels the previous session', async () => {
    const canceled: string[] = []
    const research: ResearchPort = {
      startResearch: async (i) => ({ naiveSessionId: `ses_${i.runId}` }),
      advanceResearch: async () => ({ status: 'running' }),
      cancelResearch: async (id) => void canceled.push(id.naiveSessionId!),
    }
    const { deps } = makeDeps({ research })
    const { event, run } = await createEvent(deps, validBrief)
    const view = await updateBrief(deps, event.eventId, 1, { headcount: 30 })
    expect(view.event.briefRevision).toBe(2)
    expect(view.event.brief.headcount).toBe(30)
    expect(view.event.brief.location).toBe(validBrief.location)
    expect(view.run?.idempotencyKey).toBe(`${event.eventId}:research:2`)
    expect(canceled).toEqual([run!.naiveSessionId])
    await expectApiError(updateBrief(deps, event.eventId, 1, { headcount: 40 }), 409, 'stale_brief')
  })
})

describe('approve', () => {
  it('refuses a plan with unknown cancellation terms', async () => {
    const { deps, store, eventId, view } = await planReady()
    const plan = store.plans.get(eventId)!
    plan.actions[0].cancellationTerms = { known: false }
    await expectApiError(approve(deps, eventId, view.plan!.planId, 1), 422, 'budget_not_verified')
  })

  it('returns 409 for a stale plan revision', async () => {
    const { deps, eventId, view } = await planReady()
    await expectApiError(approve(deps, eventId, view.plan!.planId, 2), 409, 'stale_plan')
  })

  it('creates approval and Checkout with the same expiry, at least 30 minutes out', async () => {
    const { deps, stripe, eventId, view, clock } = await planReady()
    const res = await approve(deps, eventId, view.plan!.planId, 1)
    expect(stripe.createCalls).toHaveLength(1)
    const { params, idempotencyKey } = stripe.createCalls[0]
    expect(params.expires_at * 1000).toBe(new Date(res.approval.expiresAt).getTime())
    expect(params.expires_at * 1000 - clock.t.getTime()).toBeGreaterThanOrEqual(30 * 60 * 1000)
    expect(params.line_items[0].price_data.unit_amount).toBe(view.plan!.total)
    expect(params.metadata).toEqual({ approvalId: res.approval.approvalId, eventId, planRevision: '1' })
    expect(idempotencyKey).toBe(`${res.approval.approvalId}:checkout`)
    expect(res.payment.state).toBe('pending')
    const after = await getEventView(deps, eventId)
    expect(after.event.status).toBe('awaiting_payment')
  })

  it('returns the same Checkout URL when approved twice', async () => {
    const { deps, stripe, eventId, view } = await planReady()
    const first = await approve(deps, eventId, view.plan!.planId, 1)
    const second = await approve(deps, eventId, view.plan!.planId, 1)
    expect(second.checkoutUrl).toBe(first.checkoutUrl)
    expect(second.approval.approvalId).toBe(first.approval.approvalId)
    expect(stripe.createCalls).toHaveLength(1)
  })
})

describe('cancel', () => {
  it('revokes the approval, expires open Checkout, and cancels with nothing paid', async () => {
    const { deps, stripe, eventId, view, cancellations } = await planReady()
    const { payment } = await approve(deps, eventId, view.plan!.planId, 1)
    const after = await cancel(deps, eventId)
    expect(stripe.expired).toEqual([payment.checkoutSessionId])
    expect(after.approval?.revokedAt).not.toBeNull()
    expect(after.event.status).toBe('canceled')
    expect(cancellations).toHaveLength(0)
  })

  it('cancels a running research session', async () => {
    const canceled: string[] = []
    const research: ResearchPort = {
      startResearch: async (i) => ({ naiveSessionId: `ses_${i.runId}` }),
      advanceResearch: async () => ({ status: 'running' }),
      cancelResearch: async (id) => void canceled.push(id.naiveSessionId!),
    }
    const { deps } = makeDeps({ research })
    const { event, run } = await createEvent(deps, validBrief)
    const after = await cancel(deps, event.eventId)
    expect(canceled).toEqual([run!.naiveSessionId])
    expect(after.run?.state).toBe('canceled')
  })
})


it('retries the refund after a paid cancellation already revoked its approval', async () => {
  const { deps, store, stripe, eventId, view } = await planReady()
  const { payment, approval } = await approve(deps, eventId, view.plan!.planId, 1)
  await store.markPaymentPaid(payment.checkoutSessionId, 'pi_retry_cancel')
  const original = deps.stripe.refunds.create
  let calls = 0
  deps.stripe.refunds.create = async (...args) => {
    if (++calls === 1) throw new Error('refund temporarily unavailable')
    return original(...args)
  }
  const seen: string[][] = []
  deps.hooks.startSupplierCancellation = async ({ paidApprovalIds }) => {
    seen.push(paidApprovalIds)
    await settleCancellation({
      store, adapterFor: () => { throw new Error('No supplier commitment exists') },
      onAllCanceled: async id => { await issueFinalRefund(deps, id) },
    }, eventId)
  }
  await expect(cancel(deps, eventId)).rejects.toThrow('refund temporarily unavailable')
  expect((await store.getEvent(eventId))?.status).toBe('canceling')
  expect((await store.getApproval(approval.approvalId))?.revokedAt).not.toBeNull()
  const retried = await cancel(deps, eventId)
  expect(seen).toEqual([[approval.approvalId], [approval.approvalId]])
  expect(retried.event.status).toBe('canceled')
  expect(retried.payment?.refundState).toBe('pending')
  expect(stripe.refundCalls).toHaveLength(1)
})
