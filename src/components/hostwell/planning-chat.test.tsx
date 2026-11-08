import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import type { PlanningOption, PlanningView } from '../../agent/planning/contract'
import { ConnectedPlanningPage, PlanningIntake } from './planning-chat'

const auth = vi.hoisted(() => ({ user: { id: 'customer-a' } as { id: string } | null, isLoaded: true }))
vi.mock('@clerk/tanstack-react-start', () => ({ useUser: () => auth }))
const venue: PlanningOption = { id: 'venue-a', kind: 'venue', name: 'Garden room', url: 'https://example.com/room',
  why: 'Room for dinner.', facts: [{ label: 'Room hire', value: 'USD 200', basis: 'published', sourceUrl: 'https://example.com/rates', quote: 'Room hire is $200.' }], unknowns: ['Confirm your date.'] }
const supply: PlanningOption = { ...venue, id: 'supply-a', kind: 'supply', name: 'Paper plates' }
const view = (changes: Partial<PlanningView> = {}): PlanningView => ({ id: 'plan-a', version: 1, status: 'ready',
  messages: [{ id: 'm1', role: 'user', text: 'Dinner next Saturday in Oakland.', createdAt: '2026-11-07T12:00:00Z' }],
  proposal: { summary: 'Two options for dinner.', nextQuestion: 'What time should dinner start?', options: [venue, supply] },
  selections: [], progress: null, error: null, ...changes })
function http(handle: (request: Request) => Response | Promise<Response>) {
  vi.mocked(fetch).mockImplementation((input, init) => String(input).endsWith('/images')
    ? Promise.resolve(Response.json({ status: 'none', images: [] }))
    : Promise.resolve(handle(new Request(new URL(String(input), 'http://localhost'), init))))
}
beforeEach(() => { auth.user = { id: 'customer-a' }; auth.isLoaded = true })

test('initial research dial follows saved progress as polling updates arrive', async () => {
  vi.useFakeTimers()
  let saved = view({ status: 'working', proposal: null, progress: 'Checking Oakland venue capacity.' })
  http(() => Response.json(saved))
  render(<ConnectedPlanningPage id="plan-a" />)
  await act(async () => {})
  const loader = screen.getByRole('region', { name: 'Checking Oakland venue capacity.' })
  expect(within(loader).getByRole('status')).toHaveTextContent('Checking Oakland venue capacity.')
  saved = { ...saved, version: 2, progress: 'Comparing venue cancellation terms.' }
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(within(loader).getByRole('status')).toHaveTextContent('Comparing venue cancellation terms.')
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})

test('keyboard intake sends natural language once and opens the saved conversation', async () => {
  const user = userEvent.setup()
  const created = vi.fn()
  const bodies: unknown[] = []
  http(async request => { expect(new URL(request.url).pathname).toBe('/api/planning'); expect(request.method).toBe('POST'); bodies.push(await request.json()); return Response.json(view({ status: 'working' }), { status: 201 }) })
  render(<PlanningIntake onCreated={created} />)
  await user.type(screen.getByRole('textbox', { name: 'Tell us about your event' }), 'Dinner next Saturday in Oakland.')
  await user.keyboard('{Enter}')
  await waitFor(() => expect(created).toHaveBeenCalledExactlyOnceWith('plan-a'))
  expect(bodies).toEqual([{ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), message: 'Dinner next Saturday in Oakland.' }])
})

test('saved options show sources and selection snapshots survive a follow-up and reload', async () => {
  const user = userEvent.setup()
  let saved = view()
  const commands: Record<string, unknown>[] = []
  http(async request => {
    expect(new URL(request.url).pathname).toBe('/api/planning/plan-a')
    if (request.method === 'GET') return Response.json(saved)
    const command = await request.json(); commands.push(command)
    saved = command.kind === 'select' ? view({ version: 2, selections: [venue] })
      : view({ version: 3, selections: [venue], proposal: { summary: 'Cheaper supplies.', nextQuestion: null, options: [supply] } })
    return Response.json(saved)
  })
  const page = render(<ConnectedPlanningPage id="plan-a" />)
  expect(await screen.findByRole('heading', { name: 'Garden room' })).toBeVisible()
  await user.click(screen.getByText('Garden room sources and details'))
  expect(screen.getAllByText('USD 200')[0]).toBeVisible()
  const evidence = screen.getByText('Garden room sources and details').parentElement!
  expect(within(evidence).getByRole('link', { name: 'Published source' })).toHaveAttribute('href', 'https://example.com/rates')
  expect(within(evidence).getByText('Confirm your date.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Choose Garden room' }))
  expect(await screen.findByRole('button', { name: 'Remove Garden room' })).toHaveAttribute('aria-pressed', 'true')
  await user.type(screen.getByRole('textbox', { name: 'Ask for changes' }), 'Keep the room, reduce supply cost.')
  await user.keyboard('{Enter}')
  expect(await screen.findByText('Cheaper supplies.')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Garden room' })).toBeVisible()
  expect(commands).toEqual([
    { kind: 'select', requestId: expect.any(String), expectedVersion: 1, optionId: 'venue-a' },
    { kind: 'message', requestId: expect.any(String), expectedVersion: 2, message: 'Keep the room, reduce supply cost.' },
  ])
  page.unmount()
  render(<ConnectedPlanningPage id="plan-a" />)
  expect(await screen.findByRole('button', { name: 'Remove Garden room' })).toBeVisible()
  expect(commands).toHaveLength(2)
})

test('conflict refreshes the displayed version and preserves draft until explicit resubmit', async () => {
  let conflicted = false
  const commands: Record<string, unknown>[] = []
  http(async request => {
    if (request.method === 'GET') return Response.json(view({ version: conflicted ? 4 : 1 }))
    commands.push(await request.json())
    if (!conflicted) { conflicted = true; return Response.json({ errorCode: 'stale_version', message: 'Changed.' }, { status: 409 }) }
    return Response.json(view({ version: 5 }))
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  await screen.findByRole('heading', { name: 'Garden room' })
  fireEvent.change(screen.getByRole('textbox', { name: 'Ask for changes' }), { target: { value: 'My change' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Review the latest')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled())
  expect(screen.getByRole('textbox', { name: 'Ask for changes' })).toHaveValue('My change')
  expect(commands).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(commands).toHaveLength(2))
  expect(commands[1].expectedVersion).toBe(4)
  expect(commands[1].requestId).not.toBe(commands[0].requestId)
})

test('lost writes preserve the draft and only check saved status without resending', async () => {
  const commands: unknown[] = []
  http(async request => {
    if (request.method === 'GET') return Response.json(view())
    commands.push(await request.json())
    if (commands.length === 1) throw new TypeError('lost response')
    return Response.json(view({ version: 2 }))
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  await screen.findByRole('heading', { name: 'Garden room' })
  fireEvent.change(screen.getByRole('textbox', { name: 'Ask for changes' }), { target: { value: 'Cheaper please' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
  expect(screen.getByRole('textbox', { name: 'Ask for changes' })).toHaveValue('Cheaper please')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  expect(commands).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Check saved status' }))
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([url]) => !String(url).endsWith('/images'))).toHaveLength(3))
  expect(commands).toHaveLength(1)
  expect(screen.getByRole('textbox', { name: 'Ask for changes' })).toHaveValue('Cheaper please')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
})

test('polls do not overlap and stop at ready while retaining the prior proposal', async () => {
  vi.useFakeTimers()
  let resolve!: (response: Response) => void
  let count = 0
  http(() => { count++; return count === 1 ? Response.json(view({ status: 'working', progress: 'Comparing rooms.' })) : new Promise<Response>(r => { resolve = r }) })
  render(<ConnectedPlanningPage id="plan-a" />)
  await act(async () => {})
  expect(screen.getByText('Comparing rooms.')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Garden room' })).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(count).toBe(2)
  await act(async () => { resolve(Response.json(view())) })
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(count).toBe(2)
})

test('account switch aborts old reads and never shows their late private response', async () => {
  let resolve!: (response: Response) => void
  let signal: AbortSignal | undefined
  http(request => { signal = request.signal; return new Promise<Response>(r => { resolve = r }) })
  const page = render(<ConnectedPlanningPage id="plan-a" />)
  auth.user = null
  page.rerender(<ConnectedPlanningPage id="plan-a" />)
  expect(signal?.aborted).toBe(true)
  expect(screen.getByRole('link', { name: 'Sign in to view your plan' })).toHaveAttribute('href', '/sign-in?redirect_url=%2Fplanning%2Fplan-a')
  await act(async () => { resolve(Response.json(view())) })
  expect(screen.queryByRole('heading', { name: 'Garden room' })).not.toBeInTheDocument()
})

test('lost create response keeps the message and never creates again', async () => {
  const created = vi.fn()
  http(() => { throw new TypeError('lost create') })
  render(<PlanningIntake onCreated={created} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Dinner tomorrow' } })
  fireEvent.click(screen.getByRole('button', { name: 'Plan my event' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
  expect(screen.getByRole('textbox')).toHaveValue('Dinner tomorrow')
  expect(screen.getByRole('button', { name: 'Plan my event' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => !String(url).endsWith('/images'))).toHaveLength(1)
  expect(created).not.toHaveBeenCalled()
})

test('selection follows server snapshots for one venue and multiple supplies and toggles off', async () => {
  const otherVenue = { ...venue, id: 'venue-b', name: 'Dining hall' }
  const otherSupply = { ...supply, id: 'supply-b', name: 'Candles' }
  let saved = view({ proposal: { summary: 'Options.', nextQuestion: null, options: [venue, otherVenue, supply, otherSupply] } })
  const commands: Record<string, unknown>[] = []
  http(async request => {
    if (request.method === 'GET') return Response.json(saved)
    const command = await request.json(); commands.push(command)
    expect(command.kind).toBe('select')
    expect(command.expectedVersion).toBe(saved.version)
    const option = saved.proposal!.options.find(option => option.id === command.optionId)!
    const selected = saved.selections.some(item => item.id === option.id)
    saved = { ...saved, version: saved.version + 1, selections: selected ? saved.selections.filter(item => item.id !== option.id)
      : [...saved.selections.filter(item => option.kind !== 'venue' || item.kind !== 'venue'), option] }
    return Response.json(saved)
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  await screen.findByRole('heading', { name: 'Garden room' })
  fireEvent.click(screen.getByRole('button', { name: 'Choose Garden room' }))
  await screen.findByRole('button', { name: 'Remove Garden room' })
  for (const name of ['Paper plates', 'Candles']) {
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(name) }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: new RegExp(name) })).toBeChecked())
  }
  fireEvent.click(screen.getByRole('button', { name: 'Back to settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Choose Dining hall' }))
  await screen.findByRole('button', { name: 'Remove Dining hall' })
  expect(screen.queryByRole('button', { name: 'Remove Garden room' })).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /Paper plates/ })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /Candles/ })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Remove Dining hall' }))
  await screen.findByRole('button', { name: 'Choose Dining hall' })
  expect(commands).toHaveLength(5)
})

for (const status of ['ready', 'failed', 'uncertain'] as const) {
  test(`automatic reads stop at ${status}`, async () => {
    vi.useFakeTimers()
    http(() => Response.json(view({ status, error: 'private_provider_session_id' })))
    render(<ConnectedPlanningPage id="plan-a" />)
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => !String(url).endsWith('/images'))).toHaveLength(1)
    expect(screen.queryByText('private_provider_session_id')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /book|pay/i })).not.toBeInTheDocument()
  })
}

for (const status of [401, 403, 404]) {
  test(`access loss ${status} clears private options and stops reads`, async () => {
    vi.useFakeTimers()
    let count = 0
    http(() => ++count === 1 ? Response.json(view({ status: 'working' }))
      : Response.json({ errorCode: 'unavailable', message: 'private diagnostic' }, { status }))
    render(<ConnectedPlanningPage id="plan-a" />)
    await act(async () => {})
    expect(screen.getByRole('heading', { name: 'Garden room' })).toBeVisible()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.queryByRole('heading', { name: 'Garden room' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('not available')
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(count).toBe(2)
  })
}

test('temporary reads back off and preserve the prior proposal while working', async () => {
  vi.useFakeTimers()
  let count = 0
  http(() => {
    count++
    if (count === 2) throw new TypeError('offline')
    return Response.json(view({ status: count < 4 ? 'working' : 'ready', proposal: count === 3 ? null : view().proposal }))
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  await act(async () => {})
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(screen.getByRole('alert')).toHaveTextContent('connection')
  expect(screen.getByRole('heading', { name: 'Garden room' })).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(3999) })
  expect(count).toBe(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(count).toBe(3)
  expect(screen.getByRole('heading', { name: 'Garden room' })).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  expect(count).toBe(4)
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(count).toBe(4)
})

test('account changes discard draft and ignore a late create response', async () => {
  let resolve!: (response: Response) => void
  const created = vi.fn()
  http(() => new Promise<Response>(r => { resolve = r }))
  const page = render(<PlanningIntake onCreated={created} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Private event' } })
  fireEvent.click(screen.getByRole('button', { name: 'Plan my event' }))
  auth.user = { id: 'customer-b' }
  page.rerender(<PlanningIntake onCreated={created} />)
  expect(screen.getByRole('textbox')).toHaveValue('')
  await act(async () => { resolve(Response.json(view())) })
  expect(created).not.toHaveBeenCalled()
})

test('sign-in links keep the conversation URL and no reads happen when signed out', () => {
  auth.user = null
  render(<ConnectedPlanningPage id="plan-a" />)
  expect(screen.getByRole('link', { name: 'Sign in to view your plan' })).toHaveAttribute('href', '/sign-in?redirect_url=%2Fplanning%2Fplan-a')
  expect(fetch).not.toHaveBeenCalled()
})

test('uncertain write status remains checkable after a temporary read failure', async () => {
  vi.useFakeTimers()
  let reads = 0
  http(request => {
    if (request.method === 'POST') throw new TypeError('lost write')
    if (++reads === 2) throw new TypeError('offline')
    return Response.json(view())
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  await act(async () => {})
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep the room' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Check saved status' }))
  await act(async () => {})
  await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
  expect(screen.getByRole('button', { name: 'Check saved status' })).toBeEnabled()
  expect(screen.getByRole('alert')).toHaveTextContent('could not confirm')
  expect(screen.getByRole('textbox')).toHaveValue('Keep the room')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
})

test('a saved assistant answer is not repeated above the option cards', async () => {
  const saved = view({ messages: [{ id: 'answer-1', role: 'assistant', text: 'Two options for dinner.\n\nWhat time should dinner start?', createdAt: '2026-11-07T12:00:00Z' }] })
  http(() => Response.json(saved))
  render(<ConnectedPlanningPage id="plan-a" />)
  await screen.findByRole('heading', { name: 'Garden room' })
  expect(screen.getAllByText(/Two options for dinner\./)).toHaveLength(1)
})

test('paused research shows the exact request and only an explicit decision sends confirmation', async () => {
  const commands: Record<string, unknown>[] = []
  const paused = view({ status: 'blocked', canReviewResearch: true, progress: null, error: 'Research is paused for a decision.', approvals: [
    { id: 'approval-1', tool: 'monid.monid_inspect', arguments: { provider: 'channel3', endpoint: '/v1/search' } },
  ] })
  http(async request => {
    if (request.method === 'GET') return Response.json(paused)
    commands.push(await request.json())
    return Response.json(view({ version: 2, status: 'working', approvals: [] }))
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  expect(await screen.findByText("Research is paused for our team's review.")).toBeVisible()
  fireEvent.click(screen.getByText('Operator review for local testing'))
  expect(screen.getByText(/channel3/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  expect(commands).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: 'Approve this research call' }))
  await waitFor(() => expect(commands).toEqual([{ kind: 'confirm', requestId: expect.any(String), expectedVersion: 1, approvalId: 'approval-1', decision: 'allow' }]))
})

test.each(['blocked', 'uncertain'] as const)('shows team activity in %s state without exposing tool reviews to customers', async status => {
  http(() => Response.json(view({ status, proposal: null, canReviewResearch: false,
    activity: [{ name: 'Maya', status: 'blocked', detail: 'Paused for an internal research review.' },
      { name: 'Tom', status: 'waiting', detail: 'Waiting for research teammates.' }],
    approvals: [{ id: 'private-call', tool: 'monid.monid_run', arguments: { query: 'private-input' } }] })))
  render(<ConnectedPlanningPage id="plan-a" />)
  expect(await screen.findByRole('region', { name: 'Your planning team' })).toBeVisible()
  expect(screen.getByText('Maya')).toBeVisible()
  expect(screen.getByText('Waiting for research teammates.')).toBeVisible()
  expect(screen.queryByText(/private-input/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Approve this research call' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
})

test('paused customer research checks for progress and resumes without sending a command', async () => {
  vi.useFakeTimers()
  let reads = 0
  http(request => {
    expect(request.method).toBe('GET')
    return Response.json(++reads === 1 ? view({ status: 'blocked', proposal: null }) : view({ version: 2 }))
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  await act(async () => {})
  await act(async () => { await vi.advanceTimersByTimeAsync(4999) })
  expect(reads).toBe(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(reads).toBe(2)
  expect(screen.getByRole('heading', { name: 'Garden room' })).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(reads).toBe(2)
})

test('a lost operator confirmation recovers after a read shows that exact call is closed', async () => {
  let saved = view({ status: 'blocked', canReviewResearch: true, approvals: [
    { id: 'old-call', tool: 'monid.monid_inspect', arguments: {} },
  ] })
  let writes = 0
  http(request => {
    if (request.method === 'POST') {
      writes++
      saved = view({ version: 3, status: 'blocked', canReviewResearch: true, approvals: [
        { id: 'new-call', tool: 'monid.monid_run', arguments: {} },
      ] })
      throw new TypeError('response lost')
    }
    return Response.json(saved)
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  fireEvent.click(await screen.findByText('Operator review for local testing'))
  fireEvent.click(screen.getByRole('button', { name: 'Approve this research call' }))
  await screen.findByRole('button', { name: 'Check saved status' })
  fireEvent.click(screen.getByRole('button', { name: 'Check saved status' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Approve this research call' })).toBeEnabled())
  expect(writes).toBe(1)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('prepares, edits and reloads an inquiry without sending mail', async () => {
  const user = userEvent.setup()
  let saved = view({ selections: [venue] })
  const commands: Record<string, unknown>[] = []
  http(async request => {
    if (request.method === 'GET') return Response.json(saved)
    const command = await request.json(); commands.push(command)
    if (command.kind === 'prepare_inquiry') saved = { ...saved, version: 2, inquiry: {
      id: 'inquiry-a', revision: 1, status: 'draft', venue, recipient: '', contactSourceUrl: null,
      subject: 'Event inquiry', text: 'Please confirm our date and all-in price.', contextMessageIds: ['m1'], updatedAt: '2026-11-08T10:00:00Z',
    } }
    else saved = { ...saved, version: 3, inquiry: { ...saved.inquiry!, revision: 2,
      recipient: command.recipient, subject: command.subject, text: command.text } }
    return Response.json(saved)
  })
  const page = render(<ConnectedPlanningPage id="plan-a" />)
  await user.click(await screen.findByRole('button', { name: 'Prepare venue inquiry' }))
  expect(await screen.findByText(/No published email address/)).toBeVisible()
  await user.type(screen.getByRole('textbox', { name: 'Venue email' }), 'test@example.com')
  await user.type(screen.getByRole('textbox', { name: 'Inquiry message' }), ' We need space for 12.')
  await user.click(screen.getByRole('button', { name: 'Save inquiry draft' }))
  expect(await screen.findByText('Draft saved. Nothing has been sent.')).toBeVisible()
  expect(commands.map(command => command.kind)).toEqual(['prepare_inquiry', 'save_inquiry'])
  page.unmount()
  render(<ConnectedPlanningPage id="plan-a" />)
  expect(await screen.findByRole('textbox', { name: 'Venue email' })).toHaveValue('test@example.com')
  expect(screen.getByRole('textbox', { name: 'Inquiry message' })).toHaveValue('Please confirm our date and all-in price. We need space for 12.')
  expect(screen.queryByRole('button', { name: /Send inquiry/ })).not.toBeInTheDocument()
})

test('a concurrent inquiry edit retains local text and requires explicit reconciliation', async () => {
  const user = userEvent.setup()
  let saved = view({ selections: [venue], inquiry: { id: 'inquiry-a', revision: 1, status: 'draft', venue,
    recipient: '', contactSourceUrl: null, subject: 'Event inquiry', text: 'Original inquiry',
    contextMessageIds: ['m1'], updatedAt: '2026-11-08T10:00:00Z' } })
  let writes = 0
  http(request => {
    if (request.method === 'GET') return Response.json(saved)
    writes++
    saved = { ...saved, version: 3, inquiry: { ...saved.inquiry!, revision: 2, text: 'Saved by another tab' } }
    return Response.json({ errorCode: 'stale_version' }, { status: 409 })
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  const message = await screen.findByRole('textbox', { name: 'Inquiry message' })
  await user.type(message, ' with my changes')
  await user.click(screen.getByRole('button', { name: 'Save inquiry draft' }))
  expect(await screen.findByText(/Another update changed the saved draft/)).toBeVisible()
  expect(message).toHaveValue('Original inquiry with my changes')
  expect(screen.getByRole('button', { name: 'Save inquiry draft' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Load saved draft and discard my edits' }))
  expect(message).toHaveValue('Saved by another tab')
  expect(writes).toBe(1)
})

test('sending requires approval of the saved draft and locks the accepted message', async () => {
  const user = userEvent.setup()
  let saved = view({ selections: [venue], canSendInquiry: true, inquiry: { id: 'inquiry-a', revision: 1, status: 'draft', venue,
    recipient: 'venue@example.com', contactSourceUrl: null, subject: 'Event inquiry', text: 'Please confirm the price.',
    contextMessageIds: ['m1'], updatedAt: '2026-11-08T10:00:00Z' } })
  const commands: unknown[] = []
  http(async request => {
    if (request.method === 'GET') return Response.json(saved)
    const command = await request.json(); commands.push(command)
    saved = { ...saved, version: 3, inquiry: { ...saved.inquiry!, delivery: {
      status: 'accepted', requestId: command.requestId, draftRevision: 1, approvedAt: '2026-11-08T10:00:00Z',
      expiresAt: 1800000000000, messageId: 'mail-1', threadId: 'thread-1', acceptedAt: '2026-11-08T10:00:01Z',
    } } }
    return Response.json(saved)
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  const send = await screen.findByRole('button', { name: 'Approve and send inquiry' })
  expect(send).toBeDisabled()
  await user.click(screen.getByRole('checkbox', { name: /I approve sending this saved message/ }))
  await user.click(send)
  expect(await screen.findByText(/Email provider accepted your inquiry/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Approve and send inquiry' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Inquiry message' })).toHaveAttribute('readonly')
  expect(commands).toEqual([{ kind: 'send_inquiry', requestId: expect.any(String), expectedVersion: 1, inquiryId: 'inquiry-a', expectedDraftRevision: 1 }])
})

test('a reloaded pending inquiry checks saved status without resending', async () => {
  let reads = 0
  http(request => {
    expect(request.method).toBe('GET')
    reads++
    return Response.json(view({ selections: [venue], canSendInquiry: true, inquiry: {
      id: 'inquiry-a', revision: 1, status: 'draft', venue, recipient: 'venue@example.com', contactSourceUrl: null,
      subject: 'Inquiry', text: 'Please confirm the date.', contextMessageIds: ['m1'], updatedAt: '2026-11-08T10:00:00Z',
      delivery: { status: reads === 1 ? 'pending' : 'accepted', requestId: 'send-once', draftRevision: 1,
        approvedAt: '2026-11-08T10:00:00Z', expiresAt: 1800000000000,
        ...(reads > 1 ? { messageId: 'mail-1', threadId: 'thread-1', acceptedAt: '2026-11-08T10:00:01Z' } : {}),
      },
    } }))
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  expect(await screen.findByText('Submitting your approved inquiry.')).toBeVisible()
  expect(await screen.findByText(/Email provider accepted your inquiry/, {}, { timeout: 3500 })).toBeVisible()
  expect(reads).toBe(2)
})

test('restores the saved plan first and retains it when an explicit research refresh fails', async () => {
  const paths: string[] = []
  http(request => {
    const url = new URL(request.url)
    paths.push(url.pathname + url.search)
    return url.searchParams.get('saved') === '1' ? Response.json(view({ selections: [venue] }))
      : Response.json({ errorCode: 'provider_unavailable' }, { status: 503 })
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  expect(await screen.findByRole('button', { name: 'Prepare venue inquiry' })).toBeVisible()
  expect(paths).toEqual(['/api/planning/plan-a?saved=1'])
  await userEvent.click(screen.getByRole('button', { name: 'Check for research updates' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your plan')
  expect(screen.getByRole('heading', { name: 'Garden room' })).toBeVisible()
  expect(paths).toEqual(['/api/planning/plan-a?saved=1', '/api/planning/plan-a'])
})

test('checking venue replies reads saved state without refreshing research or sending mail', async () => {
  const paths: string[] = []
  http(request => {
    expect(request.method).toBe('GET')
    paths.push(new URL(request.url).search)
    return Response.json(view({ inquiry: { id: 'inquiry-a', revision: 1, status: 'draft', venue,
      recipient: 'venue@example.com', contactSourceUrl: null, subject: 'Inquiry', text: 'Please confirm.',
      contextMessageIds: ['m1'], updatedAt: '2026-11-08T10:00:00Z', delivery: { status: 'accepted', requestId: 'send',
        draftRevision: 1, approvedAt: '2026-11-08T10:00:00Z', expiresAt: 0, messageId: 'mail' },
    } }))
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  await userEvent.click(await screen.findByRole('button', { name: 'Check for venue replies' }))
  expect(paths).toEqual(['?saved=1', '?saved=1'])
})

test('a controlled accepted inquiry does not claim that real email was sent', async () => {
  http(() => Response.json(view({ inquiry: { id: 'inquiry-a', revision: 1, status: 'draft', venue,
    recipient: 'venue@example.com', contactSourceUrl: null, subject: 'Test inquiry', text: 'Controlled test only.',
    contextMessageIds: ['m1'], updatedAt: '2026-11-08T10:00:00Z', delivery: { status: 'accepted', mode: 'simulated', requestId: 'send',
      draftRevision: 1, approvedAt: '2026-11-08T10:00:00Z', expiresAt: 0, messageId: 'fixture-mail' },
  } })))
  render(<ConnectedPlanningPage id="plan-a" />)
  expect(await screen.findByText('Controlled test inquiry. No real email was sent.')).toBeVisible()
  expect(screen.queryByText(/Email provider accepted your inquiry/)).not.toBeInTheDocument()
})

test('checks uncertain email status using reads without resending the inquiry or refreshing research', async () => {
  const paths: string[] = []
  http(request => {
    expect(request.method).toBe('GET')
    const query = new URL(request.url).search
    paths.push(query)
    return Response.json(view({ inquiry: { id: 'inquiry-a', revision: 1, status: 'draft', venue,
      recipient: 'venue@example.com', contactSourceUrl: null, subject: 'Inquiry', text: 'Please confirm.',
      contextMessageIds: ['m1'], updatedAt: '2026-11-08T10:00:00Z', delivery: {
        status: query === '?mail=1' ? 'accepted' : 'uncertain', requestId: 'send', draftRevision: 1,
        approvedAt: '2026-11-08T10:00:00Z', expiresAt: 0,
        ...(query === '?mail=1' ? { messageId: 'mail', acceptedAt: '2026-11-08T10:01:00Z' } : {}),
      },
    } }))
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  await userEvent.click(await screen.findByRole('button', { name: 'Check send status' }))
  expect(await screen.findByText(/Email provider accepted your inquiry/)).toBeVisible()
  expect(paths).toEqual(['?saved=1', '?mail=1'])
  expect(screen.queryByRole('button', { name: 'Approve and send inquiry' })).not.toBeInTheDocument()
})

test('research loading does not hide an existing inquiry delivery status', async () => {
  http(() => Response.json(view({ status: 'working', proposal: null, inquiry: {
    id: 'inquiry-a', revision: 1, status: 'draft', venue, recipient: 'venue@example.com', contactSourceUrl: null,
    subject: 'Inquiry', text: 'Please confirm.', contextMessageIds: ['m1'], updatedAt: '2026-11-08T10:00:00Z',
    delivery: { status: 'uncertain', requestId: 'send', draftRevision: 1, approvedAt: '2026-11-08T10:00:00Z', expiresAt: 0 },
  } })))
  render(<ConnectedPlanningPage id="plan-a" />)
  expect(await screen.findByText(/We could not confirm whether this inquiry was sent/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Check send status' })).toBeEnabled()
})

test('source images and credit arrive without delaying venue selection and survive choosing the venue', async () => {
  let resolveImages!: (response: Response) => void
  let saved = view()
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).endsWith('/images')) return new Promise<Response>(resolve => { resolveImages = resolve })
    if (init?.method === 'POST') saved = view({ version: 2, selections: [venue] })
    return Promise.resolve(Response.json(saved))
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  expect(await screen.findByRole('button', { name: 'Choose Garden room' })).toBeEnabled()
  expect(screen.getByText('Photo not available')).toBeVisible()
  await act(async () => resolveImages(Response.json({ conversationId: 'plan-a', optionId: 'venue-a', version: 1,
    status: 'available', images: [{ url: 'https://example.com/room.jpg', sourcePage: venue.url,
      attribution: { text: 'Garden room', url: venue.url }, provider: 'source-page', evidence: 'page-metadata', description: null }] })))
  expect(await screen.findByRole('img', { name: 'Garden room' })).toHaveAttribute('src', 'https://example.com/room.jpg')
  expect(screen.getByRole('link', { name: 'Photo source: Garden room' })).toHaveAttribute('href', venue.url)
  await userEvent.click(screen.getByRole('button', { name: 'Choose Garden room' }))
  expect(await screen.findByRole('button', { name: 'Remove Garden room' })).toBeVisible()
  expect(screen.getByRole('img', { name: 'Garden room' })).toHaveAttribute('src', 'https://example.com/room.jpg')
  expect(screen.getByRole('link', { name: 'Photo source: Garden room' })).toBeVisible()
})

test('exhausted photo reads offer an explicit retry without sending a planning command', async () => {
  vi.useFakeTimers()
  let recovered = false
  const methods: string[] = []
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    methods.push(init?.method ?? 'GET')
    if (!String(input).endsWith('/images')) return Response.json(view())
    if (!recovered) return new Response('', { status: 503 })
    return Response.json({ conversationId: 'plan-a', optionId: 'venue-a', version: 1, status: 'available', images: [{
      url: 'https://example.com/room.jpg', sourcePage: venue.url, attribution: { text: venue.name, url: venue.url },
      provider: 'source-page', evidence: 'page-metadata', description: null,
    }] })
  })
  render(<ConnectedPlanningPage id="plan-a" />)
  await act(async () => {})
  expect(screen.getByRole('button', { name: 'Choose Garden room' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Retry photos' })).not.toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  recovered = true
  fireEvent.click(screen.getByRole('button', { name: 'Retry photos' }))
  await act(async () => {})
  expect(screen.getByRole('img', { name: 'Garden room' })).toHaveAttribute('src', 'https://example.com/room.jpg')
  expect(screen.queryByRole('button', { name: 'Retry photos' })).not.toBeInTheDocument()
  expect(methods.every(method => method === 'GET')).toBe(true)
})

test.each(['pending', 'uncertain', 'accepted', 'failed'] as const)('existing %s inquiry prevents a competing arrangement request', async status => {
  http(() => Response.json(view({ canArrange: true, selections: [venue], inquiry: {
    id: 'inquiry-a', revision: 1, status: 'draft', venue, recipient: 'venue@example.com', contactSourceUrl: null,
    subject: 'Inquiry', text: 'Please confirm.', contextMessageIds: ['m1'], updatedAt: '2026-11-08T10:00:00Z',
    delivery: { status, requestId: 'send', draftRevision: 1, approvedAt: '2026-11-08T10:00:00Z', expiresAt: 0 },
  } })))
  render(<ConnectedPlanningPage id="plan-a" />)
  const email = await screen.findByRole('textbox', { name: 'Send my arrangement updates to' })
  await userEvent.type(email, 'customer@example.com')
  expect(screen.getByRole('button', { name: 'Please arrange this' })).toBeDisabled()
  expect(screen.getByText('An inquiry already exists for this plan. Check its status below before arranging anything else.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Check for venue replies' })).toBeEnabled()
  if (status === 'uncertain') {
    const recovery = screen.getByRole('region', { name: 'Inquiry send status' })
    expect(within(recovery).getByText(/Check the saved send status before making another request/)).toBeVisible()
    expect(within(recovery).getByRole('button', { name: 'Check send status' })).toBeEnabled()
  }
})
