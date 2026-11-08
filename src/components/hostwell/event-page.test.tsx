import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
