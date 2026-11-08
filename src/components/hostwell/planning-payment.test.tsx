import { afterEach, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { planReadyEvent, bookedEvent } from '../../contracts/fixtures'
import { PlanningPayment } from './planning-payment'

const link = { eventId: planReadyEvent.event.eventId, planId: planReadyEvent.plan!.planId,
  planRevision: planReadyEvent.plan!.revision, offerId: 'offer', offerRevision: 1 }
afterEach(() => vi.unstubAllGlobals())
test('uses the charge currency units in the approval amount', async () => {
  const view = structuredClone(planReadyEvent)
  view.plan!.currency = 'jpy'
  view.plan!.total = 20000
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(view))))
  render(<PlanningPayment link={link} identity="customer" stale={false} />)
  expect(await screen.findByText('Selected plan total: \u00a520,000')).toBeVisible()
  expect(screen.getByRole('checkbox')).toHaveAccessibleName(/20,000 total/)
})
test('requires explicit approval and uses the existing event approval API exactly once', async () => {
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${url}`)
    return new Response(JSON.stringify(url.endsWith('/approve') ? { approval: bookedEvent.approval, payment: bookedEvent.payment,
      checkoutUrl: 'https://checkout.stripe.com/test' } : planReadyEvent))
  }))
  const checkout = vi.fn()
  render(<PlanningPayment link={link} identity="customer" stale={false} onCheckout={checkout} />)
  const button = await screen.findByRole('button', { name: 'Approve and open sandbox Checkout' })
  expect(button).toBeDisabled()
  const user = userEvent.setup()
  await user.click(screen.getByRole('checkbox'))
  await user.click(button)
  await waitFor(() => expect(checkout).toHaveBeenCalledWith('https://checkout.stripe.com/test'))
  expect(requests.filter(request => request.startsWith('POST'))).toEqual([`POST /api/events/${link.eventId}/approve`])
})
test('restores saved payment status without treating it as a real reservation', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...bookedEvent, payment: { ...bookedEvent.payment, mode: 'test' } }))))
  render(<PlanningPayment link={link} identity="customer" stale={false} />)
  expect(await screen.findByText('Sandbox payment received.')).toBeVisible()
  expect(screen.getByText(/Supplier execution is simulated/)).toBeVisible()
  expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
})

test('offers replacement only after cancellation has no unsettled payment', async () => {
  const canceled = { ...planReadyEvent, event: { ...planReadyEvent.event, status: 'canceled', cancelRequestedAt: '2026-11-08T12:00:00Z' } }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(canceled))))
  const release = vi.fn()
  render(<PlanningPayment link={link} identity="customer" stale onRelease={release} />)
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Update offer after cancellation' }))
  expect(release).toHaveBeenCalledTimes(1)
})

test('keeps cancellation recovery available while supplier settlement is unfinished', async () => {
  const canceling = { ...bookedEvent, event: { ...bookedEvent.event, status: 'canceling', cancelRequestedAt: '2026-11-08T12:00:00Z' } }
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${url}`)
    return new Response(JSON.stringify(canceling))
  }))
  render(<PlanningPayment link={link} identity="customer" stale onRelease={vi.fn()} />)
  expect(await screen.findByText('Cancellation is in progress. Supplier settlement and any refund may still be pending.')).toBeVisible()
  expect(screen.queryByText('This payment plan was canceled.')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Update offer after cancellation' })).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Continue cancellation' }))
  await waitFor(() => expect(requests.filter(request => request.startsWith('POST'))).toEqual([`POST /api/events/${link.eventId}/cancel`]))
})

test.each([
  ['executing', 'Simulated booking is in progress.'],
  ['booked', 'Simulated booking complete.'],
  ['partially_booked', 'Simulated booking is partially complete.'],
  ['failed', 'Simulated booking could not be completed.'],
] as const)('shows %s separately from payment and links the saved receipts', async (status, message) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...bookedEvent, event: { ...bookedEvent.event, status } })))
  render(<PlanningPayment link={link} identity="customer" stale={false} />)
  expect(await screen.findByText(message)).toBeVisible()
  expect(screen.getByText('Simulated payment recorded.')).toBeVisible()
  expect(screen.getByRole('link', { name: 'View receipts' })).toHaveAttribute('href', `/events/${link.eventId}/receipts`)
})

test('does not link receipts before a confirmed payment', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(planReadyEvent)))
  render(<PlanningPayment link={link} identity="customer" stale={false} />)
  await screen.findByText('No payment recorded.')
  expect(screen.queryByRole('link', { name: 'View receipts' })).not.toBeInTheDocument()
})

test('does not link receipts when payment belongs to another approval', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...bookedEvent,
    payment: { ...bookedEvent.payment, approvalId: 'other-approval' } })))
  render(<PlanningPayment link={link} identity="customer" stale={false} />)
  await screen.findByText('Simulated payment recorded.')
  expect(screen.queryByRole('link', { name: 'View receipts' })).not.toBeInTheDocument()
})
