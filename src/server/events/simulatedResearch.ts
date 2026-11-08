import { researchResultFixture, type Event, type ResearchResult, type Run } from '../../contracts'
import type { ResearchPort } from './deps'

// SIMULATED research port. Not Tony's research code and makes no Naive calls.
// It returns the contract fixture re-labeled with the event's ids so demos and
// tests can exercise the full flow. Every candidate is evidenceMode "simulated".
// Replace it with configureDeps({ research }) once the real module exists.

const SIMULATED_TOTAL = 31500 // fixture venue 30000 + plates 1500

export function simulatedResult(event: Event, run: Run, createdAt: Date): ResearchResult {
  const fits = event.brief.budget >= SIMULATED_TOTAL
  return {
    ...structuredClone(researchResultFixture),
    eventId: event.eventId,
    briefRevision: run.briefRevision,
    runId: run.runId,
    currency: event.brief.currency,
    budgetFit: fits ? 'within' : 'over',
    budgetBasis: fits
      ? researchResultFixture.budgetBasis
      : `Simulated total ${SIMULATED_TOTAL} exceeds the ${event.brief.budget} budget.`,
    warnings: [...researchResultFixture.warnings, 'Simulated research: not real supplier data.'],
    superseded: false,
    createdAt: createdAt.toISOString(),
  }
}

export const simulatedResearchPort: ResearchPort = {
  async startResearch(input) {
    return { naiveSessionId: `sim_session_${input.runId}` }
  },
  async advanceResearch({ event, run }) {
    // Completes on the first advance so the demo reaches plan_ready on the next poll.
    return { status: 'done', result: simulatedResult(event, run, new Date()), lastSequence: run.lastSequence + 1 }
  },
  async cancelResearch() {},
}
