import { CONTRACT_VERSION, planReadyEvent, researchResultFixture, type ResearchResult } from '../contracts'

// Test-only contract examples. Do not import server research modules into the frontend.
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

export function sdkSessionResponse(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const response = value as Record<string, unknown>
  if ('accepted_seq' in response) return { session_id: 'ses_00000000000000000000000001', status: 'running', ...response }
  if (typeof response.id !== 'string' || !response.id.startsWith('ses_')) return value
  return { object: 'session', agent_id: 'agt_00000000000000000000000001', agent_version: 1,
    deployment_id: null, identity_id: null, computer_id: null, parent_session_id: null, root_session_id: null,
    thread_role: null, window: 'immediate', status: 'queued', stop_reason: null,
    budget_micro_usd: 500000, consumed_micro_usd: 0,
    token_usage: { input: 0, cache_write: 0, cache_read: 0, output: 0, reasoning: 0 }, pending_actions: [],
    output_schema: null, structured_output: null, last_seq: 0, metadata: {}, started_at: null, ended_at: null,
    created_at: '2026-11-08T00:00:00Z', ...response }
}
