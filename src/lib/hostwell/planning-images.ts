import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { PlanningOption } from '../../agent/planning/contract'

const publicUrl = z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol))
const imageSchema = z.object({
  url: publicUrl, sourcePage: publicUrl, provider: z.literal('source-page'),
  attribution: z.object({ text: z.string().min(1), url: publicUrl }),
  evidence: z.enum(['caption', 'structured-data', 'page-metadata']), description: z.string().nullable(),
})
const responseSchema = z.object({
  conversationId: z.string(), optionId: z.string(), version: z.number().int().nonnegative(),
  status: z.enum(['available', 'none', 'unavailable']), images: z.array(imageSchema),
})
export type PlanningVenueImage = z.infer<typeof imageSchema>
type Images = Record<string, PlanningVenueImage[]>
const empty: Images = Object.freeze(Object.create(null))

/** Images enrich a proposal independently; they never update or delay its planning state. */
export function usePlanningImages(conversationId: string | undefined, options: readonly PlanningOption[], version: number): Images {
  const venues = [...new Map(options.filter(option => option.kind === 'venue')
    .map(option => [option.id, { id: option.id, url: option.url, name: option.name }])).values()]
  // Version-only polling updates must not continually abort slower image reads.
  const scope = JSON.stringify([conversationId ?? null, venues])
  const currentVersion = useRef(version)
  currentVersion.current = version
  const [saved, setSaved] = useState<{ scope: string; images: Images }>({ scope, images: empty })

  useEffect(() => {
    const [id, sources] = JSON.parse(scope) as [string | null, { id: string }[]]
    const requestedVersion = currentVersion.current
    const controller = new AbortController()
    setSaved({ scope, images: empty })
    if (id) for (const source of sources) {
      void (async () => {
        try {
          const response = await fetch(`/api/planning/${encodeURIComponent(id)}/options/${encodeURIComponent(source.id)}/images`, {
            method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          })
          if (!response.ok) return
          const parsed = responseSchema.safeParse(await response.json())
          if (controller.signal.aborted || !parsed.success) return
          const result = parsed.data
          if (result.conversationId !== id || result.optionId !== source.id || result.version < requestedVersion
            || result.status !== 'available') return
          setSaved(previous => previous.scope === scope ? { scope,
            images: Object.assign(Object.create(null), previous.images, { [source.id]: result.images.slice(0, 4) }),
          } : previous)
        } catch { /* A missing or unavailable image never blocks the saved proposal. */ }
      })()
    }
    return () => controller.abort()
  }, [scope])

  return saved.scope === scope ? saved.images : empty
}
