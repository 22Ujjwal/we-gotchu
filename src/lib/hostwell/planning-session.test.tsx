import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { PlanningView } from '../../agent/planning/contract'
import { usePlanningSession } from './planning-session'

const base: PlanningView = { id: 'plan-a', version: 1, status: 'ready', messages: [], proposal: null, selections: [], progress: null, error: null }
const awaiting: PlanningView = { ...base, arrangement: { id: 'arrange-a', inquiryId: 'inquiry-a', requestedAt: '2026-11-07T12:00:00Z', status: 'awaiting_reply', selections: [], detail: 'Waiting for supplier.' } }
const venue = { id: 'venue-a', kind: 'venue' as const, name: 'Room', url: 'https://example.com', why: 'Space', facts: [], unknowns: [] }
function withReply(status: 'received' | 'processing' | 'ready'): PlanningView {
  return { ...base, inquiry: { id: 'inquiry-a', revision: 1, status: 'draft', recipient: 'supplier@example.com', subject: 'Room', text: 'Available?', venue, contactSourceUrl: null, contextMessageIds: [], updatedAt: '2026-11-07T12:00:00Z', replies: [{ id: 'reply-a', status, message: { provider: 'agentmail', messageId: 'mail-a', threadId: null, inReplyTo: null, from: 'supplier@example.com', to: ['host@example.com'], subject: 'Room', text: 'Available', receivedAt: '2026-11-07T12:00:00Z', originalRef: 'mail-a', mode: 'simulated' } }] } }
}
beforeEach(() => vi.useFakeTimers())

// These tests exercise the hook and real API parsing; only the HTTP boundary is replaced.
test.each([awaiting, withReply('received'), withReply('processing')])('ready plans observe saved asynchronous progress', async initial => {
  let saved = initial
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    expect(String(url)).toBe('/api/planning/plan-a?saved=1')
    expect(init?.method).toBe('GET')
    return Response.json(saved)
  })
  const { result } = renderHook(() => usePlanningSession('plan-a'))
  await act(async () => {})
  saved = { ...withReply('ready'), version: 2 }
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(result.current.view?.inquiry?.replies?.[0].status).toBe('ready')
  const calls = vi.mocked(fetch).mock.calls.length
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(fetch).toHaveBeenCalledTimes(calls)
})

test('visible plans continue slower saved polling and receive replies after five minutes', async () => {
  let saved = awaiting
  vi.mocked(fetch).mockImplementation(async () => Response.json(saved))
  const { result } = renderHook(() => usePlanningSession('plan-a'))
  await act(async () => {})
  await act(async () => { await vi.advanceTimersByTimeAsync(600000) })
  const calls = vi.mocked(fetch).mock.calls.length
  expect(calls).toBeGreaterThan(1)
  expect(calls).toBeLessThan(100)
  saved = { ...base, version: 2 }
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(fetch).toHaveBeenCalledTimes(calls)
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(result.current.view?.version).toBe(2)
  expect(fetch).toHaveBeenCalledTimes(calls + 1)
})

test('saved polling stops after access is revoked and ignores focus', async () => {
  let denied = false
  vi.mocked(fetch).mockImplementation(async () => denied ? new Response(null, { status: 403 }) : Response.json(awaiting))
  const { result } = renderHook(() => usePlanningSession('plan-a'))
  await act(async () => {})
  denied = true
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(result.current.view).toBeNull()
  const calls = vi.mocked(fetch).mock.calls.length
  await act(async () => { window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(30000) })
  expect(fetch).toHaveBeenCalledTimes(calls)
})

test('unmount aborts a saved read and prevents further polling', async () => {
  let signal: AbortSignal | null | undefined
  vi.mocked(fetch).mockImplementation(async (_url, init) => { signal = init?.signal; return Response.json(awaiting) })
  const { unmount } = renderHook(() => usePlanningSession('plan-a'))
  await act(async () => {})
  unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); window.dispatchEvent(new Event('focus')) })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('an accepted arrange command starts saved polling without replaying the command', async () => {
  let saved = base
  const methods: string[] = []
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    methods.push(init!.method!)
    if (init?.method === 'POST') { saved = { ...awaiting, version: 2 }; return Response.json(saved) }
    expect(String(url)).toContain('?saved=1')
    return Response.json(saved)
  })
  const { result } = renderHook(() => usePlanningSession('plan-a'))
  await act(async () => {})
  await act(async () => { await result.current.submit({ kind: 'arrange', requestId: 'arrange-request', expectedVersion: 1, customerEmail: 'customer@example.com' }) })
  saved = { ...base, version: 3 }
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(result.current.view?.version).toBe(3)
  expect(methods).toEqual(['GET', 'POST', 'GET'])
})

test('older saved snapshots cannot replace newer results or restart finished work', async () => {
  let saved = { ...awaiting, version: 3 }
  vi.mocked(fetch).mockImplementation(async () => Response.json(saved))
  const { result } = renderHook(() => usePlanningSession('plan-a'))
  await act(async () => {})
  saved = { ...awaiting, version: 2, status: 'working' }
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(result.current.view?.version).toBe(3)
  saved = { ...awaiting, version: 4 }
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(result.current.view?.version).toBe(4)
  expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).endsWith('?saved=1'))).toBe(true)
})

test('hidden tabs pause saved polling and resume when visible', async () => {
  let visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState)
  let saved = awaiting
  vi.mocked(fetch).mockImplementation(async () => Response.json(saved))
  const { result } = renderHook(() => usePlanningSession('plan-a'))
  await act(async () => {})
  visibility = 'hidden'
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(30000) })
  expect(fetch).toHaveBeenCalledTimes(1)
  saved = { ...base, version: 2 }
  visibility = 'visible'
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(result.current.view?.version).toBe(2)
})

test('saved polling retries remain read-only and bounded during outages', async () => {
  let offline = false
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    expect(String(url)).toBe('/api/planning/plan-a?saved=1')
    expect(init?.method).toBe('GET')
    if (offline) throw new TypeError('offline')
    return Response.json(awaiting)
  })
  const { result } = renderHook(() => usePlanningSession('plan-a'))
  await act(async () => {})
  offline = true
  await act(async () => { await vi.advanceTimersByTimeAsync(1200000) })
  expect(result.current.error?.status).toBe(0)
  const calls = vi.mocked(fetch).mock.calls.length
  expect(calls).toBeLessThan(100)
  await act(async () => { await vi.advanceTimersByTimeAsync(1200000) })
  expect(fetch).toHaveBeenCalledTimes(calls)
})

test('focus and visibility resume an exhausted outage without overlapping reads', async () => {
  let offline = false
  let finish: ((response: Response) => void) | undefined
  vi.mocked(fetch).mockImplementation(async () => {
    if (offline) throw new TypeError('offline')
    if (finish === undefined) return Response.json(awaiting)
    return new Promise<Response>(resolve => { finish = resolve })
  })
  const { result } = renderHook(() => usePlanningSession('plan-a'))
  await act(async () => {})
  offline = true
  await act(async () => { await vi.advanceTimersByTimeAsync(1200000) })
  const calls = vi.mocked(fetch).mock.calls.length
  offline = false
  finish = () => {}
  await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); void result.current.refreshSaved() })
  expect(fetch).toHaveBeenCalledTimes(calls + 1)
  await act(async () => { finish!(Response.json({ ...awaiting, version: 2 })) })
  expect(result.current.view?.version).toBe(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(fetch).toHaveBeenCalledTimes(calls + 2)
})
