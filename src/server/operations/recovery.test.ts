import { describe, expect, it } from 'vitest'
import { bookedEvent, planReadyEvent, researchResult } from '../../contracts/fixtures'
import { previewRecovery, type RecoveryInput } from './recovery'

function input(): RecoveryInput {
  const view = structuredClone(planReadyEvent)
  view.plan!.actions.push({ ...view.plan!.actions[1], actionId: 'unrelated', dependsOn: [] })
  return { view, expectedBriefRevision: 1, expectedPlanRevision: 1, disruption: { unavailableActionIds: ['act_sim_venue'] } }
}

describe('previewRecovery', () => {
  it('includes transitive dependents while preserving unrelated actions without mutating input', () => {
    const value = input()
    value.view.plan!.actions.push({ ...value.view.plan!.actions[1], actionId: 'delivery', dependsOn: ['act_sim_item'] })
    const before = structuredClone(value)
    const result = previewRecovery(value)
    expect(result.affectedActionIds).toEqual(['act_sim_venue', 'act_sim_item', 'delivery'])
    expect(result.preservedActionIds).toEqual(['unrelated'])
    expect(result.safeToResearchActionIds).toEqual(result.affectedActionIds)
    expect(result.requiresFreshApproval).toBe(true)
    result.researchBrief.supplyNeeds.push('napkins')
    expect(value).toEqual(before)
  })

  it.each(['unknown', 'running', 'pending', 'succeeded'] as const)('requires reconciliation for affected %s attempts', (state) => {
    const value = input()
    value.view.attempts = [{ ...bookedEvent.attempts[0], state }]
    const result = previewRecovery(value)
    expect(result.reconcileActionIds).toEqual(['act_sim_venue'])
    expect(result.safeToResearchActionIds).toEqual(['act_sim_item'])
  })

  it('creates a revised headcount brief and rechecks all actions', () => {
    const value = input()
    value.disruption = { headcount: 40 }
    const result = previewRecovery(value)
    expect(result.researchBrief.headcount).toBe(40)
    expect(result.proposedBriefRevision).toBe(2)
    expect(result.affectedActionIds).toEqual(['act_sim_venue', 'act_sim_item', 'unrelated'])
    expect(value.view.event.brief.headcount).toBe(20)
  })

  it.each(['staleBrief', 'stalePlan', 'mismatchedEvent', 'mismatchedBrief', 'mismatchedPlan', 'canceled', 'canceling', 'unknownAction', 'invalidHeadcount', 'empty'] as const)('rejects %s inputs', (failure) => {
    const value = input()
    if (failure === 'staleBrief') value.expectedBriefRevision = 2
    if (failure === 'stalePlan') value.expectedPlanRevision = 2
    if (failure === 'mismatchedEvent') value.view.plan!.eventId = 'other'
    if (failure === 'mismatchedBrief') value.view.plan!.briefRevision = 2
    if (failure === 'mismatchedPlan') value.view.plan!.revision = 2
    if (failure === 'canceled' || failure === 'canceling') value.view.event.status = failure
    if (failure === 'unknownAction') value.disruption = { unavailableActionIds: ['missing'] }
    if (failure === 'invalidHeadcount') value.disruption = { headcount: 0 }
    if (failure === 'empty') value.disruption = {}
    expect(() => previewRecovery(value)).toThrow()
  })

  it('keeps estimated replacement cost separate from unknown taxes and retained charges', () => {
    const value = input()
    value.view.attempts = structuredClone(bookedEvent.attempts)
    value.candidates = researchResult.candidates.slice(0, 2)
    const result = previewRecovery(value)
    expect(result.candidateComparisons).toMatchObject([
      { candidateId: 'cand_venue_a', estimatedReplacementSpend: 30000, taxesAndDelivery: 'unknown', replacementCancellationTermsKnown: true, retainedCancellationCharges: null, totalRecoveryCost: null, reservationConfirmed: false },
      { candidateId: 'cand_venue_b', estimatedReplacementSpend: null, taxesAndDelivery: 'unknown', replacementCancellationTermsKnown: false, retainedCancellationCharges: null, totalRecoveryCost: null, reservationConfirmed: false },
    ])
  })
  it('preserves simulated estimates and live quote evidence without sharing source arrays', () => {
    const value = input()
    value.candidates = structuredClone(researchResult.candidates.slice(0, 2))
    value.candidates[0].priceProvenance = 'estimate'
    value.candidates[1].evidenceMode = 'live'
    value.candidates[1].priceProvenance = 'quote'
    const result = previewRecovery(value)
    expect(result.candidateComparisons[0].candidate).toMatchObject({
      evidenceMode: 'simulated', priceProvenance: 'estimate', observedAt: '2026-11-08T01:00:00.000Z',
      sources: [{ url: 'https://example.com/venue-a', stage: 'discovery', tool: 'simulated-research', retrievedAt: '2026-11-08T01:00:00.000Z' },
        { url: 'https://example.com/venue-a/terms', stage: 'detail', tool: 'simulated-research', retrievedAt: '2026-11-08T01:00:00.000Z' }],
    })
    expect(result.candidateComparisons[1].candidate).toMatchObject({ evidenceMode: 'live', priceProvenance: 'quote' })
    result.candidateComparisons[0].candidate.sources[0].url = 'https://example.com/changed'
    expect(value.candidates[0].sources[0].url).toBe('https://example.com/venue-a')
  })

})
