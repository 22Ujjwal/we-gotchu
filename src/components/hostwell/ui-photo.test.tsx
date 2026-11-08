import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { Photo } from './ui'

const photos = ['https://example.com/one.jpg', 'https://example.com/two.jpg', 'https://example.com/three.jpg', 'https://example.com/four.jpg']

test('a failed asset is skipped and remaining photos stay navigable', async () => {
  render(<Photo photos={photos} alt="Garden room" />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img')).toHaveAttribute('src', photos[1])
  await userEvent.click(screen.getByRole('button', { name: 'Previous photo' }))
  expect(screen.getByRole('img')).toHaveAttribute('src', photos[3])
  screen.getByRole('button', { name: 'Next photo' }).focus()
  await userEvent.keyboard('{Enter}')
  expect(screen.getByRole('img')).toHaveAttribute('src', photos[1])
})

test('all failed assets show readable fallback and remove broken images and arrows', () => {
  render(<Photo photos={photos.slice(0, 2)} alt="Garden room" />)
  fireEvent.error(screen.getByRole('img'))
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText('Photo unavailable')).toBeVisible()
  expect(document.querySelector('img')).toBeNull()
  expect(screen.queryByRole('button', { name: /photo/ })).not.toBeInTheDocument()
})

test('changing from the fourth photo to a single new source resets the current image', async () => {
  const page = render(<Photo photos={photos} alt="Garden room" />)
  for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole('button', { name: 'Next photo' }))
  expect(screen.getByRole('img')).toHaveAttribute('src', photos[3])
  page.rerender(<Photo photos={['https://example.com/new.jpg']} alt="New room" />)
  expect(screen.getByRole('img', { name: 'New room' })).toHaveAttribute('src', 'https://example.com/new.jpg')
  expect(screen.queryByRole('button', { name: /photo/ })).not.toBeInTheDocument()
})

test('equal fresh source arrays preserve navigation and failed-source state', async () => {
  const page = render(<Photo photos={[...photos]} alt="Garden room" />)
  fireEvent.error(screen.getByRole('img'))
  await userEvent.click(screen.getByRole('button', { name: 'Next photo' }))
  page.rerender(<Photo photos={[...photos]} alt="Garden room" />)
  expect(screen.getByRole('img')).toHaveAttribute('src', photos[2])
  await userEvent.click(screen.getByRole('button', { name: 'Previous photo' }))
  expect(screen.getByRole('img')).toHaveAttribute('src', photos[1])
})

test('new sources recover from an exhausted image list', () => {
  const page = render(<Photo photos={[photos[0]]} alt="Garden room" />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText('Photo unavailable')).toBeVisible()
  page.rerender(<Photo photos={[photos[1]]} alt="Garden room" />)
  expect(screen.getByRole('img')).toHaveAttribute('src', photos[1])
})

test('inspiration is labeled and ordered, while real venue photos take precedence', async () => {
  const fallback = { photos: ['/images/interior-inspiration/01.jpg', '/images/interior-inspiration/02.jpg'], alt: 'Interior inspiration', label: 'Interior inspiration, not this venue', href: '/images/interior-inspiration/credits.html' }
  const page = render(<Photo photos={[photos[0]]} alt="Garden room" fallback={fallback} />)
  expect(screen.getByRole('img')).toHaveAttribute('src', photos[0])
  expect(screen.queryByText(fallback.label)).not.toBeInTheDocument()
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('img')).toHaveAttribute('src', fallback.photos[0])
  expect(screen.getByRole('img')).toHaveAttribute('alt', expect.stringContaining('Interior inspiration'))
  expect(screen.getByRole('link', { name: fallback.label })).toHaveAttribute('href', fallback.href)
  await userEvent.click(screen.getByRole('button', { name: 'Next photo' }))
  expect(screen.getByRole('img')).toHaveAttribute('src', fallback.photos[1])
  await userEvent.click(screen.getByRole('button', { name: 'Next photo' }))
  expect(screen.getByRole('img')).toHaveAttribute('src', fallback.photos[0])
  page.rerender(<Photo photos={[photos[1]]} alt="Garden room" fallback={fallback} />)
  expect(screen.getByRole('img')).toHaveAttribute('src', photos[1])
  expect(screen.queryByText(fallback.label)).not.toBeInTheDocument()
})
