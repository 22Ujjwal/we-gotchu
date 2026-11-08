import { setTimeout } from 'node:timers/promises'

export function createPlanningFetch(options: {
  fetch?: typeof fetch
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
} = {}): typeof fetch {
  const request = options.fetch ?? fetch
  const wait = options.wait ?? (async (milliseconds, signal) => { await setTimeout(milliseconds, undefined, { signal }) })
  return async (url, init) => {
    const signals = [AbortSignal.timeout(45_000), ...(init?.signal ? [init.signal] : [])]
    const signal = AbortSignal.any(signals)
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted()
      const response = await request(url instanceof Request ? url.clone() : url, { ...init, signal })
      // Only a received 429 proves rejection. Never repeat a timed-out or failed write.
      if (response.status !== 429 || attempt === 2) return response
      const retryAfter = response.headers.get('retry-after')
      const seconds = retryAfter === null ? NaN : Number(retryAfter)
      const delay = retryAfter === null ? 1000 * 2 ** attempt
        : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()
      if (!Number.isFinite(delay) || delay > 10_000) return response
      await response.body?.cancel()
      await wait(Math.max(1000 * 2 ** attempt, delay), signal)
    }
  }
}
