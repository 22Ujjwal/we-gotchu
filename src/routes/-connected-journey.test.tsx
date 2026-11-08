import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
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
// The screens render outside a router here; links only need to be anchors.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) => <a href={to} {...props}>{children}</a>,
}))
beforeEach(() => {
  auth.user = { id: 'customer_ui_1' }
  auth.isLoaded = true
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

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
const loader = () => screen.queryByRole('region', { name: 'Research in progress' })

function getOnly(view: EventView) {
  controlledHttp(request => {
    expect(request.method).toBe('GET')
    expect(new URL(request.url).pathname).toBe(`/api/events/${view.event.eventId}`)
    return Response.json(view)
  })
}

test('signed out visitors are sent to sign in and back to the event', () => {
  render(<EventPage eventId="event-private" identity={null} />)
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?redirect_url=%2Fevents%2Fevent-private')
  expect(fetch).not.toHaveBeenCalled()
})

test('running research shows only the receipt loader', async () => {
  getOnly(createEventViewFixture('running'))
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  await flush()
  expect(loader()).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Arrange' })).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('failed research offers to edit the brief instead of a plan', async () => {
  getOnly(createEventViewFixture('failed'))
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  expect(await screen.findByRole('heading', { name: "We couldn't find a setting" })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Edit brief' })).toHaveAttribute('href', '/')
  expect(screen.queryByRole('button', { name: 'Arrange' })).not.toBeInTheDocument()
})

test('a ready plan is chosen, approved once and sent to checkout', async () => {
  const ready = createEventViewFixture('planReady')
  const pending = createEventViewFixture('awaitingPayment')
  const approval = deferred<Response>()
  const checkout = vi.fn()
  const posts: unknown[] = []
  controlledHttp(async request => {
    const path = new URL(request.url).pathname
    if (request.method === 'GET' && path === '/api/events/evt_ui_1') return Response.json(ready)
    if (request.method === 'POST' && path === '/api/events/evt_ui_1/approve') {
      posts.push(await request.json())
      return approval.promise
    }
    throw new Error(`Unexpected request: ${request.method} ${path}`)
  })
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" onCheckout={checkout} quoteScreenMs={0} />)
  const cards = within(await screen.findByRole('region', { name: 'Suggested venues' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ready.event.brief.eventType)
  expect(cards.getByRole('heading', { name: 'Harbor Loft (simulated)' })).toBeVisible()
  expect(cards.queryByText(`$${(ready.plan!.total / 100).toFixed(2)}`)).not.toBeInTheDocument()

  fireEvent.click(cards.getByRole('button', { name: 'Choose Garden Room (simulated)' }))
  expect(screen.getByRole('button', { name: 'Arrange' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Back to settings' }))

  fireEvent.click(within(screen.getByRole('region', { name: 'Suggested venues' }))
    .getAllByRole('button', { name: 'Choose this setting' })[0])
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Harbor Loft (simulated)')
  const receipt = within(screen.getByRole('figure', { name: 'Receipt' }))
  expect(receipt.queryByText('VAT')).not.toBeInTheDocument()
  expect(receipt.getByText((ready.plan!.total / 100).toFixed(2), { selector: '.text-\\[20px\\]' })).toBeVisible()

  const button = screen.getByRole('button', { name: 'Arrange' })
  fireEvent.click(button)
  fireEvent.click(button)
  await flush()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Getting quotes for everything')
  expect(screen.queryByRole('button', { name: 'Arrange' })).not.toBeInTheDocument()
  expect(posts).toEqual([{ planId: ready.plan!.planId, planRevision: ready.plan!.revision }])
  await act(async () => { approval.resolve(Response.json({ approval: pending.approval, payment: pending.payment,
    checkoutUrl: 'https://checkout.example.test/session-controlled' })) })
  expect(checkout).toHaveBeenCalledExactlyOnceWith('https://checkout.example.test/session-controlled')
})

test('a paid booking shows the party summary', async () => {
  getOnly(createEventViewFixture('booked'))
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  expect(await screen.findByRole('heading', { name: "It's happening!" })).toBeVisible()
  expect(screen.getByText('Harbor Loft (simulated)')).toBeVisible()
  expect(screen.getByText(/^Everything is booked for/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Arrange' })).not.toBeInTheDocument()
})

test('a partial booking does not claim everything is booked', async () => {
  const view = createEventViewFixture('booked')
  view.event.status = 'partially_booked'
  Object.assign(view.attempts[1], { state: 'unknown', providerReference: null, actualAmount: null,
    evidence: null, errorReason: 'The supplier response was lost.' })
  getOnly(view)
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  expect(await screen.findByRole('heading', { name: 'In progress' })).toBeVisible()
  expect(screen.getByText("We're still confirming a few things.")).toBeVisible()
  expect(screen.queryByRole('heading', { name: "It's happening!" })).not.toBeInTheDocument()
  expect(screen.queryByText(/Everything is booked/)).not.toBeInTheDocument()
})

test('canceled events do not offer the plan again', async () => {
  getOnly(createEventViewFixture('refundCompleted'))
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  expect(await screen.findByRole('heading', { name: 'This event is canceled' })).toBeVisible()
})

test('Clerk identity changes hide prior customer data and ignore a late response', async () => {
  vi.useFakeTimers()
  const alice = createEventViewFixture('planReady')
  alice.event.brief.eventType = 'Private Alice party'
  alice.event.status = 'awaiting_payment'
  const lateAlice = deferred<Response>()
  const bob = createEventViewFixture('planReady', { customerId: 'customer_bob' })
  bob.event.brief.eventType = 'Private Bob party'
  let aliceReads = 0
  controlledHttp(request => {
    expect(request.method).toBe('GET')
    if (auth.user?.id === 'customer_bob') return Response.json(bob)
    return ++aliceReads === 1 ? Response.json(alice) : lateAlice.promise
  })
  const page = render(<ConnectedEventPage eventId="evt_ui_1" />)
  await flush()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Private Alice party')
  await advance(5000)
  auth.user = { id: 'customer_bob' }
  page.rerender(<ConnectedEventPage eventId="evt_ui_1" />)
  expect(screen.queryByText('Private Alice party')).not.toBeInTheDocument()
  await flush()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Private Bob party')
  await act(async () => { lateAlice.resolve(Response.json(alice)) })
  expect(screen.queryByText('Private Alice party')).not.toBeInTheDocument()
  auth.user = null
  page.rerender(<ConnectedEventPage eventId="evt_ui_1" />)
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeVisible()
  expect(screen.queryByText('Private Bob party')).not.toBeInTheDocument()
  const count = vi.mocked(fetch).mock.calls.length
  await advance(10000)
  expect(fetch).toHaveBeenCalledTimes(count)
})

for (const status of [401, 403, 404]) {
  test(`access failure ${status} clears the event and stops automatic reads`, async () => {
    vi.useFakeTimers()
    let count = 0
    const privateView = createEventViewFixture('planReady')
    privateView.event.status = 'awaiting_payment'
    privateView.event.brief.eventType = 'Private party before access loss'
    controlledHttp(request => {
      expect(request.method).toBe('GET')
      return ++count === 1 ? Response.json(privateView)
        : Response.json({ errorCode: 'access_denied', message: 'This event is not accessible.' }, { status })
    })
    render(<ConnectedEventPage eventId="evt_ui_1" />)
    await flush()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Private party before access loss')
    await advance(5000)
    expect(screen.queryByText('Private party before access loss')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(status === 401 ? 'Sign in again' : 'We could not load your event')
    await advance(10000)
    expect(count).toBe(2)
  })
}

test('changing event links rejects a late response from the prior event', async () => {
  const oldResponse = deferred<Response>()
  const next = createEventViewFixture('planReady', { eventId: 'evt_next' })
  next.event.brief.eventType = 'Next event party'
  controlledHttp(request => {
    expect(request.method).toBe('GET')
    const path = new URL(request.url).pathname
    if (path === '/api/events/evt_ui_1') return oldResponse.promise
    expect(path).toBe('/api/events/evt_next')
    return Response.json(next)
  })
  const page = render(<ConnectedEventPage eventId="evt_ui_1" />)
  page.rerender(<ConnectedEventPage eventId="evt_next" />)
  expect(await screen.findByText('Next event party')).toBeVisible()
  await act(async () => { oldResponse.resolve(Response.json(createEventViewFixture('planReady'))) })
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Next event party')
})

test('returning from checkout shows the loader until the payment is confirmed', async () => {
  vi.useFakeTimers()
  const pending = createEventViewFixture('awaitingPayment')
  const booked = createEventViewFixture('booked')
  let confirmed = false
  controlledHttp(request => {
    expect(request.method).toBe('GET')
    return Response.json(confirmed ? booked : pending)
  })
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" paid />)
  await flush()
  expect(loader()).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Arrange' })).not.toBeInTheDocument()
  confirmed = true
  await advance(5000)
  expect(screen.getByRole('heading', { name: "It's happening!" })).toBeVisible()
})

test('a pending payment without a checkout return can still be arranged again', async () => {
  getOnly(createEventViewFixture('awaitingPayment'))
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  expect(await screen.findByRole('region', { name: 'Suggested venues' })).toBeVisible()
})
