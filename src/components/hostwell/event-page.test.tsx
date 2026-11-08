import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { planReadyEvent } from '../../contracts/fixtures'
import { EventPage } from './event-page'

test('revision conflicts keep unsent structured edits visible', async () => {
  const view = structuredClone(planReadyEvent)
  view.plan = null
  view.event.status = 'researched'
  vi.mocked(fetch).mockImplementation(async (_url, init) => init?.method === 'PATCH'
    ? Response.json({ errorCode: 'stale_brief', message: 'The brief changed. Review the latest answers.' }, { status: 409 })
    : Response.json(view))
  render(<EventPage eventId={view.event.eventId} identity="alice" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit brief' }))
  fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'Oakland, CA' } })
  fireEvent.click(screen.getByRole('button', { name: 'Update brief' }))
  await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
  expect(screen.getByLabelText('Area')).toHaveValue('Oakland, CA')
  const write = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')!
  expect(JSON.parse(String(write[1]!.body))).toEqual({ expectedBriefRevision: 1, changes: { location: 'Oakland, CA' } })
})

test('signed out event screen hides event data and returns to the canonical event after sign in', () => {
  render(<EventPage eventId="event-private" identity={null} />)
  expect(screen.getByRole('link', { name: 'Sign in to view your event' })).toHaveAttribute('href', '/sign-in?redirect_url=%2Fevents%2Fevent-private')
  expect(fetch).not.toHaveBeenCalled()
})

test('unsupported saved timezone reports an edit error without losing the event view', async () => {
  const view = structuredClone(planReadyEvent)
  view.event.brief.timezone = 'Unsupported/Timezone'
  vi.mocked(fetch).mockResolvedValue(Response.json(view))
  render(<EventPage eventId={view.event.eventId} identity="alice" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit brief' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('timezone')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(view.event.brief.eventType)
})
test('an open editor keeps its original revision after polling loads another tab changes', async () => {
  vi.useFakeTimers()
  try {
    const first = structuredClone(planReadyEvent)
    first.plan = null
    first.event.status = 'researching'
    first.run!.state = 'running'
    const newer = structuredClone(first)
    newer.event.briefRevision = 2
    newer.run!.briefRevision = 2
    newer.event.brief.location = 'Berkeley, CA'
    newer.event.brief.headcount = 80
    let reads = 0
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body))
        return body.expectedBriefRevision === 1
          ? Response.json({ errorCode: 'stale_brief', message: 'Review the latest answers.' }, { status: 409 })
          : Response.json(newer)
      }
      return Response.json(reads++ === 0 ? first : newer)
    })
    render(<EventPage eventId={first.event.eventId} identity="alice" />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Edit brief' }))
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'Oakland, CA' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(reads).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Edit brief' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update brief' }))
    await act(async () => {})
    const write = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(String(write[1]!.body))).toEqual({ expectedBriefRevision: 1, changes: { location: 'Oakland, CA' } })
    expect(screen.getByLabelText('Area')).toHaveValue('Oakland, CA')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    fireEvent.click(screen.getByRole('button', { name: 'Update brief' }))
    await act(async () => {})
    const writes = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH')
    expect(writes).toHaveLength(2)
    expect(JSON.parse(String(writes[1][1]!.body)).expectedBriefRevision).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Apply my edits to the latest revision' }))
    expect(screen.getByLabelText('Area')).toHaveValue('Oakland, CA')
    fireEvent.click(screen.getByRole('button', { name: 'Update brief' }))
    await act(async () => {})
    const accepted = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH')[2]
    expect(JSON.parse(String(accepted[1]!.body))).toEqual({ expectedBriefRevision: 2, changes: { location: 'Oakland, CA' } })
    expect(screen.queryByRole('region', { name: 'Edit event brief' })).not.toBeInTheDocument()
  } finally { vi.useRealTimers() }
})

test('saving an unchanged brief closes the editor without restarting research', async () => {
  vi.mocked(fetch).mockImplementation(async () => Response.json(planReadyEvent))
  render(<EventPage eventId={planReadyEvent.event.eventId} identity="alice" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit brief' }))
  fireEvent.click(screen.getByRole('button', { name: 'Update brief' }))
  await act(async () => {})
  expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
  expect(screen.queryByRole('region', { name: 'Edit event brief' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Current plan' })).toBeInTheDocument()
})
