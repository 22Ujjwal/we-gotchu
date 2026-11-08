import { afterEach, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { planReadyEvent, bookedEvent } from '../../contracts/fixtures'
import { PlanningPayment } from './planning-payment'

const link = { eventId: planReadyEvent.event.eventId, planId: planReadyEvent.plan!.planId,
  planRevision: planReadyEvent.plan!.revision, offerId: 'offer', offerRevision: 1 }
afterEach(() => vi.unstubAllGlobals())
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
