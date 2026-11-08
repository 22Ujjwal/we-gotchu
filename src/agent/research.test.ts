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
