import { expect, it } from 'vitest'
import { extractVenueImages } from './venue-images'
const source = 'https://harborloft.example.com/gallery'
const img = (n: number) => `<img src="/room-${n}.jpg" alt="Harbor Loft interior ${n}">`
it('returns at most four distinct venue images, with evidence and source links', () => {
  const html = `<title>Harbor Loft gallery</title>${img(1)}${img(1)}${img(2)}${img(3)}${img(4)}${img(5)}<img src="/logo.jpg" alt="Harbor Loft logo"><img src="/other.jpg" alt="Another restaurant">`
  const images = extractVenueImages(html, source, 'Harbor Loft')
  expect(images).toHaveLength(4)
  expect(images.map(x => x.url)).toEqual([1, 2, 3, 4].map(n => `https://harborloft.example.com/room-${n}.jpg`))
  expect(images[0]).toMatchObject({ sourcePage: source, provider: 'source-page', attribution: { text: 'Harbor Loft', url: source } })
})
it('rejects unrelated pages, logos and unsafe image URLs', () => {
  expect(extractVenueImages(`<title>Other venue</title>${img(1)}`, source, 'Harbor Loft')).toEqual([])
  expect(extractVenueImages('<title>Harbor Loft</title><meta property="og:image" content="http://127.0.0.1/logo.png">', source, 'Harbor Loft')).toEqual([])
})
it('handles structured venue images and decoded metadata', () => {
  const html = `<script type="application/ld+json">{"@type":"EventVenue","name":"Harbor Loft","image":["/room.jpg"]}</script><meta property="og:title" content="Harbor Loft"><meta property="og:image" content="/room.jpg"><meta property="og:image" content="/room2.jpg?a=1&amp;b=2">`
  expect(extractVenueImages(html, source, 'Harbor Loft').map(x => x.url)).toEqual(['https://harborloft.example.com/room.jpg', 'https://harborloft.example.com/room2.jpg?a=1&b=2'])
})
it('does not inherit directory preview images from a matching nested venue', () => {
  const html = `<title>Top ten city venues</title><script type="application/ld+json">{"@graph":[{"@type":"EventVenue","name":"Harbor Loft","image":"/room.jpg"}]}</script><meta property="og:image" content="/other-venue.jpg">`
  expect(extractVenueImages(html, source, 'Harbor Loft').map(x => x.url)).toEqual(['https://harborloft.example.com/room.jpg'])
})
