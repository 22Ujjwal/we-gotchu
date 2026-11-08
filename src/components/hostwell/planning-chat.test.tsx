import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  vi.mocked(fetch).mockImplementation((input, init) => Promise.resolve(handle(new Request(new URL(String(input), 'http://localhost'), init))))
}
beforeEach(() => { auth.user = { id: 'customer-a' }; auth.isLoaded = true })

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
  expect(screen.getAllByText('USD 200')[0]).toBeVisible()
  expect(screen.getAllByRole('link', { name: 'Published source' })[0]).toHaveAttribute('href', 'https://example.com/rates')
  await user.click(screen.getByRole('button', { name: 'Select Garden room' }))
  expect(await screen.findByRole('button', { name: 'Remove Garden room' })).toHaveAttribute('aria-pressed', 'true')
  await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Keep the room, reduce supply cost.')
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
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'My change' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Review the latest')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled())
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('My change')
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
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Cheaper please' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Cheaper please')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  expect(commands).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Check saved status' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
  expect(commands).toHaveLength(1)
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Cheaper please')
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
  expect(fetch).toHaveBeenCalledTimes(1)
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
  for (const name of ['Garden room', 'Paper plates', 'Candles', 'Dining hall']) {
    fireEvent.click(screen.getByRole('button', { name: `Select ${name}` }))
    await screen.findByRole('button', { name: `Remove ${name}` })
  }
  expect(screen.getByRole('button', { name: 'Select Garden room' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Remove Paper plates' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Remove Candles' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Remove Dining hall' }))
  await screen.findByRole('button', { name: 'Select Dining hall' })
  expect(commands).toHaveLength(5)
})

for (const status of ['ready', 'failed', 'uncertain'] as const) {
  test(`automatic reads stop at ${status}`, async () => {
    vi.useFakeTimers()
    http(() => Response.json(view({ status, error: 'private_provider_session_id' })))
    render(<ConnectedPlanningPage id="plan-a" />)
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(fetch).toHaveBeenCalledTimes(1)
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
