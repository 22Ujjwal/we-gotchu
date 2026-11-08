import { afterEach, expect, test, vi } from 'vitest'
import { createPlanningApi, PlanningApiError } from './planning-api'
import type { PlanningView } from '../../agent/planning/contract'

const saved: PlanningView = { id: 'plan-a', version: 1, status: 'working', messages: [], selections: [], proposal: null, progress: null, error: null }
afterEach(() => vi.unstubAllGlobals())

test('reads use the encoded conversation URL and same-origin credentials without writing', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(saved))
  vi.stubGlobal('fetch', fetcher)
  const controller = new AbortController()
  await expect(createPlanningApi().read('plan/a b', controller.signal)).resolves.toEqual(saved)
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/planning/plan%2Fa%20b', {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
  })
})

for (const response of [
  () => Promise.reject(new TypeError('connection lost')),
  () => Promise.resolve(new Response('bad json', { status: 201 })),
  () => Promise.resolve(Response.json({ id: 'partial' }, { status: 201 })),
  () => Promise.resolve(Response.json({ errorCode: 'provider_error', message: 'private-session-123' }, { status: 503 })),
]) {
  test('unconfirmed writes are uncertain and never automatically resent', async () => {
    const fetcher = vi.fn(response)
    vi.stubGlobal('fetch', fetcher)
    const operation = createPlanningApi().create({ requestId: 'intent-a', message: 'Dinner' }, new AbortController().signal)
    await expect(operation).rejects.toMatchObject({ uncertain: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
}

test('conflict errors are known failures without displaying private diagnostics', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ errorCode: 'stale_version', message: 'private-session-123' }, { status: 409 })))
  const operation = createPlanningApi().command('plan-a', { kind: 'select', requestId: 'intent-a', expectedVersion: 1, optionId: 'venue-a' }, new AbortController().signal)
  await expect(operation).rejects.toMatchObject({ status: 409, uncertain: false })
  await expect(operation).rejects.toThrow('Review the latest')
  await expect(operation).rejects.not.toThrow('private-session-123')
})

test('malformed option URLs never reach rendered source links', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...saved, selections: [{ id: 'bad', kind: 'venue', name: 'Bad source', url: 'javascript:alert(1)', why: 'Test', facts: [], unknowns: [] }] })))
  await expect(createPlanningApi().read('plan-a', new AbortController().signal)).rejects.toBeInstanceOf(PlanningApiError)
})
