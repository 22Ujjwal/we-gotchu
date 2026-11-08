import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { Photo } from '#/components/hostwell/ui'

// Harness smoke: uses an existing component without changing its implementation.
// The journey owners add controlled-API screen coverage alongside their screens.
const photos = ['/venue-one.jpg', '/venue-two.jpg']

test('renders existing JSX and advances the venue gallery with a user interaction', async () => {
  const user = userEvent.setup()
  render(<Photo photos={photos} alt="Venue" />)
  expect(screen.getByRole('img', { name: 'Venue, photo 1 of 2' })).toHaveAttribute('src', photos[0])
  await user.click(screen.getByRole('button', { name: 'Next photo' }))
  expect(screen.getByRole('img', { name: 'Venue, photo 2 of 2' })).toHaveAttribute('src', photos[1])
})

test('renders a fresh gallery and wraps backwards from its first photo', async () => {
  const user = userEvent.setup()
  render(<Photo photos={photos} alt="Venue" />)
  await user.click(screen.getByRole('button', { name: 'Previous photo' }))
  expect(screen.getByRole('img', { name: 'Venue, photo 2 of 2' })).toHaveAttribute('src', photos[1])
})
