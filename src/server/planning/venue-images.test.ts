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

const decoratedPearl = 'The Pearl — San Francisco (budget mismatch on published rates)'
const pearlCaption = '<img src="/rooftop.jpg" alt="Rooftop at The Pearl San Francisco">'
it.each([decoratedPearl, 'The Pearl — San Francisco'])('accepts only independently corroborated room captions for %s', name => {
  const html = `<title>Pearl Brochure &amp; Rates</title>${pearlCaption}<meta property="og:image" content="/unrelated.jpg"><img src="/generic.jpg" alt="Another business rooftop">`
  expect(extractVenueImages(html, source, name)).toEqual([expect.objectContaining({
    url: 'https://harborloft.example.com/rooftop.jpg', evidence: 'caption', attribution: { text: name, url: source },
  })])
})
it('uses caption location evidence for business-matched room photos on the same page without accepting templates', () => {
  const html = '<title>Pearl Brochure &amp; Rates</title><img src="/Rooftop%20Template.png" alt="Rooftop at The Pearl San Francisco"><img src="/photo.jpg" alt="The rooftop of the Pearl with seating"><img src="/other.jpg" alt="Another business rooftop"><meta property="og:image" content="/unrelated.jpg">'
  expect(extractVenueImages(html, source, decoratedPearl).map(image => image.url)).toEqual(['https://harborloft.example.com/photo.jpg'])
  expect(extractVenueImages(html.replace('San Francisco', 'Oakland'), source, decoratedPearl)).toEqual([])
})
it.each([
  '<title>Pearl Brochure &amp; Rates</title><img src="/room.jpg" alt="The Pearl rooftop in Oakland">',
  `<title>Other venue</title>${pearlCaption}`,
  `<title>Top ten city venues</title>${pearlCaption}`,
  '<title>Pearl Brochure &amp; Rates</title><meta property="og:image" content="/room.jpg">',
  '<title>Pearl Brochure &amp; Rates</title><img src="/room.jpg" alt="The Pearl San Francisco logo">',
  '<title>Pearl Brochure &amp; Rates</title><img src="/Rooftop%20Template.png" alt="Rooftop at The Pearl San Francisco">',
  '<title>Pearl Brochure &amp; Rates</title><img src="http://127.0.0.1/room.jpg" alt="The Pearl San Francisco rooftop">',
])('keeps decorated-name fallback closed without safe caption and page evidence', html => {
  expect(extractVenueImages(html, source, decoratedPearl)).toEqual([])
})
it('does not strip parentheses from an undecorated business name', () => {
  expect(extractVenueImages(`<title>Pearl Brochure &amp; Rates</title>${pearlCaption}`, source,
    'The Pearl (San Francisco)')).toEqual([])
})
