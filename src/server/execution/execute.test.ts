import { describe, expect, it, vi } from 'vitest'
import { bookedEvent, type Approval, type Payment } from '../../contracts'
import { MemoryStore } from '../testing/memory-store'
import type { SupplierAdapter } from './adapter'
import { cancelAction, executeAction, reconcileAction, type ExecutionDeps } from './execute'
import { SimulatedSupplierAdapter, simulatedOptionsFromEnv, simulatedReference } from './simulated-adapter'

const NOW = new Date('2026-11-08T01:10:00.000Z')
const EVENT = 'evt_sim_1'
const VENUE = 'act_sim_venue'
const ITEM = 'act_sim_item'

function setup(opts: { approval?: Partial<Approval> | null; payment?: Partial<Payment>; adapter?: SupplierAdapter; status?: 'awaiting_payment' | 'executing' } = {}) {
  const store = new MemoryStore()
  const approval = opts.approval === null ? undefined : { ...bookedEvent.approval!, ...opts.approval }
  store.seed({
    event: { ...bookedEvent.event, status: opts.status ?? 'awaiting_payment', progressSequence: 0 },
    plan: bookedEvent.plan!,
    approval,
    payment: approval ? { ...bookedEvent.payment!, ...opts.payment } : undefined,
  })
  const adapter = opts.adapter ?? new SimulatedSupplierAdapter()
  const commit = vi.spyOn(adapter, 'commit')
  const deps: ExecutionDeps = { store, adapterFor: () => adapter, now: () => NOW, adapterTimeoutMs: 200 }
  const execute = (actionId: string) => executeAction(deps, { eventId: EVENT, actionId, reason: `book ${actionId}` })
  return { store, adapter, commit, deps, execute }
}

describe('execute_action refusals', () => {
  it('refuses without an approval', async () => {
    const { execute, commit } = setup({ approval: null })
    expect(await execute(VENUE)).toMatchObject({ ok: false, errorCode: 'not_allowed', reason: 'no_approval' })
    expect(commit).not.toHaveBeenCalled()
  })

  it('refuses an expired approval', async () => {
    const { execute, commit } = setup({ approval: { expiresAt: '2026-11-08T01:09:00.000Z' } })
    expect(await execute(VENUE)).toMatchObject({ ok: false, errorCode: 'not_allowed', reason: 'expired' })
    expect(commit).not.toHaveBeenCalled()
  })

  it('refuses a revoked approval', async () => {
    const { execute } = setup({ approval: { revokedAt: '2026-11-08T01:08:00.000Z' } })
    expect(await execute(VENUE)).toMatchObject({ ok: false, reason: 'revoked' })
  })

  it('refuses an approval for an older plan revision', async () => {
    const { execute } = setup({ approval: { planRevision: 2 } })
    expect(await execute(VENUE)).toMatchObject({ ok: false, reason: 'stale_revision' })
  })

  it('refuses an unpaid approval', async () => {
    const { execute, commit } = setup({ payment: { state: 'pending' } })
    expect(await execute(VENUE)).toMatchObject({ ok: false, errorCode: 'not_allowed', reason: 'unpaid' })
    expect(commit).not.toHaveBeenCalled()
  })

  it('refuses a simulated payment for a live action (mode mismatch)', async () => {
    const { store, execute, commit } = setup()
    const plan = store.plans.get(EVENT)!
    plan.actions = plan.actions.map((a) => ({ ...a, mode: 'live' as const }))
    expect(await execute(VENUE)).toMatchObject({ ok: false, reason: 'mode_mismatch' })
    expect(commit).not.toHaveBeenCalled()
  })

  it('refuses the item while the venue it depends on is pending', async () => {
    const { execute, commit } = setup()
    expect(await execute(ITEM)).toMatchObject({ ok: false, reason: 'dependency_pending' })
    expect(commit).not.toHaveBeenCalled()
  })

  it('refuses once cancellation was requested', async () => {
    const { store, execute } = setup()
    await store.requestCancel(EVENT, NOW)
    expect(await execute(VENUE)).toMatchObject({ ok: false, reason: 'event_canceling' })
  })

  it('returns amount_exceeded when the supplier price is above maximumAmount', async () => {
    const adapter = new SimulatedSupplierAdapter({ priceFor: (a) => a.maximumAmount + 1 })
    const { execute } = setup({ adapter })
    const result = await execute(VENUE)
    expect(result).toMatchObject({ ok: false, errorCode: 'amount_exceeded' })
    expect(!result.ok && result.attempt?.state).toBe('failed')
  })

  it('stores the reason and the refusal as progress', async () => {
    const { store } = setup({ approval: null })
    const deps: ExecutionDeps = { store, adapterFor: () => new SimulatedSupplierAdapter(), now: () => NOW }
    await executeAction(deps, { eventId: EVENT, actionId: VENUE, reason: 'Booking the venue the customer approved.' })
    expect(store.progress.map((p) => [p.actor, p.message])).toEqual([
      ['agent', 'Booking the venue the customer approved.'],
      ['system', `Refused ${VENUE}: no_approval.`],
    ])
  })
})

describe('execute_action success and replay', () => {
  it('books both actions in order, then replays without calling the supplier', async () => {
    const { store, execute, commit } = setup()

    const venue = await execute(VENUE)
    expect(venue).toMatchObject({ ok: true, replayed: false, eventStatus: 'executing' })
    if (!venue.ok) throw new Error('unreachable')
    expect(venue.attempt).toMatchObject({
      state: 'succeeded',
      executionKey: `appr_sim_1:${VENUE}:commit`,
      providerReference: simulatedReference(`appr_sim_1:${VENUE}:commit`),
      mode: 'simulated',
      actualAmount: 30000,
    })
    expect(venue.attempt.providerReference).toMatch(/^sim_/)

    const item = await execute(ITEM)
    expect(item).toMatchObject({ ok: true, replayed: false, eventStatus: 'booked' })
    expect(store.events.get(EVENT)!.status).toBe('booked')

    const again = await execute(VENUE)
    expect(again).toMatchObject({ ok: true, replayed: true })
    expect(again.ok && again.attempt.attemptId).toBe(venue.attempt.attemptId)
    expect(commit).toHaveBeenCalledTimes(2)
    expect(commit.mock.calls.filter(([a]) => a.actionId === VENUE)).toHaveLength(1)
    expect(store.attempts).toHaveLength(2)
  })

  it('returns the stored attempt on a retry after the approval expired', async () => {
    const { store, execute, commit } = setup()
    const venue = await execute(VENUE)
    if (!venue.ok) throw new Error('unreachable')
    store.approvals.find((a) => a.approvalId === venue.attempt.approvalId)!.expiresAt = '2026-11-08T01:09:00.000Z'
    const again = await execute(VENUE)
    expect(again).toMatchObject({ ok: true, replayed: true, attempt: { attemptId: venue.attempt.attemptId, state: 'succeeded' } })
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('records unknown when the adapter times out, and reconcile resolves it without a new purchase', async () => {
    const adapter = new SimulatedSupplierAdapter({ failure: 'timeout', failureTarget: 'venue_booking' })
    const { store, execute, commit, deps } = setup({ adapter })
    const reconcile = vi.spyOn(adapter, 'reconcile')

    const result = await execute(VENUE)
    expect(result).toMatchObject({ ok: true, eventStatus: 'executing', attempt: { state: 'unknown' } })

    // Repeating execute_action never buys again.
    expect(await execute(VENUE)).toMatchObject({ ok: true, replayed: true, attempt: { state: 'unknown' } })
    expect(commit).toHaveBeenCalledTimes(1)

    const reconciled = await reconcileAction(deps, { eventId: EVENT, actionId: VENUE })
    expect(reconciled).toMatchObject({ ok: true, attempt: { state: 'succeeded', providerReference: simulatedReference(`appr_sim_1:${VENUE}:commit`) } })
    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(store.attempts).toHaveLength(1)

    // Nothing unknown is left to reconcile.
    expect(await reconcileAction(deps, { eventId: EVENT, actionId: VENUE })).toMatchObject({ ok: false, reason: 'not_unknown' })
  })

  it('treats a hanging adapter as unknown after the timeout', async () => {
    const hanging: SupplierAdapter = {
      mode: 'simulated',
      commit: () => new Promise(() => {}),
      cancel: async () => ({ outcome: 'failed' }),
      reconcile: async () => ({ outcome: 'failed', errorReason: 'no booking' }),
    }
    const { execute, deps } = setup({ adapter: hanging })
    expect(await execute(VENUE)).toMatchObject({ ok: true, attempt: { state: 'unknown' } })
    expect(await reconcileAction(deps, { eventId: EVENT, actionId: VENUE })).toMatchObject({ ok: true, attempt: { state: 'failed' }, eventStatus: 'failed' })
  })

  it('marks the event partially booked when the item fails definitely', async () => {
    const adapter = new SimulatedSupplierAdapter({ failure: 'fail', failureTarget: ITEM })
    const { execute } = setup({ adapter })
    await execute(VENUE)
    expect(await execute(ITEM)).toMatchObject({ ok: true, attempt: { state: 'failed' }, eventStatus: 'partially_booked' })
  })
})

describe('cancel_action', () => {
  it('refuses before the customer requests cancellation', async () => {
    const { execute, deps } = setup()
    await execute(VENUE)
    expect(await cancelAction(deps, { eventId: EVENT, actionId: VENUE, reason: 'cancel' })).toMatchObject({ ok: false, reason: 'cancel_not_requested' })
  })

  it('cancels both commitments after cancel is requested and marks the event canceled once', async () => {
    const { store, execute, deps, adapter } = setup()
    const onAllCanceled = vi.fn(async () => {})
    deps.onAllCanceled = onAllCanceled
    const cancelSpy = vi.spyOn(adapter, 'cancel')
    await execute(VENUE)
    await execute(ITEM)
    await store.requestCancel(EVENT, NOW)

    const venue = await cancelAction(deps, { eventId: EVENT, actionId: VENUE, reason: 'Customer canceled the event.' })
    expect(venue).toMatchObject({ ok: true, replayed: false, eventStatus: 'canceling', attempt: { kind: 'cancel', state: 'succeeded', executionKey: `appr_sim_1:${VENUE}:cancel` } })
    const item = await cancelAction(deps, { eventId: EVENT, actionId: ITEM, reason: 'Customer canceled the event.' })
    expect(item).toMatchObject({ ok: true, eventStatus: 'canceled' })
    expect(await cancelAction(deps, { eventId: EVENT, actionId: ITEM, reason: 'again' })).toMatchObject({ ok: true, replayed: true })

    expect(cancelSpy).toHaveBeenCalledTimes(2)
    expect(onAllCanceled).toHaveBeenCalledTimes(1)
    // The original commits stay succeeded.
    expect(store.attempts.filter((a) => a.kind === 'commit').every((a) => a.state === 'succeeded')).toBe(true)
  })

  it('refuses to cancel an action with no commitment', async () => {
    const { store, deps } = setup()
    await store.requestCancel(EVENT, NOW)
    expect(await cancelAction(deps, { eventId: EVENT, actionId: VENUE, reason: 'cancel' })).toMatchObject({ ok: false, reason: 'no_commitment' })
  })
})

describe('simulated adapter env', () => {
  it('parses SIMULATED_SUPPLIER_FAILURE', () => {
    expect(simulatedOptionsFromEnv(undefined)).toEqual({})
    expect(simulatedOptionsFromEnv('timeout')).toEqual({ failure: 'timeout', failureTarget: undefined })
    expect(simulatedOptionsFromEnv('fail:item_purchase')).toEqual({ failure: 'fail', failureTarget: 'item_purchase' })
    expect(simulatedOptionsFromEnv('nonsense')).toEqual({})
  })
})

describe('cancellation ordering', () => {
  it('refuses a commitment when cancellation wins after the initial authorization check', async () => {
    const { store, execute, commit } = setup()
    const claim = store.claimCommit.bind(store)
    vi.spyOn(store, 'claimCommit').mockImplementationOnce(async (attempt, now) => {
      await store.requestCancel(EVENT, NOW)
      return claim(attempt, now)
    })
    expect(await execute(VENUE)).toMatchObject({ ok: false, reason: 'authorization_changed' })
    expect(commit).not.toHaveBeenCalled()
    expect(await store.listAttempts(EVENT)).toEqual([])
  })
})
