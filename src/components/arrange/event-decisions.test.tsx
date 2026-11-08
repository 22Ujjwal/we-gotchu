import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { EventDecisions } from './event-decisions'
import type { CustomerEventView } from '#/server/arrange/customer-view'

const offer = { id: 'off_1', operationKey: 'offer', version: 1, lines: [{ description: 'Dinner', quantity: 2, contactId: 'venue', unitAmountMinor: 8000, totalMinor: 16000, currency: 'EUR', priceExcerpt: '80 EUR each', deposit: 'No deposit', cancellation: 'Free before Friday', messageIds: ['mail'], priceTermId: 'p', depositTermId: 'd', cancellationTermId: 'c' }], totalMinor: 16000, currency: 'EUR', overBudgetMinor: 1000, createdAt: new Date().toISOString() }
const view = { options: [], chosenOptionId: 'venue', offer, approvedOfferId: null, payment: null, confirmations: [] } as unknown as CustomerEventView

it('requires an explicit overage decision and submits the exact offer version', () => {
  const act = vi.fn()
  render(<EventDecisions view={view} busy={false} onAction={act} />)
  expect(screen.getByRole('button', { name: 'Approve this offer' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Approve this offer' }))
  expect(act).toHaveBeenCalledWith({ action: 'approve', offerId: 'off_1', acceptOverage: true })
})

it('shows payment separately from supplier confirmation and hides the pay button', () => {
  render(<EventDecisions view={{ ...view, payment: { amountMinor: 16000, currency: 'EUR', receivedAt: new Date().toISOString() } }} busy={false} onAction={vi.fn()} />)
  expect(screen.getByText('Payment received')).toBeVisible()
  expect(screen.getByText('We are waiting for supplier confirmations.')).toBeVisible()
  expect(screen.queryByRole('button', { name: /pay/i })).not.toBeInTheDocument()
})
