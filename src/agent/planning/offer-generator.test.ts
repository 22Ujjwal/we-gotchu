import { expect, test } from 'vitest'
import { validateSupplierOffer } from './offer-generator'
import { venue, record, extracted } from './offer.test-fixtures'

test('rejects invented options and quotations rather than saving unsupported payment data', () => {
  expect(() => validateSupplierOffer(record, { ...extracted, lines: [{ ...extracted.lines[0], optionId: 'invented' }] })).toThrow()
  expect(() => validateSupplierOffer(record, { ...extracted, lines: [{ ...extracted.lines[0], sourceQuotes: ['Everything is included.'] }] })).toThrow()
})

test.each([
  { unitAmount: -1 },
  { unitAmount: 1.5 },
  { units: 0 },
  { deposit: { amount: -1, treatment: 'included' } },
])('rejects invalid monetary data: %j', change => {
  expect(() => validateSupplierOffer(record, { ...extracted,
    lines: [{ ...extracted.lines[0], ...change }],
  })).toThrow()
})

test('rejects a fabricated customer budget or cancellation allowance', () => {
  for (const change of [{ budget: 100000 }, { maximumCancellationLoss: 10000 }]) {
    expect(() => validateSupplierOffer(record, { ...extracted, brief: { ...extracted.brief, ...change } }))
      .toThrow('Customer spending limit is not in the saved request.')
  }
})

test('retains supplier evidence when the quoted package includes selected supplies', () => {
  const current = structuredClone(record)
  const supply = { ...venue, id: 'plates', kind: 'supply' as const, name: '24 plates', facts: [], unknowns: ['Retail delivery unknown'] }
  current.view.selections.push(supply)
  const quote = 'USD 200 for the room, including USD 50 deposit. One pack of 24 plates costs USD 3.47, including delivery. Both are fully refundable. Taxes and all other fees are included. No deposit is required for the plates.'
  current.view.inquiry!.replies![0].message.text = quote
  const value = { ...extracted, lines: [
    { ...extracted.lines[0], sourceQuotes: [quote] },
    { ...extracted.lines[0], optionId: 'plates', unitAmount: 347, tax: 0, fees: 0, delivery: 0, deposit: { amount: 0, treatment: 'included' }, sourceQuotes: [quote.replace('including delivery.', 'including\ndelivery.')] },
  ] }
  const result = validateSupplierOffer(current, value)
  expect(result.lines[1]).toMatchObject({ option: supply, sourceReplyId: 'reply', unitAmount: 347, tax: 0, fees: 0, delivery: 0, deposit: { amount: 0, treatment: 'included' }, sourceQuotes: [quote.replace('including delivery.', 'including\ndelivery.')] })
})
