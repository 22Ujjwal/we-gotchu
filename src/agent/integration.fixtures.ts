import { CONTRACT_VERSION, planReadyEvent, researchResultFixture, type ResearchResult } from '../contracts'

// Consumer examples only. These are synthetic and never used by production wiring.
export const researchBriefFixture = { ...planReadyEvent.event.brief }
export const discoveryFixture = {
  candidates: researchResultFixture.candidates.map(candidate => ({
    ...candidate, evidenceMode: 'simulated' as const, priceEstimate: null,
    cancellationTerms: { known: false }, taxesAndDelivery: 'unknown' as const,
    verification: { availability: { status: 'unknown' as const } },
    whyChosenOrRejected: 'Synthetic discovery example; supplier details are unverified.',
  })),
  sourceChecks: [],
}
const result: ResearchResult = {
  contractVersion: CONTRACT_VERSION, eventId: 'fixture-event', runId: 'fixture-run', briefRevision: 1,
  outcome: 'partial', ...discoveryFixture, missing: [], recommendations: [], budgetFit: 'unknown',
  budgetBasis: 'Final costs are unknown.', currency: 'USD', warnings: ['Synthetic consumer fixture.'],
  superseded: false, createdAt: '2026-11-07T12:00:00.000Z',
}
export const researchConsumerFixtures = {
  running: { eventId: result.eventId, runId: result.runId, briefRevision: 1, state: 'running',
    progress: [{ eventId: result.eventId, sequence: 1, actor: 'agent', message: 'Comparing retrieved candidates.', createdAt: result.createdAt }] },
  missing: { ...result, outcome: 'awaiting_input', candidates: [], missing: ['location'] } satisfies ResearchResult,
  partial: result,
  failure: { ...result, outcome: 'failed', candidates: [], warnings: ['Research failed. Revise the brief to retry.'] } satisfies ResearchResult,
  canceled: { ...result, outcome: 'canceled', warnings: ['Research stopped. No supplier booking or purchase was canceled.'] } satisfies ResearchResult,
}
