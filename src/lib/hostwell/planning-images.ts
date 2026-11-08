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
export function usePlanningImages(conversationId: string | undefined, options: readonly PlanningOption[], version: number) {
  const venues = [...new Map(options.filter(option => option.kind === 'venue')
    .map(option => [option.id, { id: option.id, url: option.url, name: option.name }])).values()]
  // Version-only polling updates must not continually abort slower image reads.
  const scope = JSON.stringify([conversationId ?? null, venues])
  const currentVersion = useRef(version)
  currentVersion.current = version
  const [saved, setSaved] = useState<{ scope: string; images: Images; canRetry: boolean; attempted: string[] }>({ scope, images: empty, canRetry: false, attempted: [] })
  const retryAction = useRef<{ scope: string; run: () => void } | null>(null)

  useEffect(() => {
    const [id, sources] = JSON.parse(scope) as [string | null, { id: string }[]]
    const controller = new AbortController()
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const failed = new Set<string>()
    setSaved({ scope, images: empty, canRetry: false, attempted: [] })
    function transientFailure(optionId: string, attempt: number, requestedVersion: number) {
      if (controller.signal.aborted) return
      if (attempt < 2) {
        const timer = setTimeout(() => { timers.delete(timer); void read(optionId, attempt + 1, requestedVersion) }, 1000 * (attempt + 1))
        timers.add(timer)
      } else {
        failed.add(optionId)
        setSaved(previous => previous.scope === scope ? { ...previous, canRetry: true } : previous)
      }
    }
    function markAttempted(optionId: string) {
      if (controller.signal.aborted) return
      setSaved(previous => previous.scope === scope && !previous.attempted.includes(optionId)
        ? { ...previous, attempted: [...previous.attempted, optionId] } : previous)
    }
    async function read(optionId: string, attempt: number, requestedVersion: number) {
      if (controller.signal.aborted || !id) return
      let response: Response
      try {
        response = await fetch(`/api/planning/${encodeURIComponent(id)}/options/${encodeURIComponent(optionId)}/images`, {
          method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        })
      } catch {
        markAttempted(optionId)
        transientFailure(optionId, attempt, requestedVersion)
        return
      }
      if (controller.signal.aborted) return
      if (response.status >= 500) { markAttempted(optionId); transientFailure(optionId, attempt, requestedVersion); return }
      if (!response.ok) { markAttempted(optionId); return }
      try {
        const parsed = responseSchema.safeParse(await response.json())
        if (controller.signal.aborted || !parsed.success) return
        const result = parsed.data
        if (result.conversationId !== id || result.optionId !== optionId || result.version < requestedVersion) return
        if (result.status === 'unavailable') { transientFailure(optionId, attempt, requestedVersion); return }
        if (result.status !== 'available') return
        setSaved(previous => previous.scope === scope ? { ...previous,
          images: Object.assign(Object.create(null), previous.images, { [optionId]: result.images.slice(0, 4) }),
        } : previous)
      } catch { /* Invalid image responses are not retried and never block the proposal. */ }
      finally { markAttempted(optionId) }
    }
    retryAction.current = { scope, run: () => {
      if (controller.signal.aborted || !failed.size) return
      const retryIds = [...failed]
      // Clear synchronously, so repeated clicks cannot launch overlapping requests.
      failed.clear()
      setSaved(previous => previous.scope === scope ? { ...previous, canRetry: false } : previous)
      for (const optionId of retryIds) void read(optionId, 0, currentVersion.current)
    } }
    if (id) for (const source of sources) void read(source.id, 0, currentVersion.current)
    return () => { controller.abort(); for (const timer of timers) clearTimeout(timer) }
  }, [scope])

  return { attempted: saved.scope === scope ? saved.attempted : [], images: saved.scope === scope ? saved.images : empty,
    canRetry: saved.scope === scope && saved.canRetry,
    retry: () => { if (retryAction.current?.scope === scope) retryAction.current.run() },
  }
}
