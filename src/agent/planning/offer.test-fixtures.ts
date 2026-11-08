import type { PlanningRecord } from '../../server/planning/repository'

export const venue = { id: 'venue', kind: 'venue' as const, name: 'Room', url: 'https://example.com/room', why: 'Selected', facts: [], unknowns: [] }
export const record: PlanningRecord = { id: 'conversation', customerId: 'customer', createRequestId: 'create', initialMessage: 'Party',
  revision: 0, sessionId: null, sequence: 0, pending: null, requests: {}, view: {
    id: 'conversation', version: 0, status: 'ready', selections: [venue], proposal: null, progress: null, error: null,
    messages: [{ id: 'brief', role: 'user', text: 'Birthday for 12 in SF, December 12 2026 noon Pacific. USD 300 budget.', createdAt: '2026-11-08T12:00:00Z' }],
    inquiry: { id: 'inquiry', revision: 1, status: 'draft', recipient: 'venue@example.com', subject: 'Party', text: 'Party for 12', venue,
      contextMessageIds: ['brief'], contactSourceUrl: null, updatedAt: '2026-11-08T12:00:00Z', replies: [{ id: 'reply', status: 'ready',
        message: { provider: 'controlled', messageId: 'source', threadId: 'thread', inReplyTo: 'sent', from: 'venue@example.com', to: ['planner@example.com'],
          subject: 'Quote', text: 'USD 200 for the room, including USD 50 deposit. Tax is extra.', receivedAt: '2026-11-08T12:00:00Z', originalRef: 'source', mode: 'simulated' },
        interpretation: { kind: 'quote', summary: 'Room quote.', nextAction: 'Ask for tax.', facts: [], missing: ['Tax'] } }] },
  } }
export const extracted = {
  currency: 'usd', expiresAt: null, missing: ['Tax amount', 'Cancellation terms', 'Availability'],
  brief: { eventType: 'Birthday', location: 'SF', startsAt: '2026-12-12T20:00:00Z', timezone: 'America/Los_Angeles',
    headcount: 12, budget: 30000, currency: 'usd', supplyNeeds: [], maximumCancellationLoss: 0 },
  lines: [{ optionId: 'venue', unitAmount: 20000, units: 1, quantityDescription: 'Room for 12', tax: null, delivery: 0, fees: null,
    deposit: { amount: 5000, treatment: 'included' }, cancellationTerms: null,
    sourceQuotes: ['USD 200 for the room, including USD 50 deposit. Tax is extra.'] }],
}

