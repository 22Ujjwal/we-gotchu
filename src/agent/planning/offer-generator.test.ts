import { expect, test } from 'vitest'
import { validateSupplierOffer } from './offer-generator'
import type { PlanningRecord } from '../../server/planning/repository'

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

test('preserves selected snapshots and assigns source identity while keeping missing costs unknown', async () => {
  const result = await Promise.resolve().then(() => validateSupplierOffer(record, extracted))
  expect(result).toMatchObject({ inquiryId: 'inquiry', replyId: 'reply', mode: 'simulated', revision: 1, contextMessageIds: ['brief'],
    lines: [{ option: venue, sourceReplyId: 'reply', unitAmount: 20000, tax: null, deposit: { amount: 5000, treatment: 'included' } }] })
  expect(result.missing).toContain('Tax amount')
})

test('rejects invented options and quotations rather than saving unsupported payment data', async () => {
  await expect(Promise.resolve().then(() => validateSupplierOffer(record, { ...extracted, lines: [{ ...extracted.lines[0], optionId: 'invented' }] }))).rejects.toThrow()
  await expect(Promise.resolve().then(() => validateSupplierOffer(record, { ...extracted, lines: [{ ...extracted.lines[0], sourceQuotes: ['Everything is included.'] }] }))).rejects.toThrow()
})

test.each([
  { sourceQuotes: ['U'] },
  { unitAmount: 25000 },
  { deposit: { amount: 7500, treatment: 'included' } },
  { tax: 1500 },
])('rejects monetary claims absent from the quoted evidence: %j', async change => {
  await expect(Promise.resolve().then(() => validateSupplierOffer(record, { ...extracted,
    lines: [{ ...extracted.lines[0], ...change }],
  }))).rejects.toThrow()
})

test.each([
  ['Room for 200 guests. Price is USD 250.', 20000, false],
  ['The room costs USD 200.50.', 20000, false],
  ['The room costs USD 1,200.', 20000, false],
  ['The room costs USD 200.', 20000, true],
  ['The room costs USD200.', 20000, true],
  ['The room costs 200USD.', 20000, true],
  ['The room costs $200.50.', 20050, true],
  ['The room costs 1,200 USD.', 120000, true],
])('checks the complete monetary token in %s', async (text, unitAmount, supported) => {
  const current = structuredClone(record)
  current.view.inquiry!.replies![0].message.text = text
  const result = Promise.resolve().then(() => validateSupplierOffer(current, { ...extracted, lines: [{ ...extracted.lines[0],
    unitAmount, deposit: { amount: null, treatment: 'unknown' }, sourceQuotes: [text],
  }] }))
  if (supported) await expect(result).resolves.toMatchObject({ lines: [{ unitAmount }] })
  else await expect(result).rejects.toThrow('Offer amount is not in the quoted evidence.')
})

test('rejects a fabricated customer budget or cancellation allowance', async () => {
  for (const change of [{ budget: 100000 }, { maximumCancellationLoss: 10000 }]) {
    await expect(Promise.resolve().then(() => validateSupplierOffer(record, { ...extracted, brief: { ...extracted.brief, ...change } })))
      .rejects.toThrow('Customer spending limit is not in the saved request.')
  }
})

test('retains supplier evidence when the quoted package includes selected supplies', async () => {
  const current = structuredClone(record)
  const supply = { ...venue, id: 'plates', kind: 'supply' as const, name: '24 plates', facts: [], unknowns: ['Retail delivery unknown'] }
  current.view.selections.push(supply)
  const quote = 'USD 200 for the room, including USD 50 deposit. One pack of 24 plates costs USD 3.47, including delivery. Both are fully refundable.'
  current.view.inquiry!.replies![0].message.text = quote
  const value = { ...extracted, lines: [
    { ...extracted.lines[0], sourceQuotes: [quote] },
    { ...extracted.lines[0], optionId: 'plates', unitAmount: 347, deposit: { amount: 0, treatment: 'included' }, sourceQuotes: [quote] },
  ] }
  const result = await Promise.resolve().then(() => validateSupplierOffer(current, value))
  expect(result.lines[1]).toMatchObject({ option: supply, sourceReplyId: 'reply', unitAmount: 347, sourceQuotes: [quote] })
})
