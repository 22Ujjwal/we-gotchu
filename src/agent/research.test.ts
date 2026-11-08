import { expect, test, vi } from 'vitest'
import { CONTRACT_VERSION, ResearchResult, planReadyEvent, researchResultFixture } from '../contracts'
import { researchEvent } from './research'

const input = {
  contractVersion: CONTRACT_VERSION,
  eventId: 'event-research', runId: 'run-research', briefRevision: 1,
  brief: planReadyEvent.event.brief,
}

const candidates = researchResultFixture.candidates.map(candidate => ({
  ...candidate,
  priceEstimate: null,
  cancellationTerms: { known: false },
  verification: { availability: { status: 'unknown' as const } },
  whyChosenOrRejected: 'Discovery lead; price and availability need checking.',
}))

test('a complete brief returns source-backed venue and supply candidates under its own identity', async () => {
  const result = await researchEvent(input, {
    discover: async () => ({ candidates, sourceChecks: [] }),
    recommend: async () => ({ candidateIds: candidates.map(c => c.candidateId) }),
  })
  expect(ResearchResult.safeParse(result).success).toBe(true)
  expect(result).toMatchObject({ eventId: input.eventId, runId: input.runId, briefRevision: 1, budgetFit: 'unknown' })
  expect(result.candidates).toEqual(candidates)
  expect(result.candidates.map(c => c.kind)).toContain('supply')
  expect(result.candidates.map(c => c.kind)).toContain('venue')
  expect(result.candidates[0].sources).toEqual(candidates[0].sources)
})

test('missing essential requirements return focused fields without paid discovery', async () => {
  const discover = vi.fn()
  const recommend = vi.fn()
  const result = await researchEvent({ ...input, brief: { ...input.brief, location: '', startsAt: undefined } }, { discover, recommend })
  expect(result.outcome).toBe('awaiting_input')
  expect(result.missing.sort()).toEqual(['location', 'startsAt'])
  expect(discover).not.toHaveBeenCalled()
  expect(recommend).not.toHaveBeenCalled()
})

test('one correction recovers malformed output without repeating discovery', async () => {
  const discover = vi.fn(async () => ({ candidates, sourceChecks: [] }))
  const recommend = vi.fn().mockResolvedValueOnce({ budgetFit: 'within' }).mockResolvedValueOnce({ candidateIds: [candidates[0].candidateId] })
  const result = await researchEvent(input, { discover, recommend })
  expect(result.recommendations[0].candidateId).toBe(candidates[0].candidateId)
  expect(result.budgetFit).toBe('unknown')
  expect(discover).toHaveBeenCalledTimes(1)
  expect(recommend).toHaveBeenCalledTimes(2)
})

test('repeated invalid claims stop after one correction and preserve only retrieved evidence', async () => {
  const recommend = vi.fn(async () => ({ candidateIds: ['invented'], budgetFit: 'within' }))
  const result = await researchEvent(input, { discover: async () => ({ candidates, sourceChecks: [] }), recommend })
  expect(recommend).toHaveBeenCalledTimes(2)
  expect(result.recommendations).toEqual([])
  expect(result.candidates).toEqual(candidates)
  expect(result.budgetFit).toBe('unknown')
})

test('provider failure does not leak its secret or invent evidence', async () => {
  const result = await researchEvent(input, {
    discover: async () => { throw new Error('Bearer secret-123') }, recommend: vi.fn(),
  })
  expect(result.outcome).toBe('failed')
  expect(result.candidates).toEqual([])
  expect(JSON.stringify(result)).not.toContain('secret-123')
})

test('cancellation before work prevents provider calls', async () => {
  const controller = new AbortController()
  controller.abort()
  const discover = vi.fn()
  const result = await researchEvent(input, { discover, recommend: vi.fn() }, { signal: controller.signal })
  expect(result.outcome).toBe('canceled')
  expect(discover).not.toHaveBeenCalled()
})

test('a stalled provider is bounded by the research deadline', async () => {
  const result = await researchEvent(input, { discover: () => new Promise(() => {}), recommend: vi.fn() }, { timeoutMs: 10 })
  expect(result.outcome).toBe('failed')
  expect(result.warnings).toContain('Research stopped before completion.')
})

test('a missing currency or brief is reported as missing input instead of throwing', async () => {
  const discover = vi.fn()
  const { currency: _, ...withoutCurrency } = input.brief
  const result = await researchEvent({ ...input, brief: withoutCurrency }, { discover, recommend: vi.fn() })
  expect(result.outcome).toBe('awaiting_input')
  expect(result.missing).toEqual(['currency'])
  const noBrief = await researchEvent({ ...input, brief: undefined }, { discover, recommend: vi.fn() })
  expect(noBrief.outcome).toBe('awaiting_input')
  expect(noBrief.missing).toEqual(['brief'])
  expect(discover).not.toHaveBeenCalled()
})

test('invalid or duplicate discovery results are skipped without discarding the rest', async () => {
  const sourceChecks = [{ url: 'https://example.com/run', tool: 'test', outcome: 'ok' as const, missingFields: [] }]
  const result = await researchEvent(input, {
    discover: async () => ({ candidates: [...candidates, candidates[0], { ...candidates[1], candidateId: 'blank', name: '' }], sourceChecks }),
    recommend: async () => ({ candidateIds: [candidates[0].candidateId] }),
  })
  expect(result.candidates).toEqual(candidates)
  expect(result.sourceChecks).toEqual(sourceChecks)
  expect(result.recommendations.map(r => r.candidateId)).toEqual(candidates.map(c => c.candidateId))
  expect(result.warnings).toContain('2 invalid or duplicate discovery results were skipped.')
})

test('discovery warnings survive degraded outcomes', async () => {
  const warnings = ['supply discovery was incomplete.']
  const invalid = await researchEvent(input, {
    discover: async () => ({ candidates, sourceChecks: [], warnings }), recommend: async () => ({ candidateIds: ['invented'] }),
  })
  expect(invalid.warnings).toContain('supply discovery was incomplete.')
  const empty = await researchEvent(input, {
    discover: async () => ({ candidates: [], sourceChecks: [], warnings }), recommend: vi.fn(),
  })
  expect(empty.warnings).toEqual(['supply discovery was incomplete.', 'No usable supplier candidates were found.'])
  const failed = await researchEvent(input, {
    discover: async () => ({ candidates, sourceChecks: [], warnings }), recommend: async () => { throw new Error('down') },
  })
  expect(failed.warnings).toContain('supply discovery was incomplete.')
})


test.each(['throw', 'identity', 'stall'])('detail %s failure still ranks discovery within the run deadline', async failure => {
  const recommend = vi.fn(async () => ({ candidateIds: candidates.map(c => c.candidateId) }))
  const result = await researchEvent(input, {
    discover: async () => ({ candidates, sourceChecks: [] }),
    enrich: async (_input, evidence) => {
      if (failure === 'throw') throw new Error('secret provider error')
      if (failure === 'stall') return new Promise(() => {})
      return { ...evidence, candidates: [{ ...evidence.candidates[0], candidateId: 'other' }] }
    }, recommend,
  }, { timeoutMs: 200, detailTimeoutMs: 20, rankingReserveMs: 100 })
  expect(result.recommendations).toHaveLength(candidates.length)
  expect(recommend).toHaveBeenCalledTimes(1)
  expect(result.candidates).toEqual(candidates)
  expect(JSON.stringify(result)).not.toContain('secret provider error')
})
