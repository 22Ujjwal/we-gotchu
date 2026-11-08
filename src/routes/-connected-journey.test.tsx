import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { BriefIntake } from '../components/hostwell/brief-intake'
import { ConnectedEventPage, EventPage } from '../components/hostwell/event-page'
import { EventView } from '../contracts'
import { createEventViewFixture, type EventViewScenario } from '../lib/hostwell/event-view.test-fixtures'

const scenarios: EventViewScenario[] = [
  'running', 'partial', 'failed', 'missingInput', 'planReady', 'awaitingPayment',
  'booked', 'canceling', 'refundPending', 'refundCompleted',
]

for (const scenario of scenarios) {
  test(`${scenario} supplies a complete response with consistent event, run, and revision identities`, () => {
    const view = createEventViewFixture(scenario, { eventId: 'evt_second', customerId: 'customer_second', briefRevision: 3 })
    expect(EventView.safeParse(view).success).toBe(true)
    expect(view.event).toMatchObject({ eventId: 'evt_second', customerId: 'customer_second', briefRevision: 3 })
    expect(view.run).toMatchObject({ eventId: view.event.eventId, briefRevision: 3 })
    if (view.researchResult) expect(view.researchResult).toMatchObject({
      eventId: view.event.eventId, runId: view.run!.runId, briefRevision: 3, superseded: false,
    })
    if (view.plan) expect(view.plan).toMatchObject({
      eventId: view.event.eventId, runId: view.run!.runId, briefRevision: 3, revision: view.event.planRevision,
    })
    if (view.approval) {
      expect(view.approval).toMatchObject({ eventId: view.event.eventId, planId: view.plan!.planId, planRevision: view.plan!.revision })
      expect(view.approval.actionIds).toEqual(view.plan!.actions.map(action => action.actionId))
    }
    if (view.payment) expect(view.payment.approvalId).toBe(view.approval!.approvalId)
    for (const attempt of view.attempts) {
      expect(attempt.eventId).toBe(view.event.eventId)
      expect(attempt.approvalId).toBe(view.approval!.approvalId)
      expect(view.approval!.actionIds).toContain(attempt.actionId)
    }
    expect(view.progress.every(entry => entry.eventId === view.event.eventId)).toBe(true)
    expect(view.event.progressSequence).toBe(view.progress.at(-1)!.sequence)
  })
}

test('research-only responses cannot accidentally inherit approval or payment evidence', () => {
  for (const scenario of ['running', 'partial', 'failed', 'missingInput'] as const) {
    const view = createEventViewFixture(scenario)
    expect(view.plan).toBeNull()
    expect(view.approval).toBeNull()
    expect(view.payment).toBeNull()
    expect(view.attempts).toEqual([])
  }
  expect(createEventViewFixture('running').researchResult).toBeNull()
  expect(createEventViewFixture('partial').researchResult!.budgetFit).toBe('unknown')
  expect(createEventViewFixture('missingInput').researchResult!.missing).toEqual(['location'])
})

test('checkout pending and completed refund scenarios have distinct authoritative evidence', () => {
  const checkout = createEventViewFixture('awaitingPayment')
  expect(checkout.payment).toMatchObject({ state: 'pending', paymentIntentId: null, refundState: 'none' })
  expect(checkout.attempts).toEqual([])
  expect(createEventViewFixture('refundPending').payment!.refundState).toBe('pending')
  const refunded = createEventViewFixture('refundCompleted')
  expect(refunded.payment).toMatchObject({ state: 'paid', refundState: 'succeeded' })
  expect(refunded.progress.at(-1)!.message).toContain('Refund completed')
})

test('scenario builders isolate edits from other events and shared examples', () => {
  const edited = createEventViewFixture('planReady')
  edited.event.brief.location = 'Unsent edit'
  edited.plan!.actions.length = 0
  const fresh = createEventViewFixture('planReady')
  expect(fresh.event.brief.location).toBe('San Francisco, CA')
  expect(fresh.plan!.actions).toHaveLength(2)
})


const auth = vi.hoisted(() => ({ user: { id: 'customer_ui_1' } as { id: string } | null, isLoaded: true }))
vi.mock('@clerk/tanstack-react-start', () => ({ useUser: () => auth }))
beforeEach(() => { auth.user = { id: 'customer_ui_1' }; auth.isLoaded = true })

function controlledHttp(handler: (request: Request) => Response | Promise<Response>) {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(new URL(String(input), 'http://localhost'), init)
    return handler(request)
  })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
const flush = () => act(async () => {})
const advance = (milliseconds = 1000) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })

function getOnly(view: EventView) {
  controlledHttp(request => {
    expect(request.method).toBe('GET')
    expect(new URL(request.url).pathname).toBe(`/api/events/${view.event.eventId}`)
    return Response.json(view)
  })
}

test('the real connected screen restores the persisted brief after a reload', async () => {
  const view = createEventViewFixture('partial')
  view.event.brief.location = 'Persisted Oakland hall search'
  getOnly(view)
  const first = render(<ConnectedEventPage eventId={view.event.eventId} />)
  expect(await screen.findByText('Persisted Oakland hall search')).toBeVisible()
  first.unmount()
  render(<ConnectedEventPage eventId={view.event.eventId} />)
  expect(await screen.findByText('Persisted Oakland hall search')).toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(2)
  for (const [url] of vi.mocked(fetch).mock.calls) expect(String(url)).toBe(`/api/events/${view.event.eventId}`)
})

for (const [scenario, evidence] of [
  ['partial', 'Research: partial. Budget fit: unknown.'],
  ['failed', 'Research: failed. Budget fit: unknown.'],
  ['missingInput', 'Missing information: location'],
] as const) {
  test(`${scenario} research renders evidence without offering an absent plan for approval`, async () => {
    getOnly(createEventViewFixture(scenario))
    render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
    expect(await screen.findByText(evidence)).toBeVisible()
    expect(screen.getByText('No bookable plan yet.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Approve plan/ })).not.toBeInTheDocument()
    expect(screen.getByText('No payment recorded.')).toBeVisible()
  })
}

test('approval sends the displayed plan once and checkout return still shows pending payment', async () => {
  const ready = createEventViewFixture('planReady')
  const pending = createEventViewFixture('awaitingPayment')
  const approval = deferred<Response>()
  const checkout = vi.fn()
  const posts: unknown[] = []
  let returned = false
  controlledHttp(async request => {
    const path = new URL(request.url).pathname
    if (request.method === 'GET' && path === '/api/events/evt_ui_1') return Response.json(returned ? pending : ready)
    if (request.method === 'POST' && path === '/api/events/evt_ui_1/approve') {
      posts.push(await request.json())
      return approval.promise
    }
    throw new Error(`Unexpected request: ${request.method} ${path}`)
  })
  const first = render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" onCheckout={checkout} />)
  const button = await screen.findByRole('button', { name: /Approve plan and continue/ })
  fireEvent.click(button)
  fireEvent.click(button)
  await flush()
  expect(button).toBeDisabled()
  expect(posts).toEqual([{ planId: ready.plan!.planId, planRevision: ready.plan!.revision }])
  await act(async () => { approval.resolve(Response.json({ approval: pending.approval, payment: pending.payment,
    checkoutUrl: 'https://checkout.example.test/session-controlled' })) })
  expect(checkout).toHaveBeenCalledExactlyOnceWith('https://checkout.example.test/session-controlled')
  first.unmount()
  returned = true
  window.history.replaceState({}, '', '/events/evt_ui_1?checkout=success')
  const restored = render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" onCheckout={checkout} />)
  expect(await screen.findByText(/Payment: pending;/)).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('awaiting payment')
  expect(screen.queryByText(/Supplier evidence:/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Payment: paid;/)).not.toBeInTheDocument()
  restored.unmount()
  window.history.replaceState({}, '', '/')
})

test('cancellation and refund updates remain separate visible outcomes', async () => {
  vi.useFakeTimers()
  let response = createEventViewFixture('booked')
  const canceling = createEventViewFixture('canceling')
  const posts: string[] = []
  controlledHttp(request => {
    const path = new URL(request.url).pathname
    if (request.method === 'GET' && path === '/api/events/evt_ui_1') return Response.json(response)
    if (request.method === 'POST' && path === '/api/events/evt_ui_1/cancel') {
      posts.push(path)
      response = canceling
      return Response.json(response)
    }
    throw new Error(`Unexpected request: ${request.method} ${path}`)
  })
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  await flush()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel event' }))
  await flush()
  expect(screen.getByRole('status')).toHaveTextContent('canceling')
  expect(screen.getByText('Refund: none')).toBeVisible()
  response = createEventViewFixture('refundPending')
  await advance()
  expect(screen.getByRole('status')).toHaveTextContent('canceled')
  expect(screen.getByText('Refund: pending')).toBeVisible()
  response = createEventViewFixture('refundCompleted')
  await advance()
  expect(screen.getByText('Refund: succeeded')).toBeVisible()
  expect(posts).toEqual(['/api/events/evt_ui_1/cancel'])
  const count = vi.mocked(fetch).mock.calls.length
  await advance(5000)
  expect(fetch).toHaveBeenCalledTimes(count)
})

test('Clerk identity changes hide prior customer data and ignore a late response', async () => {
  vi.useFakeTimers()
  const alice = createEventViewFixture('running')
  alice.event.brief.location = 'Private Alice location'
  const lateAlice = deferred<Response>()
  const bob = createEventViewFixture('partial', { customerId: 'customer_bob' })
  bob.event.brief.location = 'Private Bob location'
  let aliceReads = 0
  controlledHttp(request => {
    expect(request.method).toBe('GET')
    expect(new URL(request.url).pathname).toBe('/api/events/evt_ui_1')
    if (auth.user?.id === 'customer_bob') return Response.json(bob)
    return ++aliceReads === 1 ? Response.json(alice) : lateAlice.promise
  })
  const page = render(<ConnectedEventPage eventId="evt_ui_1" />)
  await flush()
  expect(screen.getByText('Private Alice location')).toBeVisible()
  await advance()
  auth.user = { id: 'customer_bob' }
  page.rerender(<ConnectedEventPage eventId="evt_ui_1" />)
  expect(screen.queryByText('Private Alice location')).not.toBeInTheDocument()
  await flush()
  expect(screen.getByText('Private Bob location')).toBeVisible()
  await act(async () => { lateAlice.resolve(Response.json(alice)) })
  expect(screen.queryByText('Private Alice location')).not.toBeInTheDocument()
  auth.user = null
  page.rerender(<ConnectedEventPage eventId="evt_ui_1" />)
  expect(screen.getByRole('link', { name: 'Sign in to view your event' })).toBeVisible()
  expect(screen.queryByText('Private Bob location')).not.toBeInTheDocument()
  const count = vi.mocked(fetch).mock.calls.length
  await advance(5000)
  expect(fetch).toHaveBeenCalledTimes(count)
})
