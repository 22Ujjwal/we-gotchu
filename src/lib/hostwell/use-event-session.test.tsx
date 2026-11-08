import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { expect, test, vi } from 'vitest'
import { bookedEvent, planReadyEvent } from '../../contracts'
import { useEventSession } from './use-event-session'

function Screen({ eventId = 'evt_sim_1', identity = 'user' }: { eventId?: string | null; identity?: string | null }) {
  const session = useEventSession({ eventId, identity })
  return <>
    <p role="status">{session.loading ? 'Loading' : session.view?.event.eventId ?? 'Empty'}</p>
    <p>{session.pending ? 'Pending' : 'Ready'}</p>
    <p role="alert">{session.error?.code}</p>
    <p>{session.view?.payment?.state ?? 'No payment'}</p>
    <button onClick={() => { void session.approve().catch(() => {}) }}>Approve</button>
    <button onClick={() => { void session.cancel().catch(() => {}) }}>Cancel</button>
    <button onClick={() => { void session.update({ headcount: 30 }).catch(() => {}) }}>Update</button>
    <button onClick={() => { void session.refresh() }}>Refresh</button>
  </>
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

test('restores a complete event and clears it immediately on sign-out', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(planReadyEvent))
  const view = render(<Screen />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading')
  await act(async () => {})
  expect(screen.getByRole('status')).toHaveTextContent('evt_sim_1')
  view.rerender(<Screen identity={null} />)
  expect(screen.getByRole('status')).toHaveTextContent('Empty')
  fireEvent.click(screen.getByText('Refresh'))
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('account and event switches abort old reads and discard their late responses', async () => {
  const old = deferred<Response>()
  const next = deferred<Response>()
  vi.mocked(fetch).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
  const view = render(<Screen />)
  const oldSignal = vi.mocked(fetch).mock.calls[0][1]?.signal
  view.rerender(<Screen eventId="second" identity="different-user" />)
  expect(oldSignal?.aborted).toBe(true)
  expect(screen.getByRole('status')).toHaveTextContent('Loading')
  await act(async () => old.resolve(Response.json(planReadyEvent)))
  expect(screen.getByRole('status')).not.toHaveTextContent('evt_sim_1')
  await act(async () => next.resolve(Response.json({ ...planReadyEvent, event: { ...planReadyEvent.event, eventId: 'second' } })))
  expect(screen.getByRole('status')).toHaveTextContent('second')
  view.unmount()
  expect(vi.mocked(fetch).mock.calls[1][1]?.signal?.aborted).toBe(false)
})

test('unmount aborts pending work and cancels polling', async () => {
  vi.useFakeTimers()
  const pending = deferred<Response>()
  vi.mocked(fetch).mockReturnValue(pending.promise)
  const view = render(<Screen />)
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
  view.unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => {
    pending.resolve(Response.json(planReadyEvent))
    await vi.advanceTimersByTimeAsync(10000)
  })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('approval sends the displayed plan once and never invents payment success', async () => {
  const approval = deferred<Response>()
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(planReadyEvent)).mockReturnValue(approval.promise)
  render(<Screen />)
  await act(async () => {})
  fireEvent.click(screen.getByText('Approve'))
  fireEvent.click(screen.getByText('Approve'))
  expect(screen.getByText('Pending')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toEqual({ planId: planReadyEvent.plan!.planId, planRevision: 1 })
  await act(async () => approval.resolve(Response.json({ approval: bookedEvent.approval, payment: { ...bookedEvent.payment!, state: 'pending' }, checkoutUrl: 'https://checkout.example.com/session' })))
  expect(screen.getByText('pending')).toBeInTheDocument()
  expect(screen.queryByText('paid')).not.toBeInTheDocument()
})

test('StrictMode cleanup does not let the discarded read replace the active session', async () => {
  const old = deferred<Response>()
  vi.mocked(fetch).mockReturnValueOnce(old.promise).mockResolvedValue(Response.json(planReadyEvent))
  render(<StrictMode><Screen /></StrictMode>)
  await act(async () => {})
  expect(screen.getByRole('status')).toHaveTextContent('evt_sim_1')
  await act(async () => old.resolve(Response.json(bookedEvent)))
  expect(screen.getByText('No payment')).toBeInTheDocument()
})
