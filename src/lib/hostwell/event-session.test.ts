import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { bookedEvent, canceledEvent, planReadyEvent, type EventView } from '../../contracts'
import { createEventApi } from './event-api'
import { createEventSession } from './event-session'

const running = (): EventView => ({ ...structuredClone(planReadyEvent), event: { ...planReadyEvent.event, status: 'researching' },
  run: { ...planReadyEvent.run!, state: 'running' }, researchResult: null, plan: null })
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
const sessions: Array<ReturnType<typeof createEventSession>> = []
function setup(fetcher: (url: string, init?: RequestInit) => Promise<Response>, identity: string | null = 'user') {
  const session = createEventSession({ eventId: planReadyEvent.event.eventId, identity }, createEventApi(fetcher))
  sessions.push(session)
  session.start()
  return session
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => { sessions.forEach(session => session.stop()); sessions.length = 0; vi.useRealTimers() })
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms)

test('loads full state then polls one second after settlement without overlap', async () => {
  const first = deferred<Response>()
  const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(json(running()))
  const session = setup(fetcher)
  await tick(5000)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(session.getSnapshot().loading).toBe(true)
  first.resolve(json(running()))
  await tick()
  expect(session.getSnapshot().view?.event.eventId).toBe(planReadyEvent.event.eventId)
  await tick(999)
  expect(fetcher).toHaveBeenCalledTimes(1)
  await tick(1)
  expect(fetcher.mock.calls[1][0]).toBe(`/api/events/${planReadyEvent.event.eventId}?afterSequence=3`)
})

test('transient reads back off to at most five seconds and reset after success', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('private transport data'))
  const session = setup(fetcher)
  await tick()
  for (const delay of [1000, 2000, 4000, 5000]) {
    const before = fetcher.mock.calls.length
    await tick(delay - 1)
    expect(fetcher).toHaveBeenCalledTimes(before)
    await tick(1)
    expect(fetcher).toHaveBeenCalledTimes(before + 1)
  }
  expect(session.getSnapshot().error?.code).toBe('connection_failed')
  expect(session.getSnapshot().error?.message).not.toContain('private')
  fetcher.mockImplementation(async () => json(running()))
  await tick(5000)
  expect(session.getSnapshot().error).toBeNull()
  const before = fetcher.mock.calls.length
  await tick(1000)
  expect(fetcher).toHaveBeenCalledTimes(before + 1)
})

test.each([401, 403, 404])('access error %i clears private state and stops reads', async status => {
  const fetcher = vi.fn().mockResolvedValueOnce(json(running())).mockResolvedValue(json({ errorCode: 'denied' }, status))
  const session = setup(fetcher)
  await tick(1000)
  expect(session.getSnapshot().view).toBeNull()
  expect(session.getSnapshot().error?.status).toBe(status)
  await tick(10000)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test('stop aborts reads and rejects late responses; null identity makes no calls', async () => {
  const pending = deferred<Response>()
  const fetcher = vi.fn((_url: string, _init?: RequestInit) => pending.promise)
  const session = setup(fetcher)
  session.stop()
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
  pending.resolve(json(planReadyEvent))
  await tick(5000)
  expect(session.getSnapshot().view).toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(1)
  const disabled = setup(fetcher, null)
  await disabled.refresh()
  await expect(disabled.cancel()).rejects.toMatchObject({ code: 'session_inactive' })
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('rejects mismatched event and stale brief responses', async () => {
  const newer = { ...running(), event: { ...running().event, briefRevision: 2 }, run: { ...running().run!, briefRevision: 2 } }
  const fetcher = vi.fn().mockResolvedValueOnce(json(newer)).mockResolvedValueOnce(json(running()))
    .mockResolvedValue(json({ ...running(), event: { ...running().event, eventId: 'other' } }))
  const session = setup(fetcher)
  await tick(1000)
  expect(session.getSnapshot().view?.event.briefRevision).toBe(2)
  await tick(1000)
  expect(session.getSnapshot().view?.event.eventId).toBe(newer.event.eventId)
  expect(session.getSnapshot().error?.code).toBe('event_mismatch')
})

test('current-plan approval is single-flight and old same-cursor GET cannot undo it', async () => {
  const read = deferred<Response>()
  const approval = deferred<Response>()
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return approval.promise
    return fetcher.mock.calls.length === 1 ? json(planReadyEvent) : read.promise
  })
  const session = setup(fetcher)
  await tick()
  const refresh = session.refresh()
  const approve = session.approve()
  expect(session.getSnapshot().pending).toBe(true)
  await expect(session.cancel()).rejects.toMatchObject({ code: 'mutation_pending' })
  expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ planId: planReadyEvent.plan!.planId, planRevision: planReadyEvent.plan!.revision })
  approval.resolve(json({ approval: bookedEvent.approval, payment: { ...bookedEvent.payment!, state: 'pending' }, checkoutUrl: 'https://checkout.example.com/session' }))
  await expect(approve).resolves.toBe('https://checkout.example.com/session')
  read.resolve(json(planReadyEvent))
  await refresh
  expect(session.getSnapshot().view?.payment?.state).toBe('pending')
  expect(session.getSnapshot().pending).toBe(false)
})

test('brief edits use the current revision and conflict refreshes without retrying the write', async () => {
  const newer = { ...planReadyEvent, event: { ...planReadyEvent.event, briefRevision: 2 } }
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'PATCH'
    ? json({ errorCode: 'stale_revision', message: 'Review current answers.' }, 409)
    : json(fetcher.mock.calls.length === 1 ? planReadyEvent : newer))
  const session = setup(fetcher)
  await tick()
  await expect(session.update({ headcount: 30 })).rejects.toMatchObject({ status: 409 })
  await tick()
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ expectedBriefRevision: 1, changes: { headcount: 30 } })
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1)
  expect(session.getSnapshot().view?.event.briefRevision).toBe(2)
})

test('uncertain writes are never repeated by polling or a second click without reconciliation', async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') throw new Error('lost response')
    return json(planReadyEvent)
  })
  const session = setup(fetcher)
  await tick()
  await expect(session.cancel()).rejects.toMatchObject({ code: 'outcome_unknown' })
  await expect(session.cancel()).rejects.toMatchObject({ code: 'outcome_unknown' })
  await tick(10000)
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

test.each(['awaiting_payment', 'executing', 'canceling'] as const)('continues polling %s without treating terminal research as completion', async status => {
  const fetcher = vi.fn(async () => json({ ...planReadyEvent, event: { ...planReadyEvent.event, status } }))
  setup(fetcher)
  await tick(2000)
  expect(fetcher).toHaveBeenCalledTimes(3)
})

test('refund pending polls until authoritative refund completion', async () => {
  const completed = { ...canceledEvent, payment: { ...canceledEvent.payment!, refundState: 'succeeded' } }
  const fetcher = vi.fn().mockResolvedValueOnce(json(canceledEvent)).mockResolvedValue(json(completed))
  const session = setup(fetcher)
  await tick(1000)
  expect(session.getSnapshot().view?.payment?.refundState).toBe('succeeded')
  await tick(10000)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test('GET advances a slow research run through its deadline then stops on the terminal result', async () => {
  const start = Date.now()
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => {
    await new Promise(resolve => setTimeout(resolve, 2000))
    return json(Date.now() - start >= 120000
      ? { ...running(), event: { ...running().event, status: 'researched' }, run: { ...running().run!, state: 'partial' } }
      : running())
  })
  const session = setup(fetcher)
  await tick(124000)
  expect(session.getSnapshot().view?.run?.state).toBe('partial')
  const count = fetcher.mock.calls.length
  expect(count).toBeLessThanOrEqual(41)
  await tick(10000)
  expect(fetcher).toHaveBeenCalledTimes(count)
  expect(fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
})

test('an aborted old read cannot restart polling after a mutation loses access', async () => {
  const pending = deferred<Response>()
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? json({ errorCode: 'forbidden' }, 403)
    : fetcher.mock.calls.length === 1 ? json(running()) : pending.promise)
  const session = setup(fetcher)
  await tick()
  const refresh = session.refresh()
  await expect(session.cancel()).rejects.toMatchObject({ status: 403 })
  pending.resolve(json(running()))
  await refresh
  await tick(10000)
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect(session.getSnapshot().view).toBeNull()
})

test('stopping during approval aborts the write and never returns a checkout URL to the old account', async () => {
  const approval = deferred<Response>()
  const fetcher = vi.fn().mockResolvedValueOnce(json(planReadyEvent)).mockReturnValue(approval.promise)
  const session = setup(fetcher)
  await tick()
  const pending = session.approve()
  const rejected = expect(pending).rejects.toMatchObject({ code: 'session_inactive' })
  session.stop()
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true)
  approval.resolve(json({ approval: bookedEvent.approval, payment: bookedEvent.payment, checkoutUrl: 'https://checkout.example.com/session' }))
  await rejected
  expect(session.getSnapshot().view).toBeNull()
})

test('no plan and mismatched brief revision cannot submit approval', async () => {
  const view = { ...planReadyEvent, event: { ...planReadyEvent.event, briefRevision: 2 } }
  const fetcher = vi.fn(async () => json(view))
  const session = setup(fetcher)
  await tick()
  await expect(session.approve()).rejects.toMatchObject({ code: 'plan_unavailable' })
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('reload after the research deadline reads full authoritative terminal state without restarting', async () => {
  const expired = { ...running(), run: { ...running().run!, state: 'partial' as const } }
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json(expired))
  const session = setup(fetcher)
  await tick(121000)
  expect(fetcher).toHaveBeenCalledTimes(1)
  session.stop()
  const restored = setup(fetcher)
  await tick(10000)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls.map(call => call[0])).toEqual([`/api/events/${expired.event.eventId}`, `/api/events/${expired.event.eventId}`])
  expect(restored.getSnapshot().view?.run?.state).toBe('partial')
})

test('automatic conflict reconciliation preserves the mutation error until explicit refresh', async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'PATCH'
    ? json({ errorCode: 'stale_revision', message: 'Review current answers.' }, 409)
    : json(planReadyEvent))
  const session = setup(fetcher)
  await tick()
  await expect(session.update({ headcount: 30 })).rejects.toMatchObject({ code: 'stale_revision' })
  await tick()
  expect(session.getSnapshot().error?.code).toBe('stale_revision')
  await session.refresh()
  expect(session.getSnapshot().error).toBeNull()
})
