import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { planReadyEvent, canceledEvent } from '../../contracts/fixtures'
import { EventDetails } from './event-details'

const callbacks = { pending: false, onApprove: vi.fn(), onCancel: vi.fn(), onEdit: vi.fn() }

test('partial evidence without a plan shows unknown costs and cannot be approved', () => {
  const view = structuredClone(planReadyEvent)
  view.event.status = 'researched'
  view.plan = null
  view.researchResult!.outcome = 'partial'
  view.researchResult!.budgetFit = 'unknown'
  view.researchResult!.candidates[0].priceEstimate = null
  render(<EventDetails view={view} {...callbacks} />)
  expect(screen.getByText('No bookable plan yet.')).toBeInTheDocument()
  expect(screen.getAllByText(/Price unknown/).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getAllByRole('link').length).toBeGreaterThan(0)
})

test('shows the exact backend plan and keeps payment distinct from booking', () => {
  render(<EventDetails view={planReadyEvent} {...callbacks} />)
  expect(screen.getByText(`Plan ${planReadyEvent.plan!.planId}, revision ${planReadyEvent.plan!.revision}`)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Approve plan and continue to Checkout' })).toBeEnabled()
  expect(screen.getByText(/Payment does not confirm a supplier booking/)).toBeInTheDocument()
  const action = planReadyEvent.plan!.actions[0]
  expect(screen.getByText(`${action.supplierName}: ${action.target} - ${action.quantityOrSchedule}`)).toBeInTheDocument()
})

test('pending refund is not described as completed', () => {
  render(<EventDetails view={canceledEvent} {...callbacks} />)
  expect(screen.getByText('Refund: pending')).toBeInTheDocument()
  expect(screen.queryByText('Refund: succeeded')).not.toBeInTheDocument()
})

test('a plan from an older brief is not approvable', () => {
  const view = structuredClone(planReadyEvent)
  view.event.briefRevision++
  render(<EventDetails view={view} {...callbacks} />)
  expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
})
