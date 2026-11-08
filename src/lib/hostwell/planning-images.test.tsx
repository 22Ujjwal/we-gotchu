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
  expect(result.current).toEqual({})
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/planning/plan%2Fa/options/room%2Fa/images', expect.objectContaining({
    method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: expect.any(AbortSignal),
  }))
  await act(async () => pending.resolve(response('plan/a', { images: [1, 2, 3, 4, 5].map(photo) })))
  expect(result.current[venue.id]).toEqual([1, 2, 3, 4].map(photo))
  expect(options).toEqual(original)
})

test('rejects late conversation responses and clears prior pictures immediately', async () => {
  const late = deferred()
  const next = deferred()
  vi.mocked(fetch).mockReturnValueOnce(late.promise).mockResolvedValueOnce(response('plan-b')).mockReturnValueOnce(next.promise)
  const { result, rerender } = renderHook(({ id }) => usePlanningImages(id, [venue], 4), { initialProps: { id: 'plan/a' } })
  const firstSignal = vi.mocked(fetch).mock.calls[0][1]!.signal!
  rerender({ id: 'plan-b' })
  expect(result.current).toEqual({})
  expect(firstSignal.aborted).toBe(true)
  await waitFor(() => expect(result.current[venue.id]).toEqual([photo(1)]))
  await act(async () => late.resolve(response('plan/a', { images: [photo(2)] })))
  expect(result.current[venue.id]).toEqual([photo(1)])
  rerender({ id: 'plan-c' })
  expect(result.current).toEqual({})
})

test('one slow venue does not delay images for another venue', async () => {
  const slow = deferred()
  vi.mocked(fetch).mockReturnValueOnce(slow.promise).mockResolvedValueOnce(response('plan/a', { optionId: 'second-room' }))
  const { result } = renderHook(() => usePlanningImages('plan/a', [venue, { ...venue, id: 'second-room' }], 4))
  await waitFor(() => expect(result.current['second-room']).toEqual([photo(1)]))
  expect(result.current[venue.id]).toBeUndefined()
  await act(async () => slow.resolve(response()))
  expect(result.current[venue.id]).toEqual([photo(1)])
})

test('ordinary polling versions do not restart images, but changed venue sources do', async () => {
  const old = deferred()
  vi.mocked(fetch).mockReturnValueOnce(old.promise).mockResolvedValueOnce(response('plan/a', { version: 6, images: [photo(2)] }))
  const { result, rerender } = renderHook(({ option, version }) => usePlanningImages('plan/a', [option], version),
    { initialProps: { option: venue, version: 4 } })
  rerender({ option: { ...venue }, version: 5 })
  expect(fetch).toHaveBeenCalledTimes(1)
  rerender({ option: { ...venue, url: 'https://venue.example/new-room' }, version: 6 })
  expect(result.current).toEqual({})
  await waitFor(() => expect(result.current[venue.id]).toEqual([photo(2)]))
  await act(async () => old.resolve(response()))
  expect(result.current[venue.id]).toEqual([photo(2)])
})

test.each([
  () => Promise.reject(new Error('offline')),
  () => Promise.resolve(new Response('', { status: 404 })),
  () => Promise.resolve(response('plan/a', { status: 'none', images: [] })),
  () => Promise.resolve(response('plan/a', { status: 'unavailable', images: [] })),
  () => Promise.resolve(response('other-conversation')),
  () => Promise.resolve(response('plan/a', { optionId: 'other-option' })),
  () => Promise.resolve(response('plan/a', { version: 3 })),
  () => Promise.resolve(response('plan/a', { images: [{ ...photo(1), url: 'javascript:alert(1)' }] })),
])('image failures and invalid results leave the proposal untouched', async reply => {
  vi.mocked(fetch).mockImplementation(reply)
  const options = [structuredClone(venue)]
  const { result } = renderHook(() => usePlanningImages('plan/a', options, 4))
  await act(async () => {})
  expect(result.current[venue.id] ?? []).toEqual([])
  expect(options).toEqual([venue])
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('does not read without a conversation or for supplies alone', () => {
  const { rerender } = renderHook(({ id, options }: { id?: string; options: PlanningOption[] }) => usePlanningImages(id, options, 4),
    { initialProps: { id: undefined as string | undefined, options: [venue] } })
  rerender({ id: 'plan/a', options: [{ ...venue, kind: 'supply' }] })
  expect(fetch).not.toHaveBeenCalled()
})
