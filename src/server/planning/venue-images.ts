import { parse } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'
import { sourceUrl } from './image-source'

type Element = DefaultTreeAdapterMap['element']
type Node = DefaultTreeAdapterMap['node']
export type VenueImage = {
  url: string
  sourcePage: string
  provider: 'source-page'
  attribution: { text: string; url: string }
  evidence: 'caption' | 'structured-data' | 'page-metadata'
  description: string | null
}
const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
function matches(value: string, name: string): boolean {
  const words = normalize(name).split(' ').filter(word => !['the', 'at', 'and'].includes(word))
  const candidate = ` ${normalize(value)} `
  return words.length > 0 && words.some(word => word.length >= 4) && words.every(word => candidate.includes(` ${word} `))
}
const unwanted = /logo|icon|banner|avatar|sprite|placeholder|floor.?plan|template|menu|sponsor/i
const room = /interior|room|hall|space|terrace|rooftop|mezzanine|seating|patio|main floor/i

/** Conservative extraction only: this does not assert availability or identify interior content visually. */
export function extractVenueImages(html: string, source: string, venueName: string): VenueImage[] {
  const base = sourceUrl(source)
  const nodes: Node[] = [parse(html)]
  const elements: Element[] = []
  for (let index = 0; index < nodes.length && index < 20_000; index++) {
    const node = nodes[index]
    if ('tagName' in node) elements.push(node)
    if ('childNodes' in node) nodes.push(...node.childNodes)
  }
  const attrs = (node: Element) => Object.fromEntries(node.attrs.map(a => [a.name, a.value]))
  const text = (node: Element) => node.childNodes.filter(n => n.nodeName === '#text').map(n => (n as DefaultTreeAdapterMap['textNode']).value).join('')
  const metadata = elements.filter(e => e.tagName === 'meta').map(attrs)
  const titles = [...elements.filter(e => e.tagName === 'title').map(text), ...metadata.filter(a => ['og:title', 'og:site_name'].includes(a.property)).map(a => a.content ?? '')]
  const candidates: Array<{ url: string; evidence: VenueImage['evidence']; description: string | null; rank: number }> = []
  const pageIdentified = titles.some(title => matches(title, venueName))
  let identified = pageIdentified
  // Only image fields belonging to the named business, not arbitrary nested article/product objects.
  const inspect = (value: unknown, depth = 0): void => {
    if (depth > 8 || !value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.slice(0, 100).forEach(v => inspect(v, depth + 1)); return }
    const data = value as Record<string, unknown>
    const types = Array.isArray(data['@type']) ? data['@type'] : [data['@type']]
    if (typeof data.name === 'string' && matches(data.name, venueName) && types.some(t => ['EventVenue', 'LocalBusiness', 'Restaurant', 'Hotel', 'BarOrPub', 'CivicStructure'].includes(String(t)))) {
      identified = true
      const images = Array.isArray(data.image) ? data.image : [data.image]
      for (const image of images.slice(0, 20)) {
        const record = image && typeof image === 'object' ? image as Record<string, unknown> : null
        const url = typeof image === 'string' ? image : record?.contentUrl ?? record?.url
        if (typeof url === 'string') candidates.push({ url, evidence: 'structured-data', description: typeof record?.caption === 'string' ? record.caption : null, rank: 1 })
      }
    }
    if (data['@graph']) inspect(data['@graph'], depth + 1)
  }
  for (const script of elements.filter(e => e.tagName === 'script' && attrs(e).type === 'application/ld+json')) {
    try { inspect(JSON.parse(text(script))) } catch { /* malformed metadata is not fatal */ }
  }
  if (!identified) return []
  for (const element of elements.filter(e => e.tagName === 'img')) {
    const a = attrs(element)
    if (matches(a.alt ?? '', venueName) && room.test(a.alt ?? '') && !(Number(a.width) > 0 && Number(a.width) < 300) && !(Number(a.height) > 0 && Number(a.height) < 180)) {
      candidates.push({ url: a['data-src'] || a.src || '', evidence: 'caption', description: a.alt, rank: 0 })
    }
  }
  for (const meta of metadata.filter(a => pageIdentified && a.property === 'og:image')) {
    candidates.push({ url: meta.content ?? '', evidence: 'page-metadata', description: null, rank: 2 })
  }
  const seen = new Set<string>()
  const images: VenueImage[] = []
  for (const candidate of candidates.sort((a, b) => a.rank - b.rank)) {
    try {
      if (!candidate.url || unwanted.test(decodeURIComponent(candidate.url) + ' ' + (candidate.description ?? ''))) continue
      const url = sourceUrl(new URL(candidate.url, base).href)
      if (/\.(?:svg|gif|ico)(?:$|\?)/i.test(url.href)) continue
      // Query-based resized crops count as one image; retain the first original URL.
      const identity = url.origin + url.pathname
      if (seen.has(identity)) continue
      seen.add(identity)
      images.push({ url: url.href, sourcePage: base.href, provider: 'source-page', attribution: { text: venueName, url: base.href }, evidence: candidate.evidence, description: candidate.description })
      if (images.length === 4) break
    } catch { /* malformed or unsafe candidate */ }
  }
  return images
}
