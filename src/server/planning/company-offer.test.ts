import { expect, test, vi } from 'vitest'
import type { PlanningRecord, PlanningRepository } from './repository'
import { createCompanyTools, inquiryToolAccess } from './company-tools'
import { venue, record, extracted } from '../../agent/planning/offer.test-fixtures'

test('the supplier agent submits a supported offer once through its scoped tool', async () => {
  let current = structuredClone(record)
  current.view.arrangement = { id: 'arrangement', inquiryId: 'inquiry', status: 'awaiting_reply', controlled: true } as NonNullable<PlanningRecord['view']['arrangement']>
  const quote = 'USD 200 for the room, including USD 50 deposit. Taxes, delivery and all other fees are included. Fully refundable before the event.'
  current.view.inquiry!.replies![0].message.text = quote
  const initial = { ...extracted, lines: [{ ...extracted.lines[0], sourceQuotes: [quote] }] }
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
  expect((await call(initial)).result.isError).toBeUndefined()
  expect(save).toHaveBeenCalledTimes(1)
  expect(current.view.offer).toMatchObject({ inquiryId: 'inquiry', replyId: 'reply', mode: 'simulated', revision: 1, contextMessageIds: ['brief'],
    lines: [{ option: venue, sourceReplyId: 'reply', unitAmount: 20000, tax: null, deposit: { amount: 5000, treatment: 'included' } }] })
  expect(current.view.offer?.missing).toContain('Tax amount')
  expect((await call(initial)).result.isError).toBeUndefined()
  expect(save).toHaveBeenCalledTimes(1)
  expect(published).toHaveBeenCalled()
  const corrected = { ...initial, missing: [], lines: [{ ...initial.lines[0], tax: 0, delivery: 0, fees: 0,
    cancellationTerms: 'Fully refundable before the event.' }] }
  expect((await call(corrected)).result.isError).toBeUndefined()
  expect(save).toHaveBeenCalledTimes(2)
  expect(current.view.offer?.revision).toBe(2)
  expect((await call(corrected)).result.isError).toBeUndefined()
  expect(save).toHaveBeenCalledTimes(2)
  expect((await call({ ...corrected, lines: [{ ...corrected.lines[0], unitAmount: 25000 }] })).result.isError).toBe(true)
  expect(save).toHaveBeenCalledTimes(2)
})
