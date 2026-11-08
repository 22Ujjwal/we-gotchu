import { z } from 'zod'
import { Candidate, type ResearchInput } from '../contracts'
import type { Discovery, ResearchProviders } from '../agent/research'
import { pause } from '../agent/http'

const PRODUCT_TOOL = 'monid:channel3/v1/products/{product_id}'
const PAGE_TOOL = 'monid:context.dev/web/scrape/markdown'
const FIELDS = ['price', 'availability', 'capacity', 'cancellation', 'quantity', 'delivery']
const Run = z.object({
  runId: z.string().regex(/^[a-zA-Z0-9_-]+$/), status: z.string(), output: z.unknown().optional(),
  providerResponse: z.object({ httpStatus: z.number() }).nullish(),
})
const Product = z.object({
  id: z.string(), key_features: z.array(z.string().max(1000)).max(100).nullish(),
  offers: z.array(z.unknown()).max(100).nullish(), disclosure: z.string().max(2000).nullish(),
})
const Offer = z.object({
  url: z.string(), domain: z.string(),
  price: z.object({ price: z.number().finite().nonnegative(), currency: z.string() }),
  availability: z.string().max(100).nullish(),
})
const Page = z.object({
  success: z.literal(true), markdown: z.string().max(40_000), url: z.string(),
  metadata: z.object({ sourceUrl: z.string(), finalUrl: z.string(), canonicalUrl: z.string().nullish() }),
  cache_metadata: z.object({ age_ms: z.number().nonnegative().max(60_000) }),
})

// Only public HTTPS hostnames are sent to the managed scraper; it owns network resolution.
function publicUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname) ||
        /\.(local|localhost|internal|test|invalid)$/i.test(url.hostname)) return
    url.hash = ''
    return url
  } catch { return }
}
const host = (url: URL) => url.hostname.replace(/^www\./, '')
const sameSite = (a: URL, b: URL) => host(a) === host(b)
const sameOffer = (a: URL, b: URL) => a.origin === b.origin && a.pathname === b.pathname

// Reject oversized responses while streaming, before JSON parsing or storing supplier content.
async function request(fetcher: typeof fetch, key: string, signal: AbortSignal, url: string, body?: unknown) {
  const response = await fetcher(url, {
    method: body ? 'POST' : 'GET', signal, redirect: 'error',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok || !response.body) throw new Error('Detail transport failed')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.length
      if (bytes > 256_000) throw new Error('Detail response too large')
      chunks.push(chunk.value)
    }
  } finally { await reader.cancel() }
  const buffer = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
  return Run.parse(JSON.parse(new TextDecoder().decode(buffer)))
}

function productEvidence(candidate: Candidate, output: unknown, currency: string, sourceUrl: string) {
  const product = Product.parse(output)
  if (product.id !== candidate.supplierId) throw new Error('Product identity mismatch')
  const originals = candidate.sources.filter(s => s.stage === 'discovery' && s.tool === 'monid:channel3/v1/search')
    .map(s => publicUrl(s.url)).filter((url): url is URL => !!url)
  const offers = (product.offers ?? []).map(raw => Offer.safeParse(raw)).filter(parsed => parsed.success).map(parsed => parsed.data)
  // Do not transfer a different merchant's price onto the discovery offer.
  const matching = offers.filter(offer => {
    const url = publicUrl(offer.url)
    const merchant = publicUrl(`https://${offer.domain}`)
    return url && merchant && merchant.pathname === '/' && !merchant.search && originals.some(original => sameOffer(url, original) &&
        (url.hostname === 'buy.trychannel3.com'
          ? url.searchParams.get('o') === original.searchParams.get('o')
          : url.search === original.search)) &&
      (url.hostname === 'buy.trychannel3.com' ? url.pathname.startsWith(`/${product.id}-`) : sameSite(url, merchant))
  })
  const offer = matching.length === 1 ? matching[0] : undefined
  candidate.verification.listingPrice = { status: 'unknown', sourceUrl,
    note: 'No single identity-matched offer with a supported, compatible currency and exact minor-unit price was established.' }
  candidate.verification.packSize = { status: 'unknown', sourceUrl,
    note: 'No supported unambiguous pack statement was present in product key_features.' }
  if (offer && offer.price.currency.toLowerCase() === currency.toLowerCase() &&
      ['usd', 'cad', 'aud', 'gbp', 'eur', 'sek', 'czk', 'ron', 'chf'].includes(currency.toLowerCase())) {
    const minor = Math.round(offer.price.price * 100)
    if (Number.isSafeInteger(minor) && Math.abs(offer.price.price * 100 - minor) < 0.000001) {
      candidate.priceProvenance = 'supplier_listing'
      candidate.verification.listingPrice = { status: 'known', sourceUrl,
        note: `Retailer ${offer.domain} lists ${offer.price.price} ${offer.price.currency} for one offered product, ${minor} minor units. Not a delivered total or quote.` }
    }
  }
  if (offer?.availability) candidate.verification.listingStock = { status: 'known', sourceUrl,
    note: `Retailer listing reports ${offer.availability}; this does not confirm event-date availability or delivery.` }
  // Preserve the provider's exact pack statement, without interpreting arbitrary prose as quantities.
  const packs = (product.key_features ?? []).filter(text => /^Includes [1-9][0-9]{0,5} (plates|cups|napkins|pieces)\.?$/.test(text))
  const countsByUnit = new Map<string, Set<number>>()
  for (const statement of packs) {
    const [, count, unit] = statement.match(/^Includes ([0-9]+) (plates|cups|napkins|pieces)\.?$/)!
    const counts = countsByUnit.get(unit) ?? new Set<number>()
    counts.add(Number(count))
    countsByUnit.set(unit, counts)
  }
  const conflicting = [...countsByUnit.values()].some(counts => counts.size > 1)
  if (packs.length) candidate.verification.packSize = { status: conflicting ? 'conflict' : 'known', sourceUrl,
    note: `Product key_features: ${[...new Set(packs)].join('; ')}. Listing evidence only; required packs are not calculated.` }
  if (product.disclosure) candidate.affiliateDisclosure = [candidate.affiliateDisclosure, product.disclosure].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n')
}

function pageEvidence(candidate: Candidate, output: unknown, requested: URL, matchedFields: Set<string>): { final: URL; next?: URL } {
  const page = Page.parse(output)
  const urls = [page.url, page.metadata.sourceUrl, page.metadata.finalUrl, ...(page.metadata.canonicalUrl ? [page.metadata.canonicalUrl] : [])]
    .map(publicUrl)
  if (urls.some(url => !url || !sameSite(requested, url))) throw new Error('Page identity mismatch')
  if (urls.slice(0, 2).some(url => !sameOffer(requested, url!) || requested.search !== url!.search)) {
    throw new Error('Page request identity mismatch')
  }
  const final = urls[2]!
  const keywords: Record<string, RegExp> = {
    capacity: /\b(capacity|seated|standing|guests)\b/i,
    price: /\b(price|pricing|minimum|rental|rate|cost)\b|\$[0-9]/i,
    cancellation: /\b(cancel|cancellation|refund|nonrefundable)\b/i,
    delivery: /\b(delivery|shipping|pickup)\b/i,
  }
  for (const [field, pattern] of Object.entries(keywords)) {
    if (matchedFields.has(field)) continue
    const lines = page.markdown.split('\n').filter(line => pattern.test(line)).slice(0, 2)
    if (!lines.length) {
      candidate.verification[field] ??= { status: 'unknown' }
      if (!candidate.verification[field].note) candidate.verification[field] = { status: 'unknown', sourceUrl: final.href,
        note: 'No relevant statement was found in this checked page. Other pages or supplier contact may be required; no supplier was contacted.' }
      continue
    }
    // These are attributed excerpts, never verified booking terms or numerical capacity.
    matchedFields.add(field)
    const excerpt = lines.join(' ').slice(0, 500)
    candidate.verification[field] = { status: 'unknown', sourceUrl: final.href,
      note: `Unverified supplier-page excerpt: ${excerpt}. Requires review for this event; no supplier was contacted.` }
  }
  // One selected informational link, never forms, checkout, arbitrary crawl paths or off-site links.
  for (const match of page.markdown.matchAll(/\]\((https:\/\/[^\s)]+)\)/g)) {
    const next = publicUrl(match[1])
    if (next && sameSite(requested, next) && !next.search &&
        /^\/(about|packages|pricing|faq|cancellation-policy)\/?$/.test(next.pathname) && next.href !== final.href) return { final, next }
  }
  return { final }
}

export type DetailOptions = {
  apiKey: string
  fetch?: typeof fetch
  maxCandidates?: number
  maxPagesPerVenue?: number
  timeoutMs?: number
}

export function createDetailEnricher(options: DetailOptions): NonNullable<ResearchProviders['enrich']> {
  const fetcher = options.fetch ?? fetch
  const maxCandidates = options.maxCandidates ?? 2
  const maxPages = options.maxPagesPerVenue ?? 2
  const timeoutMs = options.timeoutMs ?? 25_000
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 6 ||
      !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 2 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('Invalid detail bounds')
  return async (input: ResearchInput, evidence: Discovery, signal: AbortSignal): Promise<Discovery> => {
    const result: Discovery = structuredClone(evidence)
    // Alternate kinds so venue discovery order cannot consume the entire detail budget.
    const venues = result.candidates.filter(c => c.kind === 'venue')
    const supplies = result.candidates.filter(c => c.kind === 'supply')
    const ordered = Array.from({ length: Math.max(venues.length, supplies.length) }, (_, i) => [venues[i], supplies[i]])
      .flat().filter((c): c is Candidate => !!c)
    let attemptedCandidates = 0
    for (const candidate of ordered) {
      const source = candidate.sources.find(s => s.stage === 'discovery') ?? candidate.sources[0]
      const tool = candidate.kind === 'supply' ? PRODUCT_TOOL : PAGE_TOOL
      const check = (url: string, outcome: 'ok' | 'failed' | 'absent', reason: string) => {
        result.sourceChecks.push({ candidateId: candidate.candidateId, tool, url, outcome,
          missingFields: [...FIELDS, ...(candidate.kind === 'supply' ? ['listingPrice', 'packSize'].filter(field => candidate.verification[field]?.status !== 'known') : [])], reason })
      }
      if (signal.aborted) {
        check(source.url, 'absent', 'Detail not attempted because its budget or research cancellation stopped investigation.')
        continue
      }
      const original = publicUrl(source.url)
      const productId = candidate.supplierId
      const trusted = candidate.kind === 'supply'
        ? source.tool === 'monid:channel3/v1/search' && productId && /^[a-zA-Z0-9_-]{1,200}$/.test(productId)
        : source.tool === 'monid:litescrape/google/maps' && original && !/(^|\.)(google\.com|maps\.google\.com)$/.test(original.hostname)
      if (!original || !trusted || source.stage !== 'discovery' || candidate.evidenceMode !== 'live') { check(source.url, 'absent', 'No supported supplier detail identity or public HTTPS source.'); continue }
      if (attemptedCandidates >= maxCandidates) {
        check(source.url, 'absent', 'Detail not attempted because the configured candidate limit was reached.')
        continue
      }
      attemptedCandidates++
      const matchedFields = new Set<string>()
      let target = candidate.kind === 'supply' ? new URL(`https://api.trychannel3.com/v1/products/${productId}`) : original
      for (let page = 0; page < (candidate.kind === 'supply' ? 1 : maxPages); page++) {
        if (signal.aborted) { check(target.href, 'absent', 'Detail not attempted because its budget or research cancellation stopped investigation.'); break }
        let runUrl: string | undefined
        const callSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        try {
          let run = await request(fetcher, options.apiKey, callSignal, 'https://api.monid.ai/v1/run', candidate.kind === 'supply'
            ? { provider: 'channel3', endpoint: '/v1/products/{product_id}', input: { pathParams: { product_id: productId }, queryParams: { country: 'US', currency: input.brief.currency.toUpperCase() } } }
            : { provider: 'context.dev', endpoint: '/web/scrape/markdown', input: { queryParams: {
              url: target.href, includeLinks: true, useMainContentOnly: true, maxAgeMs: 0, timeoutMS: 20_000,
            } } })
          runUrl = `https://api.monid.ai/v1/runs/${run.runId}`
          for (let poll = 0; ['READY', 'RUNNING'].includes(run.status) && poll < 20; poll++) {
            await pause(callSignal)
            run = await request(fetcher, options.apiKey, callSignal, runUrl)
          }
          if (run.status !== 'COMPLETED' || !run.providerResponse || run.providerResponse.httpStatus < 200 || run.providerResponse.httpStatus >= 300) throw new Error('Detail provider failed')
          // Work on a copy so malformed responses cannot partially overwrite prior evidence.
          const updated = structuredClone(candidate)
          let next: URL | undefined
          let sourceUrl = target.href
          if (candidate.kind === 'supply') productEvidence(updated, run.output, input.brief.currency, sourceUrl)
          else {
            const parsed = pageEvidence(updated, run.output, target, matchedFields)
            sourceUrl = parsed.final.href
            next = parsed.next
          }
          const observedAt = new Date().toISOString()
          updated.sources.push({ url: sourceUrl, tool, stage: 'detail', retrievedAt: observedAt })
          updated.observedAt = observedAt
          for (const field of FIELDS) {
            updated.verification[field] ??= { status: 'unknown' }
            if (!updated.verification[field].note) updated.verification[field] = { status: 'unknown', sourceUrl,
              note: 'This detail source does not establish the event-specific requirement. Further verification or supplier contact is needed; no contact was attempted.' }
          }
          Object.assign(candidate, Candidate.parse(updated))
          check(sourceUrl, 'ok', `Retrieved at ${observedAt}; provider record ${runUrl}. Listing/page evidence only. Missing fields require further verification or supplier contact, which was not attempted.`)
          if (!next || page + 1 >= maxPages) break
          target = next
        } catch {
          check(target.href, 'failed', `Detail failed, timed out, exceeded content limits, or had unusable identity/content. Checked at ${new Date().toISOString()}.${runUrl ? ` Provider record ${runUrl}.` : ' Provider run identity unavailable; no automatic retry.'}`)
          break
        }
      }
    }
    return result
  }
}
