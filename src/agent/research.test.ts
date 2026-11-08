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
