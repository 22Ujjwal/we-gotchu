import { resolve4 } from 'node:dns/promises'
import { ApiError, handle, json } from '../events/errors'
import type { PlanningRepository } from './repository'
import { publicAddress, readSource } from './image-source'
import { extractVenueImages } from './venue-images'
import type { VenueImage } from './venue-images'

export type VenueImagesResponse = {
  conversationId: string
  optionId: string
  version: number
  status: 'available' | 'none' | 'unavailable'
  images: VenueImage[]
}
type Deps = { repository: Pick<PlanningRepository, 'get'>; requireCustomerId: () => Promise<string> }

/** This reads the saved view directly. It must never advance or call the planning agent. */
export async function venueImagesGet(deps: Deps, id: string, optionId: string, options: {
  read?: (url: string) => Promise<string>
  resolve?: (hostname: string) => Promise<string[]>
  timeoutMs?: number
} = {}): Promise<Response> {
  const response = await handle(async () => {
    const customer = await deps.requireCustomerId()
    const record = await deps.repository.get(customer, id)
    if (!record || record.customerId !== customer || record.id !== id) throw new ApiError(404, 'not_found', 'Conversation not found.')
    const option = record.view.proposal?.options.find(o => o.id === optionId)
    if (!option) throw new ApiError(404, 'not_found', 'Option not found.')
    const result: VenueImagesResponse = { conversationId: id, optionId, version: record.view.version, status: 'none', images: [] }
    if (option.kind !== 'venue') return json(result)
    let timer: ReturnType<typeof setTimeout> | undefined
    let expired = false
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error('Image deadline')) }, options.timeoutMs ?? 5500)
    })
    try {
      const work = async (): Promise<VenueImage[]> => {
        const html = await (options.read ?? readSource)(option.url)
        if (expired) return []
        const candidates = extractVenueImages(html, option.url, option.name)
        // Filter private image hosts too. We never send credentials or fetch image bytes here.
        const hosts = [...new Set(candidates.map(c => new URL(c.url).hostname))]
        const allowed = new Set<string>()
        await Promise.all(hosts.map(async host => {
          try {
            const addresses = await (options.resolve ?? resolve4)(host)
            if (addresses.length && addresses.every(publicAddress)) allowed.add(host)
          } catch { /* omit unavailable image hosts */ }
        }))
        return candidates.filter(c => allowed.has(new URL(c.url).hostname))
      }
      result.images = await Promise.race([work(), deadline])
      result.status = result.images.length ? 'available' : 'none'
    } catch {
      result.status = 'unavailable' // Provider details and source content never enter the error response.
    } finally { clearTimeout(timer) }
    return json(result)
  })
  response.headers.set('cache-control', 'private, no-store')
  return response
}
