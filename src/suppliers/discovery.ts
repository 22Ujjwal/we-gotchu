import { z } from 'zod'
import { Candidate, type ResearchInput } from '../contracts'
import type { Discovery } from '../agent/research'
import { pause, requestJson } from '../agent/http'

const MonidRun = z.object({
  runId: z.string(), status: z.string(), output: z.unknown().optional(),
  providerResponse: z.object({ httpStatus: z.number().optional() }).nullish(),
})
// Items are checked one at a time so a single malformed listing only drops itself.
const Places = z.object({ local_results: z.array(z.unknown()).default([]) })
const Place = z.object({ title: z.string().min(1), place_id: z.string().min(1), website: z.string().nullish() })
const Products = z.object({ products: z.array(z.unknown()).default([]), disclosure: z.unknown().optional() })
const Product = z.object({
  id: z.string().min(1), title: z.string().min(1),
  offers: z.array(z.object({ url: z.string().nullish() })).default([]),
})
const webUrl = z.url().refine(value => ['https:', 'http:'].includes(new URL(value).protocol))

export function createDiscovery(options: { apiKey: string; fetch?: typeof fetch; limitPerSource?: number }) {
  const fetcher = options.fetch ?? fetch
  const limit = options.limitPerSource ?? 5
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Discovery limit must be between 1 and 10')
  return async (input: ResearchInput, signal: AbortSignal): Promise<Discovery> => {
    const result: Discovery = { candidates: [], sourceChecks: [], warnings: [] }
    // Fixed endpoints prevent source text or model output from selecting mutation tools.
    const jobs = [
      { provider: 'litescrape', endpoint: '/google/maps', kind: 'venue' as const,
        queryParams: { q: `${input.brief.eventType} event venue ${input.brief.location}`, type: 'search', location: input.brief.location, z: 12, start: 0 } },
      ...(input.brief.supplyNeeds.length ? [{ provider: 'channel3', endpoint: '/v1/search', kind: 'supply' as const,
        body: { query: `${input.brief.supplyNeeds.join(', ')} for ${input.brief.headcount} people`, limit, config: { country: 'US', currency: input.brief.currency.toUpperCase() } } }] : []),
    ]
    for (const job of jobs) {
      signal.throwIfAborted()
      const tool = `monid:${job.provider}${job.endpoint}`
      const url = `https://api.monid.ai/v1/run`
      try {
        let run = MonidRun.parse(await requestJson(fetcher, url, options.apiKey, signal, {
          provider: job.provider, endpoint: job.endpoint,
          input: { ...('body' in job ? { body: job.body } : {}), ...('queryParams' in job ? { queryParams: job.queryParams } : {}) },
        }))
        for (let poll = 0; ['READY', 'RUNNING'].includes(run.status) && poll < 40; poll++) {
          await pause(signal)
          run = MonidRun.parse(await requestJson(fetcher, `https://api.monid.ai/v1/runs/${encodeURIComponent(run.runId)}`, options.apiKey, signal))
        }
        if (run.status !== 'COMPLETED' || (run.providerResponse?.httpStatus ?? 500) >= 400) throw new Error('Discovery did not complete successfully')
        const observedAt = new Date().toISOString()
        const make = (id: string, name: string, sourceUrl: string, disclosure?: string): Candidate => ({
          candidateId: `${job.kind}:${id}`, supplierId: id, name, kind: job.kind,
          sources: [{ url: sourceUrl, tool, stage: 'discovery', retrievedAt: observedAt }], observedAt,
          evidenceMode: 'live', priceEstimate: null, priceProvenance: 'estimate', taxesAndDelivery: 'unknown',
          cancellationTerms: { known: false },
          verification: Object.fromEntries(['price', 'availability', 'capacity', 'cancellation', 'quantity'].map(field => [field, { status: 'unknown' as const }])),
          ...(disclosure ? { affiliateDisclosure: disclosure } : {}),
          whyChosenOrRejected: 'Search result for the supplied brief; supplier details remain unverified.',
        })
        const found: Candidate[] = []
        if (job.kind === 'venue') {
          for (const item of Places.parse(run.output).local_results) {
            if (found.length >= limit) break
            const parsed = Place.safeParse(item)
            if (!parsed.success || found.some(c => c.supplierId === parsed.data.place_id)) continue
            const place = parsed.data
            const fallback = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.title)}&query_place_id=${encodeURIComponent(place.place_id)}`
            const source = webUrl.safeParse(place.website)
            found.push(make(place.place_id, place.title, source.success ? source.data : fallback))
          }
        } else {
          const products = Products.parse(run.output)
          const disclosure = typeof products.disclosure === 'string' ? products.disclosure : products.disclosure ? JSON.stringify(products.disclosure) : undefined
          for (const item of products.products) {
            if (found.length >= limit) break
            const parsed = Product.safeParse(item)
            if (!parsed.success || found.some(c => c.supplierId === parsed.data.id)) continue
            const product = parsed.data
            const source = webUrl.safeParse(product.offers[0]?.url)
            if (source.success) found.push(make(product.id, product.title, source.data, disclosure))
          }
        }
        result.candidates.push(...found)
        result.sourceChecks.push({ url: `https://api.monid.ai/v1/runs/${encodeURIComponent(run.runId)}`, tool,
          outcome: found.length ? 'ok' : 'absent', missingFields: ['price', 'availability', 'cancellation'],
          reason: 'Discovery only; supplier details have not been checked.' })
      } catch {
        result.sourceChecks.push({ url, tool, outcome: 'failed', missingFields: [job.kind], reason: 'Provider response failed or was unusable.' })
        result.warnings?.push(`${job.kind} discovery was incomplete.`)
      }
    }
    return result
  }
}
