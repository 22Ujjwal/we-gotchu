import { expect, test } from 'vitest'
import { displayCopy, displayFactLabel, displayFactValue } from './display-copy'

test('display copy removes em dashes without changing price ranges or qualifications', () => {
  expect(displayCopy('$9,000–$16,000 — December excluded')).toBe('$9,000–$16,000, December excluded')
})

test('fact labels omit repeated source metadata for any venue', () => {
  expect(displayFactLabel('Saturday rental, official search excerpt')).toBe('Saturday rental')
  expect(displayFactLabel('Capacity, search excerpt')).toBe('Capacity')
  expect(displayFactLabel('Insurance, taxes and fees')).toBe('Insurance, taxes and fees')
})

test('shortens fact wording without dropping prices, date exclusions or additional costs', () => {
  expect(displayFactValue('Published general range: $9,000–$16,000, above the $500 total budget; not applicable to December.'))
    .toBe('$9,000–$16,000, over the $500 budget; December excluded.')
  expect(displayFactValue('December 12, 2026 requires separate pricing; no applicable event-date rental subtotal is known.'))
    .toBe('December 12, 2026 quote needed.')
  expect(displayFactValue('Up to 10 hours including setup/breakdown; personnel, equipment, insurance and taxes are excluded, and extra time costs more.'))
    .toBe('Up to 10 hours with setup/breakdown; staff, equipment, insurance, tax and overtime cost extra.')
  expect(displayFactValue('$200 per hour, estimated. Availability unconfirmed.'))
    .toBe('$200 per hour, estimated. Availability unconfirmed.')
})
