import { expect, test, vi } from 'vitest'
import { planReadyEvent, bookedEvent } from '../../contracts'
import { createEventApi, mergeEventView } from './event-api'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

test('uses authenticated same-origin reads and encodes event identity and progress cursor', async () => {
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => response(planReadyEvent))
  await createEventApi(fetcher).read('event/a', 3)
  expect(fetcher.mock.calls[0]).toEqual(['/api/events/event%2Fa?afterSequence=3', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' })])
})

test('submits the current brief revision and exact displayed plan without retrying writes', async () => {
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => response(planReadyEvent))
  const api = createEventApi(fetcher)
  await api.update('evt_sim_1', 2, { headcount: 30 })
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ expectedBriefRevision: 2, changes: { headcount: 30 } })
  fetcher.mockImplementation(async () => { throw new TypeError('network lost') })
  await expect(api.approve('evt_sim_1', 'plan-current', 3)).rejects.toThrow('outcome is unknown')
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test('preserves validation details and distinguishes authentication errors', async () => {
  const fetcher = vi.fn(async () => response({ errorCode: 'missing_fields', message: 'Location required', missing: ['location'] }, 422))
  await expect(createEventApi(fetcher).create(planReadyEvent.event.brief)).rejects.toMatchObject({ status: 422, code: 'missing_fields', details: { missing: ['location'] } })
  fetcher.mockImplementation(async () => response({ errorCode: 'unauthenticated', message: 'Sign in required.' }, 401))
  await expect(createEventApi(fetcher).read('event')).rejects.toMatchObject({ status: 401, code: 'unauthenticated' })
})

test('rejects malformed successful responses instead of displaying fixture success', async () => {
  const api = createEventApi(async () => response({ event: { status: 'booked' } }))
  await expect(api.read('event')).rejects.toThrow('invalid response')
})

test('merges incremental progress once while refreshing payment and summary state', () => {
  const delta = { ...bookedEvent, progress: bookedEvent.progress.slice(2).reverse() }
  const merged = mergeEventView(planReadyEvent, delta)
  expect(merged.payment?.state).toBe('paid')
  expect(merged.progress.map(entry => entry.sequence)).toEqual([1, 2, 3, 4, 5, 6])
  expect(mergeEventView(merged, delta).progress).toEqual(merged.progress)
})

test('late old-revision reads cannot replace current state and different events never share progress', () => {
  const current = { ...bookedEvent, event: { ...bookedEvent.event, briefRevision: 2 } }
  expect(mergeEventView(current, planReadyEvent)).toBe(current)
  const other = { ...planReadyEvent, event: { ...planReadyEvent.event, eventId: 'other' }, progress: [] }
  expect(mergeEventView(current, other)).toBe(other)
})

test('an older progress snapshot cannot undo payment state', () => {
  expect(mergeEventView(bookedEvent, planReadyEvent)).toBe(bookedEvent)
})

test('same-cursor reads cannot remove a committed cancellation or lower the plan revision', () => {
  const canceled = { ...bookedEvent, event: { ...bookedEvent.event, cancelRequestedAt: '2026-11-08T02:00:00.000Z', status: 'canceling' as const } }
  expect(mergeEventView(canceled, bookedEvent)).toBe(canceled)
  const newerPlan = { ...planReadyEvent, event: { ...planReadyEvent.event, planRevision: 2 } }
  expect(mergeEventView(newerPlan, planReadyEvent)).toBe(newerPlan)
})

test('same-cursor snapshots cannot roll back payment or refund settlement', () => {
  const paid = { ...bookedEvent, event: { ...bookedEvent.event, progressSequence: 3 } }
  expect(mergeEventView(paid, planReadyEvent)).toBe(paid)
  const refunded = { ...paid, payment: { ...paid.payment!, refundState: 'succeeded' as const } }
  expect(mergeEventView(refunded, paid)).toBe(refunded)
})

test('first full snapshot deduplicates and scopes progress, too', () => {
  const next = { ...planReadyEvent, progress: [...planReadyEvent.progress].reverse().concat([
    planReadyEvent.progress[0], { ...planReadyEvent.progress[0], eventId: 'other', sequence: 4 },
  ]) }
  expect(mergeEventView(null, next).progress.map(entry => entry.sequence)).toEqual([1, 2, 3])
})

test('a successful write with an unreadable body has an uncertain outcome', async () => {
  const api = createEventApi(async () => new Response('invalid', { status: 200 }))
  await expect(api.cancel('event')).rejects.toMatchObject({ code: 'outcome_unknown' })
})
