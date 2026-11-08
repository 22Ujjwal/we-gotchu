import { expect, test } from 'vitest'
import { researchResultFixture } from '../contracts'
import { DEFAULT_FRESHNESS_MS, evidenceFresh, freshnessPolicy } from './recommendation-freshness'

const now = Date.parse('2026-11-08T01:00:00.000Z')
const url = 'https://example.com/evidence'
const candidate = { ...researchResultFixture.candidates[0], sources: [{ url, stage: 'detail' as const, tool: 'test', retrievedAt: new Date(now).toISOString() }] }
test('freshness includes its exact limit and rejects future or expired evidence', () => {
  for (const field of Object.keys(DEFAULT_FRESHNESS_MS) as Array<keyof typeof DEFAULT_FRESHNESS_MS>) {
    const limit = DEFAULT_FRESHNESS_MS[field]
    expect(evidenceFresh(candidate, url, field, now + limit, DEFAULT_FRESHNESS_MS)).toBe(true)
    expect(evidenceFresh(candidate, url, field, now + limit + 1, DEFAULT_FRESHNESS_MS)).toBe(false)
    expect(evidenceFresh(candidate, url, field, now - 1, DEFAULT_FRESHNESS_MS)).toBe(false)
  }
})
test('only the attributed detail or quote source establishes freshness', () => {
  expect(evidenceFresh(candidate, 'https://example.com/other', 'listingPrice', now, DEFAULT_FRESHNESS_MS)).toBe(false)
  expect(evidenceFresh({ ...candidate, sources: [{ ...candidate.sources[0], stage: 'discovery' }] }, url, 'listingPrice', now, DEFAULT_FRESHNESS_MS)).toBe(false)
})
test('configurable freshness limits retain defaults and reject unsafe values', () => {
  expect(freshnessPolicy({ listingPrice: 1000 })).toEqual({ ...DEFAULT_FRESHNESS_MS, listingPrice: 1000 })
  for (const invalid of [0, -1, 1.5, NaN, Infinity]) expect(() => freshnessPolicy({ listingPrice: invalid })).toThrow()
})
