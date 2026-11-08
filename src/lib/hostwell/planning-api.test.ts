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

test('preserves saved offer and linked payment across command response and reload', async () => {
  const offer = { id: 'offer', revision: 1, inquiryId: 'inquiry', replyId: 'reply', contextMessageIds: [],
    currency: 'usd', expiresAt: null, mode: 'simulated', missing: [],
    brief: { eventType: 'Party', location: 'SF', startsAt: '2026-12-12T20:00:00Z', timezone: 'America/Los_Angeles',
      headcount: 12, budget: 30000, currency: 'usd', supplyNeeds: [], maximumCancellationLoss: 0 },
    lines: [{ option: { id: 'room', kind: 'venue', name: 'Controlled room', url: 'https://example.com/room', why: 'Room', facts: [], unknowns: [] },
      sourceReplyId: 'reply', unitAmount: 20000, units: 1, quantityDescription: 'Room for 12', tax: 0, delivery: 0, fees: 0,
      deposit: { amount: 5000, treatment: 'included' }, cancellationTerms: 'Refundable.', sourceQuotes: ['USD 200 includes the USD 50 deposit.'] }],
  }
  const paymentLink = { eventId: 'event', planId: 'transaction', planRevision: 1, offerId: 'offer', offerRevision: 1 }
  const response = { ...saved, status: 'ready', offer, paymentLink }
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(response)))
  const api = createPlanningApi()
  const signal = new AbortController().signal
  expect(await api.command('plan-a', { kind: 'prepare_payment', requestId: 'payment', expectedVersion: 1, offerId: 'offer', offerRevision: 1 }, signal)).toEqual(response)
  expect(await api.read('plan-a', signal, true)).toEqual(response)
})

test.each([{ offer: { id: 'incomplete' } }, { paymentLink: { eventId: 'event', planId: 'plan', planRevision: -1, offerId: 'offer', offerRevision: 1 } }])(
  'rejects malformed offer/payment data instead of silently dropping it', async extra => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...saved, ...extra })))
    await expect(createPlanningApi().read('plan-a', new AbortController().signal)).rejects.toBeInstanceOf(PlanningApiError)
  })
