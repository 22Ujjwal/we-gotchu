import { CONTRACT_VERSION, type Approval, type Attempt, type EventView, type Payment, type Plan } from './records'

// Simulated fixtures for the frontend and agent. Every record is labeled
// mode "simulated" and is not evidence of a real booking or payment.
const T0 = '2026-11-08T01:00:00.000Z'
const T1 = '2026-11-08T01:05:00.000Z'
const T2 = '2026-11-08T01:36:00.000Z'
const EXPIRES = '2026-11-08T01:36:00.000Z'

const brief = {
  eventType: 'birthday',
  location: 'San Francisco, CA',
  startsAt: '2026-12-12T02:00:00.000Z',
  timezone: 'America/Los_Angeles',
  headcount: 20,
  budget: 50000,
  currency: 'usd',
  supplyNeeds: ['paper plates'],
  maximumCancellationLoss: 1000,
}

const event = {
  eventId: 'evt_sim_1',
  customerId: 'cust_sim_1',
  brief,
  briefRevision: 1,
  status: 'plan_ready' as const,
  planRevision: 1,
  cancelRequestedAt: null,
  progressSequence: 3,
  createdAt: T0,
}

const terms = (known: boolean) => ({
  known,
  summary: known ? 'Free cancellation until 48 hours before the event.' : undefined,
  sourceUrl: known ? 'https://example.com/venue-a/terms' : undefined,
})

const plan: Plan = {
  planId: 'plan_sim_1',
  eventId: 'evt_sim_1',
  contractVersion: CONTRACT_VERSION,
  briefRevision: 1,
  revision: 1,
  candidates: [
    {
      name: 'Harbor Loft (simulated)',
      kind: 'venue',
      sourceUrl: 'https://example.com/venue-a',
      observedAt: T0,
      priceEstimate: 30000,
      priceProvenance: 'quote',
      cancellationTerms: terms(true),
      verification: {
        capacity: { status: 'known', sourceUrl: 'https://example.com/venue-a' },
        availability: { status: 'unknown', note: 'No date-specific availability found.' },
      },
      whyChosenOrRejected: 'Fits 20 guests and the budget; cancellation terms are stated.',
    },
    {
      name: 'Garden Room (simulated)',
      kind: 'venue',
      sourceUrl: 'https://example.com/venue-b',
      observedAt: T0,
      priceEstimate: null,
      priceProvenance: 'estimate',
      cancellationTerms: terms(false),
      verification: { price: { status: 'unknown' } },
      whyChosenOrRejected: 'Price and cancellation terms could not be verified.',
    },
    {
      name: 'Paper plates, 8-pack (simulated)',
      kind: 'supply',
      sourceUrl: 'https://example.com/plates',
      observedAt: T0,
      priceEstimate: 1500,
      priceProvenance: 'quote',
      quantityInfo: { needed: 20, packSize: 8, packs: 3 },
      cancellationTerms: terms(true),
      verification: { quantity: { status: 'known' } },
      whyChosenOrRejected: 'Three packs cover 20 guests.',
    },
  ],
  actions: [
    {
      actionId: 'act_sim_venue',
      kind: 'venue_booking',
      supplierName: 'Harbor Loft (simulated)',
      target: 'Main hall, 2026-12-12 evening',
      quantityOrSchedule: '4 hours',
      maximumAmount: 30000,
      cancellationTerms: terms(true),
      sourceUrl: 'https://example.com/venue-a',
      dependsOn: [],
      mode: 'simulated',
    },
    {
      actionId: 'act_sim_item',
      kind: 'item_purchase',
      supplierName: 'Paper plates, 8-pack (simulated)',
      target: 'Paper plates, 8-pack',
      quantityOrSchedule: '3 packs',
      maximumAmount: 1500,
      cancellationTerms: terms(true),
      sourceUrl: 'https://example.com/plates',
      dependsOn: ['act_sim_venue'],
      mode: 'simulated',
    },
  ],
  total: 31500,
  currency: 'usd',
  serviceFee: 0,
  cancellationTerms: 'Both commitments are free to cancel until 48 hours before the event.',
  agentReasoning: 'Chose the venue with stated terms and a quote, and the cheapest pack count that covers 20 guests.',
  mode: 'simulated',
  researchOutcome: 'success',
  budgetFit: 'within',
  budgetBasis: 'Venue quote 30000 plus supplies 1500 is 31500, under the 50000 budget; taxes and delivery are not included.',
  missing: [],
  warnings: ['Date-specific venue availability is unverified.'],
}

const approval: Approval = {
  approvalId: 'appr_sim_1',
  eventId: 'evt_sim_1',
  planId: 'plan_sim_1',
  planRevision: 1,
  actionIds: ['act_sim_venue', 'act_sim_item'],
  approvedTotal: 31500,
  currency: 'usd',
  approvedAt: T1,
  expiresAt: EXPIRES,
  revokedAt: null,
}

const payment: Payment = {
  paymentId: 'pay_sim_1',
  approvalId: 'appr_sim_1',
  checkoutSessionId: 'cs_sim_1',
  paymentIntentId: 'pi_sim_1',
  amount: 31500,
  currency: 'usd',
  state: 'paid',
  refundId: null,
  refundState: 'none',
  refundReason: null,
  mode: 'simulated',
}

const commit = (actionId: string, amount: number): Attempt => ({
  attemptId: `att_commit_${actionId}`,
  eventId: 'evt_sim_1',
  actionId,
  approvalId: 'appr_sim_1',
  kind: 'commit',
  executionKey: `appr_sim_1:${actionId}:commit`,
  state: 'succeeded',
  providerReference: `sim_${actionId}`,
  actualAmount: amount,
  evidence: { providerReference: `sim_${actionId}`, confirmation: 'Simulated confirmation.' },
  errorReason: null,
  mode: 'simulated',
  updatedAt: T2,
})

const cancel = (actionId: string, amount: number): Attempt => ({
  ...commit(actionId, amount),
  attemptId: `att_cancel_${actionId}`,
  kind: 'cancel',
  executionKey: `appr_sim_1:${actionId}:cancel`,
  providerReference: `sim_cancel_${actionId}`,
  evidence: { providerReference: `sim_cancel_${actionId}`, confirmation: 'Simulated cancellation.' },
})

const run = {
  runId: 'run_sim_research',
  eventId: 'evt_sim_1',
  phase: 'research' as const,
  briefRevision: 1,
  idempotencyKey: 'evt_sim_1:research:1',
  naiveSessionId: 'ses_sim_1',
  lastSequence: 53,
  state: 'succeeded' as const,
  createdAt: T0,
}

const progress = [
  { eventId: 'evt_sim_1', sequence: 1, actor: 'system' as const, message: 'Research started.', createdAt: T0 },
  { eventId: 'evt_sim_1', sequence: 2, actor: 'agent' as const, message: 'Compared two venues and one supply item.', createdAt: T0 },
  { eventId: 'evt_sim_1', sequence: 3, actor: 'agent' as const, message: 'Plan ready: venue plus three packs of plates.', createdAt: T1 },
]

export const planReadyEvent: EventView = {
  event,
  run,
  plan,
  approval: null,
  payment: null,
  attempts: [],
  progress,
}

export const bookedEvent: EventView = {
  event: { ...event, status: 'booked', progressSequence: 6 },
  run,
  plan,
  approval,
  payment,
  attempts: [commit('act_sim_venue', 30000), commit('act_sim_item', 1500)],
  progress: [
    ...progress,
    { eventId: 'evt_sim_1', sequence: 4, actor: 'customer', message: 'Approved and paid (simulated).', createdAt: T1 },
    { eventId: 'evt_sim_1', sequence: 5, actor: 'agent', message: 'Booked the venue.', createdAt: T2 },
    { eventId: 'evt_sim_1', sequence: 6, actor: 'agent', message: 'Bought the plates.', createdAt: T2 },
  ],
}

export const canceledEvent: EventView = {
  event: { ...bookedEvent.event, status: 'canceled', cancelRequestedAt: T2, progressSequence: 9 },
  run,
  plan,
  approval,
  payment: { ...payment, refundId: 're_sim_1', refundState: 'pending', refundReason: 'customer_cancellation' },
  attempts: [
    ...bookedEvent.attempts,
    cancel('act_sim_venue', 30000),
    cancel('act_sim_item', 1500),
  ],
  progress: [
    ...bookedEvent.progress,
    { eventId: 'evt_sim_1', sequence: 7, actor: 'customer', message: 'Requested cancellation.', createdAt: T2 },
    { eventId: 'evt_sim_1', sequence: 8, actor: 'agent', message: 'Canceled both commitments.', createdAt: T2 },
    { eventId: 'evt_sim_1', sequence: 9, actor: 'system', message: 'Refund requested; provider status is pending.', createdAt: T2 },
  ],
}
