import { expect, test } from 'vitest'
import { validateSupplierOffer } from './offer-generator'
import { venue, record, extracted } from './offer.test-fixtures'

test('rejects invented options and quotations rather than saving unsupported payment data', () => {
  expect(() => validateSupplierOffer(record, { ...extracted, lines: [{ ...extracted.lines[0], optionId: 'invented' }] })).toThrow()
  expect(() => validateSupplierOffer(record, { ...extracted, lines: [{ ...extracted.lines[0], sourceQuotes: ['Everything is included.'] }] })).toThrow()
})

test.each([
  { sourceQuotes: ['U'] },
  { unitAmount: 25000 },
  { deposit: { amount: 7500, treatment: 'included' } },
  { tax: 1500 },
])('rejects monetary claims absent from the quoted evidence: %j', change => {
  expect(() => validateSupplierOffer(record, { ...extracted,
    lines: [{ ...extracted.lines[0], ...change }],
  })).toThrow()
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
])('checks the complete monetary token in %s', (text, unitAmount, supported) => {
  const current = structuredClone(record)
  current.view.inquiry!.replies![0].message.text = text
  const result = () => validateSupplierOffer(current, { ...extracted, lines: [{ ...extracted.lines[0],
    unitAmount, deposit: { amount: null, treatment: 'unknown' }, sourceQuotes: [text],
  }] })
  if (supported) expect(result()).toMatchObject({ lines: [{ unitAmount }] })
  else expect(result).toThrow('Offer amount is not in the quoted evidence.')
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
  const quote = 'USD 200 for the room, including USD 50 deposit. One pack of 24 plates costs USD 3.47, including delivery. Both are fully refundable.'
  current.view.inquiry!.replies![0].message.text = quote
  const value = { ...extracted, lines: [
    { ...extracted.lines[0], sourceQuotes: [quote] },
    { ...extracted.lines[0], optionId: 'plates', unitAmount: 347, deposit: { amount: 0, treatment: 'included' }, sourceQuotes: [quote] },
  ] }
  const result = validateSupplierOffer(current, value)
  expect(result.lines[1]).toMatchObject({ option: supply, sourceReplyId: 'reply', unitAmount: 347, sourceQuotes: [quote] })
})
