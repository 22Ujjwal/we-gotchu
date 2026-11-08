import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PlanningOfferReview } from './planning-offer'
import type { SelectedOffer } from '../../agent/planning/offer-contract'

const offer: SelectedOffer = { id: 'offer', revision: 1, inquiryId: 'inquiry', replyId: 'reply', contextMessageIds: [],
  currency: 'usd', expiresAt: null, mode: 'simulated', missing: [],
  brief: { eventType: 'Party', location: 'SF', startsAt: '2026-12-12T20:00:00Z', timezone: 'America/Los_Angeles',
    headcount: 12, budget: 30000, currency: 'usd', supplyNeeds: [], maximumCancellationLoss: 0 },
  lines: [{ option: { id: 'room', kind: 'venue', name: 'Controlled room', url: 'https://example.com/room', why: 'Room', facts: [], unknowns: [] },
    sourceReplyId: 'reply', unitAmount: 20000, units: 1, quantityDescription: 'Room for 12', tax: 0, delivery: 0, fees: 0,
    deposit: { amount: 5000, treatment: 'included' }, cancellationTerms: 'Refundable.', sourceQuotes: ['USD 200 includes the USD 50 deposit.'] }],
}
test('shows selected quantities and an included deposit without adding it to the total', () => {
  render(<PlanningOfferReview offer={offer} stale={false} />)
  expect(screen.getByText('Controlled test offer')).toBeVisible()
  expect(screen.getByText('Room for 12')).toBeVisible()
  expect(screen.getByText(/Deposit:.*50.00.*included/)).toBeVisible()
  expect(screen.getByText('Total: $200.00')).toBeVisible()
  expect(screen.queryByRole('button', { name: /pay|book/i })).not.toBeInTheDocument()
})
test('shows missing charges and stale offer warnings without a complete total', () => {
  render(<PlanningOfferReview offer={{ ...offer, missing: ['Tax amount'], lines: [{ ...offer.lines[0], tax: null }] }} stale />)
  expect(screen.getByText('Tax amount')).toBeVisible()
  expect(screen.getByText('The complete total is not confirmed yet.')).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent('changed')
})

test('shows yen in the same units sent to Checkout', () => {
  render(<PlanningOfferReview offer={{ ...offer, currency: 'jpy', brief: { ...offer.brief, currency: 'jpy' } }} stale={false} />)
  expect(screen.getByText('Total: \u00a520,000')).toBeVisible()
  expect(screen.getByText(/Deposit:.*5,000.*included/)).toBeVisible()
})
