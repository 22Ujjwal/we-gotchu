import userEvent from '@testing-library/user-event'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { BriefIntake } from './brief-intake'
import { planReadyEvent } from '../../contracts/fixtures'

async function fill() {
  for (const [label, value] of Object.entries({ Occasion: 'Birthday', 'Number of guests': '24' })) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  for (const [label, value] of Object.entries({ Date: '2026-12-12', 'Start time': '19:00+01:00', Timezone: 'Europe/Berlin', Area: 'Berlin' })) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  for (const [label, value] of Object.entries({ Budget: '900', Currency: 'EUR', 'Acceptable cancellation loss': '10' })) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.change(screen.getByLabelText('What you need'), { target: { value: 'candles' } })
}

test('creates from entered answers and navigates only with the returned event identity', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(planReadyEvent))
  const created = vi.fn()
  render(<BriefIntake identity="alice" onCreated={created} />)
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Find venues' }))
  await waitFor(() => expect(created).toHaveBeenCalledWith(planReadyEvent.event.eventId))
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toMatchObject({ location: 'Berlin',
    startsAt: '2026-12-12T18:00:00.000Z', budget: 90000, headcount: 24, currency: 'eur' })
})

test('an uncertain create preserves answers and prevents duplicate submission', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('connection lost'))
  render(<BriefIntake identity="alice" onCreated={vi.fn()} />)
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Find venues' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Creation outcome is unknown. Your event may already exist. Do not submit again or reload to retry. Contact support to locate it.')
  expect(screen.getByLabelText('What you need')).toHaveValue('candles')
  expect(screen.getByRole('button', { name: 'Find venues' })).toBeDisabled()
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('signed out intake does not submit and offers sign in', () => {
  render(<BriefIntake identity={null} onCreated={vi.fn()} />)
  expect(screen.getByRole('link', { name: 'Sign in to plan your event' })).toHaveAttribute('href', expect.stringContaining('/sign-in'))
  expect(fetch).not.toHaveBeenCalled()
})


test('keyboard submission moves focus to the next sentence', async () => {
  const user = userEvent.setup()
  render(<BriefIntake identity="alice" onCreated={vi.fn()} />)
  await user.click(screen.getByLabelText('Occasion'))
  await user.type(screen.getByLabelText('Occasion'), 'Birthday')
  await user.type(screen.getByLabelText('Number of guests'), '24{Enter}')
  expect(screen.getByLabelText('Date')).toHaveFocus()
})
test.each(['{"event":', '{}'])('a malformed successful create response locks submission: %s', async body => {
  vi.mocked(fetch).mockResolvedValue(new Response(body, { status: 201 }))
  const created = vi.fn()
  render(<BriefIntake identity="alice" onCreated={created} />)
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Find venues' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Creation outcome is unknown. Your event may already exist. Do not submit again or reload to retry. Contact support to locate it.')
  expect(screen.getByRole('button', { name: 'Find venues' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Find venues' }))
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(created).not.toHaveBeenCalled()
})
