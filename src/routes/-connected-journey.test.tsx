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

test('slow research polls do not overlap and progress stays ordered without duplicates', async () => {
  vi.useFakeTimers()
  const first = createEventViewFixture('running')
  const slow = deferred<Response>()
  const paths: string[] = []
  const final = createEventViewFixture('partial')
  final.event.progressSequence = 3
  final.progress = [
    { ...first.progress[0], sequence: 3, message: 'Finished comparison.' },
    { ...first.progress[0], sequence: 2, message: 'Saved venue evidence.' },
    first.progress[0],
  ]
  controlledHttp(request => {
    expect(request.method).toBe('GET')
    paths.push(new URL(request.url).pathname + new URL(request.url).search)
    if (paths.length === 1) return Response.json(first)
    if (paths.length === 2) return slow.promise
    throw new Error('Terminal research must not keep polling')
  })
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  await flush()
  await advance()
  await advance(5000)
  expect(paths).toEqual(['/api/events/evt_ui_1', '/api/events/evt_ui_1?afterSequence=1'])
  await act(async () => { slow.resolve(Response.json(final)) })
  const progress = within(screen.getByRole('region', { name: 'Event progress' }))
  expect(progress.getAllByRole('listitem').map(item => item.textContent)).toEqual([
    'Comparing retrieved candidates.', 'Saved venue evidence.', 'Finished comparison.',
  ])
  await advance(5000)
  expect(paths).toHaveLength(2)
})

test('a revised brief wins over an older in-flight research response', async () => {
  vi.useFakeTimers()
  const old = createEventViewFixture('running')
  const late = deferred<Response>()
  const revised = createEventViewFixture('partial', { briefRevision: 2 })
  revised.event.brief.location = 'New location'
  let reads = 0
  const updates: unknown[] = []
  controlledHttp(async request => {
    if (request.method === 'GET') return ++reads === 1 ? Response.json(old) : late.promise
    expect(request.method).toBe('PATCH')
    expect(new URL(request.url).pathname).toBe('/api/events/evt_ui_1/brief')
    updates.push(await request.json())
    return Response.json(revised)
  })
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  await flush()
  await advance()
  fireEvent.click(screen.getByRole('button', { name: 'Edit brief' }))
  fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'New location' } })
  fireEvent.click(screen.getByRole('button', { name: 'Update brief' }))
  await flush()
  expect(updates).toEqual([{ expectedBriefRevision: 1, changes: { location: 'New location' } }])
  expect(screen.getByText('New location')).toBeVisible()
  await act(async () => { late.resolve(Response.json(old)) })
  expect(screen.getByText('New location')).toBeVisible()
  expect(screen.queryByText('San Francisco, CA')).not.toBeInTheDocument()
  expect(screen.getByText('Research: partial. Budget fit: unknown.')).toBeVisible()
})

test('conflicting edits keep the typed answers while current server state is restored', async () => {
  vi.useFakeTimers()
  const initial = createEventViewFixture('partial')
  const current = createEventViewFixture('partial', { briefRevision: 2 })
  current.event.brief.location = 'Someone else saved Berkeley'
  let conflict = false
  controlledHttp(request => {
    if (request.method === 'GET') return Response.json(conflict ? current : initial)
    expect(request.method).toBe('PATCH')
    expect(new URL(request.url).pathname).toBe('/api/events/evt_ui_1/brief')
    conflict = true
    return Response.json({ errorCode: 'stale_brief', message: 'The brief changed. Review the latest event.' }, { status: 409 })
  })
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  await flush()
  fireEvent.click(screen.getByRole('button', { name: 'Edit brief' }))
  fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'My unsent Oakland answer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Update brief' }))
  await flush()
  await advance()
  expect(screen.getByText('Someone else saved Berkeley')).toBeVisible()
  expect(screen.getByLabelText('Area')).toHaveValue('My unsent Oakland answer')
  expect(screen.getByText('Your edits are retained. Review the latest event before submitting again.')).toBeVisible()
  expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes('brief changed'))).toBe(true)
})

async function enterIntake(user: ReturnType<typeof userEvent.setup>, overrides: Record<string, string> = {}) {
  const fields = { Occasion: 'Team dinner', 'Number of guests': '18', Date: '2026-12-12',
    'Start time': '19:30+01:00', Timezone: 'Europe/Berlin', Area: 'Berlin', Budget: '900.25',
    Currency: 'EUR', 'Acceptable cancellation loss': '12.50', 'What you need': 'candles, plates', ...overrides }
  for (const labels of [['Occasion', 'Number of guests'], ['Date', 'Start time', 'Timezone', 'Area'],
    ['Budget', 'Currency', 'Acceptable cancellation loss'], ['What you need']]) {
    for (const label of labels) await user.type(screen.getByLabelText(label), fields[label as keyof typeof fields])
    if (labels[0] !== 'What you need') await user.keyboard('{Enter}')
  }
}

test('keyboard intake sends explicit offset timezone currency and answers without guessing', async () => {
  const user = userEvent.setup()
  const created = vi.fn()
  const requests: unknown[] = []
  controlledHttp(async request => {
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/api/events')
    requests.push(await request.json())
    return Response.json(createEventViewFixture('running', { eventId: 'evt_created' }))
  })
  render(<BriefIntake identity="customer_ui_1" onCreated={created} />)
  await enterIntake(user)
  await user.keyboard('{Enter}')
  expect(created).toHaveBeenCalledExactlyOnceWith('evt_created')
  expect(requests).toEqual([{ eventType: 'Team dinner', headcount: 18, startsAt: '2026-12-12T18:30:00.000Z',
    timezone: 'Europe/Berlin', location: 'Berlin', budget: 90025, currency: 'eur', maximumCancellationLoss: 1250,
    supplyNeeds: ['candles', 'plates'] }])
})

for (const [fields, error] of [
  [{ 'Start time': '19:30' }, /explicit UTC offset/],
  [{ Timezone: 'Not/AZone' }, /valid timezone/],
  [{ Currency: 'dollars' }, /three-letter currency/],
  [{ Date: 'December 12' }, /YYYY-MM-DD/],
] as const) {
  test(`intake rejects ambiguous ${Object.keys(fields)[0]} without sending a request`, async () => {
    const user = userEvent.setup()
    render(<BriefIntake identity="customer_ui_1" onCreated={vi.fn()} />)
    await enterIntake(user, fields)
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(error)
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(screen.getByLabelText('What you need')).toHaveValue('candles, plates')
    expect(fetch).not.toHaveBeenCalled()
  })
}

test('a lost create response retains entered answers and prevents repeated creation', async () => {
  const user = userEvent.setup()
  controlledHttp(() => { throw new TypeError('response lost') })
  render(<BriefIntake identity="customer_ui_1" onCreated={vi.fn()} />)
  await enterIntake(user)
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('outcome is unknown')
  expect(screen.getByLabelText('What you need')).toHaveValue('candles, plates')
  const submit = screen.getByRole('button', { name: 'Find venues' })
  expect(submit).toBeDisabled()
  await user.click(submit)
  expect(fetch).toHaveBeenCalledTimes(1)
})

for (const status of [401, 403, 404]) {
  test(`access failure ${status} clears the event and stops automatic reads`, async () => {
    vi.useFakeTimers()
    let count = 0
    const privateView = createEventViewFixture('running')
    privateView.event.brief.location = 'Private location before access loss'
    controlledHttp(request => {
      expect(request.method).toBe('GET')
      return ++count === 1 ? Response.json(privateView)
        : Response.json({ errorCode: 'access_denied', message: 'This event is not accessible.' }, { status })
    })
    render(<ConnectedEventPage eventId="evt_ui_1" />)
    await flush()
    expect(screen.getByText('Private location before access loss')).toBeVisible()
    await advance()
    expect(screen.getByRole('alert')).toHaveTextContent('not accessible')
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(screen.queryByText('Private location before access loss')).not.toBeInTheDocument()
    await advance(10000)
    expect(count).toBe(2)
  })
}

test('temporary read failure retains saved evidence and reconnects without another write', async () => {
  vi.useFakeTimers()
  let count = 0
  controlledHttp(request => {
    expect(request.method).toBe('GET')
    count++
    if (count === 2) throw new TypeError('disconnected')
    return Response.json(createEventViewFixture(count === 1 ? 'running' : 'partial'))
  })
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  await flush()
  await advance()
  expect(screen.getByRole('alert')).toHaveTextContent('Check your connection')
  expect(screen.getByText('San Francisco, CA')).toBeVisible()
  await advance()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText('Research: partial. Budget fit: unknown.')).toBeVisible()
  expect(count).toBe(3)
})

test('missing-field server errors keep intake answers available for correction', async () => {
  const user = userEvent.setup()
  controlledHttp(request => {
    expect(request.method).toBe('POST')
    return Response.json({ errorCode: 'missing_fields', message: 'Please clarify the location.', missing: ['location'] }, { status: 422 })
  })
  render(<BriefIntake identity="customer_ui_1" onCreated={vi.fn()} />)
  await enterIntake(user)
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('clarify the location')
  expect(screen.getByLabelText('What you need')).toHaveValue('candles, plates')
  await user.click(screen.getByRole('button', { name: /2026-12-12/ }))
  expect(screen.getByLabelText('Area')).toHaveValue('Berlin')
  expect(screen.getByLabelText('Timezone')).toHaveValue('Europe/Berlin')
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('mixed supplier outcomes show an unknown commitment without inventing confirmation', async () => {
  const view = createEventViewFixture('booked')
  view.event.status = 'partially_booked'
  Object.assign(view.attempts[1], { state: 'unknown', providerReference: null, actualAmount: null,
    evidence: null, errorReason: 'The supplier response was lost.' })
  getOnly(view)
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  expect(await screen.findByText(/Payment: paid;/)).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('partially booked')
  const commitments = within(screen.getByRole('region', { name: 'Payment and commitments' }))
  expect(commitments.getAllByText(/Supplier evidence:/)).toHaveLength(1)
  expect(commitments.getByText('No supplier confirmation evidence recorded.')).toBeVisible()
  expect(commitments.getByText('Outcome unknown. Do not repeat this supplier action; reconciliation is needed.')).toBeVisible()
})

test('changing event links rejects a late response from the prior event', async () => {
  const oldResponse = deferred<Response>()
  const next = createEventViewFixture('partial', { eventId: 'evt_next' })
  next.event.brief.location = 'Next event location'
  controlledHttp(request => {
    expect(request.method).toBe('GET')
    const path = new URL(request.url).pathname
    if (path === '/api/events/evt_ui_1') return oldResponse.promise
    expect(path).toBe('/api/events/evt_next')
    return Response.json(next)
  })
  const page = render(<ConnectedEventPage eventId="evt_ui_1" />)
  page.rerender(<ConnectedEventPage eventId="evt_next" />)
  expect(await screen.findByText('Next event location')).toBeVisible()
  await act(async () => { oldResponse.resolve(Response.json(createEventViewFixture('partial'))) })
  expect(screen.getByText('Next event location')).toBeVisible()
  expect(screen.queryByText('San Francisco, CA')).not.toBeInTheDocument()
})

test('returning after the research deadline shows the server failure without restarting research', async () => {
  vi.useFakeTimers()
  const running = createEventViewFixture('running')
  const expired = createEventViewFixture('failed')
  expired.researchResult!.warnings = ['Research reached its time limit; retry with a revised brief.']
  let returned = false
  controlledHttp(request => {
    expect(request.method).toBe('GET')
    expect(new URL(request.url).pathname).toBe('/api/events/evt_ui_1')
    return Response.json(returned ? expired : running)
  })
  const first = render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  await flush()
  first.unmount()
  await advance(121000)
  expect(fetch).toHaveBeenCalledTimes(1)
  returned = true
  render(<EventPage eventId="evt_ui_1" identity="customer_ui_1" />)
  await flush()
  expect(screen.getByText('Research reached its time limit; retry with a revised brief.')).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('failed')
  expect(screen.queryByText(/Cancellation requested at/)).not.toBeInTheDocument()
  await advance(5000)
  expect(fetch).toHaveBeenCalledTimes(2)
})
