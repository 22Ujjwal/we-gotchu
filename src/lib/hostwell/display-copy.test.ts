import { expect, test } from 'vitest'
import { displayCopy, displayFactLabel } from './display-copy'

test('display copy removes em dashes without changing price ranges or qualifications', () => {
  expect(displayCopy('$9,000–$16,000 — December excluded')).toBe('$9,000–$16,000, December excluded')
})

test('fact labels omit repeated source metadata for any venue', () => {
  expect(displayFactLabel('Saturday rental, official search excerpt')).toBe('Saturday rental')
  expect(displayFactLabel('Capacity, search excerpt')).toBe('Capacity')
  expect(displayFactLabel('Insurance, taxes and fees')).toBe('Insurance, taxes and fees')
})
