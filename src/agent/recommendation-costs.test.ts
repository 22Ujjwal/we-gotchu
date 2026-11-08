import { expect, test } from 'vitest'
import { assessCosts, packQuantity } from './recommendation-costs'

test.each([[20, 8, 3], [16, 8, 2], [1, 8, 1]])('rounds %i required units in %i-unit packs to %i packs', (needed, size, packs) => {
  expect(packQuantity(needed, size)).toEqual({ needed, packSize: size, packs })
})

test.each([[0, 8], [20, 0], [-1, 8], [1.5, 8], [Infinity, 8], [Number.MAX_SAFE_INTEGER, 8]])('rejects unsafe quantity %s and size %s', (needed, size) => {
  expect(packQuantity(needed, size)).toBeUndefined()
})

const cost = (amountMinor: number | null, currency = 'USD', required = true) => ({ amountMinor, currency, required })
test('complete compatible required costs establish within, including a zero price', () => {
  expect(assessCosts([cost(0), cost(100, 'usd')], 100, 'USD')).toEqual({ subtotal: 100, fit: 'within' })
})
test('unknown required costs prevent within but do not hide an over-budget subtotal', () => {
  expect(assessCosts([cost(100), cost(null)], 100, 'USD')).toEqual({ subtotal: 100, fit: 'unknown' })
  expect(assessCosts([cost(101), cost(null)], 100, 'USD')).toEqual({ subtotal: 101, fit: 'over' })
})
test('mismatched currency is never summed or converted', () => {
  expect(assessCosts([cost(100), cost(200, 'EUR')], 150, 'USD')).toEqual({ subtotal: 100, fit: 'unknown' })
})
test('unknown optional charges do not block a complete required cost set', () => {
  expect(assessCosts([cost(100), cost(null, 'USD', false)], 100, 'USD').fit).toBe('within')
})
test('empty, overflowing, fractional, and negative amounts cannot establish within', () => {
  expect(assessCosts([], 100, 'USD').fit).toBe('unknown')
  expect(assessCosts([cost(Number.MAX_SAFE_INTEGER), cost(1)], 100, 'USD').fit).toBe('unknown')
  for (const invalid of [-1, 1.5, NaN, Infinity]) expect(assessCosts([cost(invalid)], 100, 'USD').fit).toBe('unknown')
})
