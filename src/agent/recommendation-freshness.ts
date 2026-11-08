import type { Candidate } from '../contracts'

export const DEFAULT_FRESHNESS_MS = {
  listingPrice: 24 * 60 * 60 * 1000,
  packSize: 30 * 24 * 60 * 60 * 1000,
  cancellation: 7 * 24 * 60 * 60 * 1000,
  availability: 15 * 60 * 1000,
  capacity: 30 * 24 * 60 * 60 * 1000,
}
export type FreshnessPolicy = typeof DEFAULT_FRESHNESS_MS

export function freshnessPolicy(overrides: Partial<FreshnessPolicy> = {}): FreshnessPolicy {
  const policy = { ...DEFAULT_FRESHNESS_MS, ...overrides }
  if (Object.values(policy).some(n => !Number.isSafeInteger(n) || n <= 0)) throw new Error('Freshness limits must be positive integer milliseconds')
  return policy
}

export function evidenceFresh(candidate: Candidate, sourceUrl: string | undefined,
  field: keyof FreshnessPolicy, now: number, policy: FreshnessPolicy): boolean {
  if (!sourceUrl || !Number.isFinite(now)) return false
  // A later unrelated retrieval cannot refresh this claim's source.
  const sources = candidate.sources.filter(s => s.url === sourceUrl && s.stage !== 'discovery')
  return sources.some(source => {
    const age = now - Date.parse(source.retrievedAt)
    return age >= 0 && age <= policy[field]
  })
}
