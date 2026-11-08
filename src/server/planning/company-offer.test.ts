import { expect, test, vi } from 'vitest'
import type { PlanningRecord, PlanningRepository } from './repository'
import { createCompanyTools, inquiryToolAccess } from './company-tools'

const venue = { id: 'venue', kind: 'venue' as const, name: 'Room', url: 'https://example.com/room', why: 'Selected', facts: [], unknowns: [] }
const record: PlanningRecord = { id: 'conversation', customerId: 'customer', createRequestId: 'create', initialMessage: 'Party',
  revision: 0, sessionId: null, sequence: 0, pending: null, requests: {}, view: {
    id: 'conversation', version: 0, status: 'ready', selections: [venue], proposal: null, progress: null, error: null,
    messages: [{ id: 'brief', role: 'user', text: 'Birthday for 12 in SF, December 12 2026 noon Pacific. USD 300 budget.', createdAt: '2026-11-08T12:00:00Z' }],
    inquiry: { id: 'inquiry', revision: 1, status: 'draft', recipient: 'venue@example.com', subject: 'Party', text: 'Party for 12', venue,
      contextMessageIds: ['brief'], contactSourceUrl: null, updatedAt: '2026-11-08T12:00:00Z', replies: [{ id: 'reply', status: 'ready',
        message: { provider: 'controlled', messageId: 'source', threadId: 'thread', inReplyTo: 'sent', from: 'venue@example.com', to: ['planner@example.com'],
          subject: 'Quote', text: 'USD 200 for the room, including USD 50 deposit. Tax is extra.', receivedAt: '2026-11-08T12:00:00Z', originalRef: 'source', mode: 'simulated' },
        interpretation: { kind: 'quote', summary: 'Room quote.', nextAction: 'Ask for tax.', facts: [], missing: ['Tax'] } }] },
  } }
const extracted = {
  currency: 'usd', expiresAt: null, missing: ['Tax amount', 'Cancellation terms', 'Availability'],
  brief: { eventType: 'Birthday', location: 'SF', startsAt: '2026-12-12T20:00:00Z', timezone: 'America/Los_Angeles',
    headcount: 12, budget: 30000, currency: 'usd', supplyNeeds: [], maximumCancellationLoss: 0 },
  lines: [{ optionId: 'venue', unitAmount: 20000, units: 1, quantityDescription: 'Room for 12', tax: null, delivery: 0, fees: null,
    deposit: { amount: 5000, treatment: 'included' }, cancellationTerms: null,
    sourceQuotes: ['USD 200 for the room, including USD 50 deposit. Tax is extra.'] }],
}

test('the supplier agent submits a supported offer once through its scoped tool', async () => {
  let current = structuredClone(record)
  current.view.arrangement = { id: 'arrangement', inquiryId: 'inquiry', status: 'awaiting_reply', controlled: true } as NonNullable<PlanningRecord['view']['arrangement']>
  const repository: PlanningRepository = { getById: async () => current, get: async () => current,
    pendingReplyJobs: async () => [], insert: async value => value,
    compareAndSet: async (_before, after) => (current = after) }
  const save = vi.fn(async (_customer, _id, _version, offer, request) => {
    current = { ...current, requests: { ...current.requests, [request.id]: request.fingerprint },
      view: { ...current.view, offer, version: current.view.version + 1 } }
    return current
  })
  const published = vi.fn(async () => {})
  const secret = 's'.repeat(32)
  const handler = createCompanyTools(repository, secret, undefined, undefined, { save, onSaved: published })
  const access = inquiryToolAccess({ conversationId: current.id, inquiryId: 'inquiry', revision: 1,
    replyId: 'reply', expiresAt: Date.now() + 60_000 }, secret)
  const call = (offer: unknown) => handler(new Request('http://localhost/tools', { method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'submit_supplier_offer', arguments: { access, offer } } }) })).then(response => response.json())
  expect((await call(extracted)).result.isError).toBeUndefined()
  expect(save).toHaveBeenCalledTimes(1)
  expect(current.view.offer?.lines[0].unitAmount).toBe(20000)
  expect((await call(extracted)).result.isError).toBeUndefined()
  expect(save).toHaveBeenCalledTimes(1)
  expect(published).toHaveBeenCalled()
  expect((await call({ ...extracted, lines: [{ ...extracted.lines[0], unitAmount: 25000 }] })).result.isError).toBe(true)
  expect(save).toHaveBeenCalledTimes(1)
})
