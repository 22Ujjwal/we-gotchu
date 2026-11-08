import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { PlanningOption } from '../../agent/planning/contract'
import { usePlanningImages } from './planning-images'

const venue: PlanningOption = { id: 'room/a', kind: 'venue', name: 'Harbor Loft', url: 'https://venue.example/room', why: 'Fits', facts: [], unknowns: [] }
const photo = (n: number) => ({ url: `https://venue.example/${n}.jpg`, sourcePage: venue.url, provider: 'source-page',
  attribution: { text: venue.name, url: venue.url }, evidence: 'page-metadata', description: null })
const response = (conversationId = 'plan/a', extra = {}) => Response.json({ conversationId, optionId: venue.id, version: 4,
  status: 'available', images: [photo(1)], ...extra })
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>(accept => { resolve = accept })
  return { promise, resolve }
}

test('loads only venue images independently, retaining attribution and limiting to four', async () => {
  const pending = deferred()
  vi.mocked(fetch).mockReturnValue(pending.promise)
  const options: PlanningOption[] = [venue, { ...venue, id: 'cups', kind: 'supply' }]
  const original = structuredClone(options)
  const { result } = renderHook(() => usePlanningImages('plan/a', options, 4))
  expect(result.current.images).toEqual({})
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/planning/plan%2Fa/options/room%2Fa/images', expect.objectContaining({
    method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: expect.any(AbortSignal),
  }))
  await act(async () => pending.resolve(response('plan/a', { images: [1, 2, 3, 4, 5].map(photo) })))
  expect(result.current.images[venue.id]).toEqual([1, 2, 3, 4].map(photo))
  expect(options).toEqual(original)
})

test('rejects late conversation responses and clears prior pictures immediately', async () => {
  const late = deferred()
  const next = deferred()
  vi.mocked(fetch).mockReturnValueOnce(late.promise).mockResolvedValueOnce(response('plan-b')).mockReturnValueOnce(next.promise)
  const { result, rerender } = renderHook(({ id }) => usePlanningImages(id, [venue], 4), { initialProps: { id: 'plan/a' } })
  const firstSignal = vi.mocked(fetch).mock.calls[0][1]!.signal!
  rerender({ id: 'plan-b' })
  expect(result.current.images).toEqual({})
  expect(firstSignal.aborted).toBe(true)
  await waitFor(() => expect(result.current.images[venue.id]).toEqual([photo(1)]))
  await act(async () => late.resolve(response('plan/a', { images: [photo(2)] })))
  expect(result.current.images[venue.id]).toEqual([photo(1)])
  rerender({ id: 'plan-c' })
  expect(result.current.images).toEqual({})
})

test('one slow venue does not delay images for another venue', async () => {
  const slow = deferred()
  vi.mocked(fetch).mockReturnValueOnce(slow.promise).mockResolvedValueOnce(response('plan/a', { optionId: 'second-room' }))
  const { result } = renderHook(() => usePlanningImages('plan/a', [venue, { ...venue, id: 'second-room' }], 4))
  await waitFor(() => expect(result.current.images['second-room']).toEqual([photo(1)]))
  expect(result.current.images[venue.id]).toBeUndefined()
  await act(async () => slow.resolve(response()))
  expect(result.current.images[venue.id]).toEqual([photo(1)])
})

test('ordinary polling versions do not restart images, but changed venue sources do', async () => {
  const old = deferred()
  vi.mocked(fetch).mockReturnValueOnce(old.promise).mockResolvedValueOnce(response('plan/a', { version: 6, images: [photo(2)] }))
  const { result, rerender } = renderHook(({ option, version }) => usePlanningImages('plan/a', [option], version),
    { initialProps: { option: venue, version: 4 } })
  rerender({ option: { ...venue }, version: 5 })
  expect(fetch).toHaveBeenCalledTimes(1)
  rerender({ option: { ...venue, url: 'https://venue.example/new-room' }, version: 6 })
  expect(result.current.images).toEqual({})
  await waitFor(() => expect(result.current.images[venue.id]).toEqual([photo(2)]))
  await act(async () => old.resolve(response()))
  expect(result.current.images[venue.id]).toEqual([photo(2)])
})

test.each([
  () => Promise.resolve(new Response('', { status: 404 })),
  () => Promise.resolve(new Response('invalid JSON', { status: 200 })),
  () => Promise.resolve(response('plan/a', { status: 'none', images: [] })),
  () => Promise.resolve(response('other-conversation')),
  () => Promise.resolve(response('plan/a', { optionId: 'other-option' })),
  () => Promise.resolve(response('plan/a', { version: 3 })),
  () => Promise.resolve(response('plan/a', { images: [{ ...photo(1), url: 'javascript:alert(1)' }] })),
])('permanent image failures and invalid results leave the proposal untouched without retries', async reply => {
  vi.useFakeTimers()
  vi.mocked(fetch).mockImplementation(reply)
  const options = [structuredClone(venue)]
  const { result } = renderHook(() => usePlanningImages('plan/a', options, 4))
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(result.current.images[venue.id] ?? []).toEqual([])
  expect(options).toEqual([venue])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(result.current.canRetry).toBe(false)
})

test('does not read without a conversation or for supplies alone', () => {
  const { rerender } = renderHook(({ id, options }: { id?: string; options: PlanningOption[] }) => usePlanningImages(id, options, 4),
    { initialProps: { id: undefined as string | undefined, options: [venue] } })
  rerender({ id: 'plan/a', options: [{ ...venue, kind: 'supply' }] })
  expect(fetch).not.toHaveBeenCalled()
})

test.each(['network', 'server', 'unavailable'])('retries transient %s failures twice then permits an explicit retry', async kind => {
  vi.useFakeTimers()
  vi.mocked(fetch).mockImplementation(() => kind === 'network' ? Promise.reject(new Error('offline'))
    : Promise.resolve(kind === 'server' ? new Response('', { status: 503 }) : response('plan/a', { status: 'unavailable', images: [] })))
  const { result, rerender } = renderHook(({ version }) => usePlanningImages('plan/a', [venue], version), { initialProps: { version: 4 } })
  await act(async () => {})
  expect(result.current.canRetry).toBe(false)
  rerender({ version: 5 })
  await act(async () => { await vi.advanceTimersByTimeAsync(999) })
  expect(fetch).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(2001) })
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(result.current.canRetry).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(fetch).toHaveBeenCalledTimes(3)
  vi.mocked(fetch).mockResolvedValue(response('plan/a', { version: 5 }))
  await act(async () => { result.current.retry(); result.current.retry() })
  expect(fetch).toHaveBeenCalledTimes(4)
  expect(result.current.images[venue.id]).toEqual([photo(1)])
  expect(result.current.canRetry).toBe(false)
})

test('manual retries preserve successful venues and only request exhausted failures', async () => {
  vi.useFakeTimers()
  let recover = false
  vi.mocked(fetch).mockImplementation(async path => String(path).includes('second-room')
    ? recover ? response('plan/a', { optionId: 'second-room', images: [photo(2)] }) : new Response('', { status: 500 })
    : response())
  const { result } = renderHook(() => usePlanningImages('plan/a', [venue, { ...venue, id: 'second-room' }], 4))
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  expect(result.current.images[venue.id]).toEqual([photo(1)])
  expect(result.current.canRetry).toBe(true)
  recover = true
  await act(async () => result.current.retry())
  expect(result.current.images[venue.id]).toEqual([photo(1)])
  expect(result.current.images['second-room']).toEqual([photo(2)])
  expect(vi.mocked(fetch).mock.calls.filter(([path]) => String(path).includes('room%2Fa'))).toHaveLength(1)
})

test.each([401, 403, 404, 422])('does not retry permanent HTTP %s failures', async status => {
  vi.useFakeTimers()
  vi.mocked(fetch).mockResolvedValue(new Response('', { status }))
  const { result } = renderHook(() => usePlanningImages('plan/a', [venue], 4))
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(result.current.canRetry).toBe(false)
})

test('conversation changes and unmount cancel scheduled retries', async () => {
  vi.useFakeTimers()
  vi.mocked(fetch).mockImplementation(async () => new Response('', { status: 503 }))
  const { rerender, unmount } = renderHook(({ id }) => usePlanningImages(id, [venue], 4), { initialProps: { id: 'old' } })
  await act(async () => {})
  rerender({ id: 'new' })
  await act(async () => {})
  unmount()
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => init!.signal!.aborted)).toBe(true)
})

test('enables local fallback after the first failed fetch without waiting for retries', async () => {
  const pending = deferred()
  vi.mocked(fetch).mockReturnValue(pending.promise)
  const { result, rerender } = renderHook(({ id }) => usePlanningImages(id, [venue], 4), { initialProps: { id: 'plan/a' } })
  expect(result.current.attempted).toEqual([])
  await act(async () => pending.resolve(new Response('', { status: 503 })))
  expect(result.current.attempted).toEqual([venue.id])
  expect(result.current.images).toEqual({})
  vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
  rerender({ id: 'other-plan' })
  expect(result.current.attempted).toEqual([])
})

test('waits for the successful response body before enabling inspiration', async () => {
  let finish!: (value: unknown) => void
  const reply = response()
  const json = vi.spyOn(reply, 'json').mockReturnValue(new Promise(resolve => { finish = resolve }))
  vi.mocked(fetch).mockResolvedValue(reply)
  const { result } = renderHook(() => usePlanningImages('plan/a', [venue], 4))
  await waitFor(() => expect(json).toHaveBeenCalledOnce())
  expect(result.current.attempted).toEqual([])
  await act(async () => finish(await response().json()))
  expect(result.current.images[venue.id]).toEqual([photo(1)])
  expect(result.current.attempted).toEqual([venue.id])
})
