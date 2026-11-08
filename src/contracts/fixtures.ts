import { CONTRACT_VERSION, type Approval, type Attempt, type EventView, type Payment, type Plan, type ResearchResult } from './records'
import { buildPlanFromResult } from './rules'

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

const src = (url: string, stage: 'discovery' | 'detail' | 'quote') => ({
  url,
  tool: 'simulated-research',
  stage,
  retrievedAt: T0,
})

export const researchResult: ResearchResult = {
  contractVersion: CONTRACT_VERSION,
  eventId: 'evt_sim_1',
  briefRevision: 1,
  runId: 'run_sim_research',
  outcome: 'success',
  missing: [],
  candidates: [
    {
      candidateId: 'cand_venue_a',
      name: 'Harbor Loft (simulated)',
      kind: 'venue',
      supplierId: 'sup_harbor_loft',
      sources: [src('https://example.com/venue-a', 'discovery'), src('https://example.com/venue-a/terms', 'detail')],
      observedAt: T0,
      evidenceMode: 'simulated',
      priceEstimate: 30000,
      priceProvenance: 'quote',
      taxesAndDelivery: 'unknown',
      cancellationTerms: terms(true),
      verification: {
        capacity: { status: 'known', sourceUrl: 'https://example.com/venue-a' },
        availability: { status: 'unknown', note: 'No date-specific availability found.' },
      },
      whyChosenOrRejected: 'Fits 20 guests and the budget; cancellation terms are stated.',
    },
    {
      candidateId: 'cand_venue_b',
      name: 'Garden Room (simulated)',
      kind: 'venue',
      sources: [src('https://example.com/venue-b', 'discovery')],
      observedAt: T0,
      evidenceMode: 'simulated',
      priceEstimate: null,
      priceProvenance: 'estimate',
      taxesAndDelivery: 'unknown',
      cancellationTerms: terms(false),
      verification: { price: { status: 'unknown' } },
      whyChosenOrRejected: 'Price and cancellation terms could not be verified.',
    },
    {
      candidateId: 'cand_item_plates',
      name: 'Paper plates, 8-pack (simulated)',
      kind: 'supply',
      sources: [src('https://example.com/plates', 'detail')],
      observedAt: T0,
      evidenceMode: 'simulated',
      priceEstimate: 1500,
      priceProvenance: 'supplier_listing',
      taxesAndDelivery: 'unknown',
      quantityInfo: { needed: 20, packSize: 8, packs: 3 },
      cancellationTerms: terms(true),
      verification: { quantity: { status: 'known' } },
      affiliateDisclosure: 'Simulated listing; no affiliate link.',
      whyChosenOrRejected: 'Three packs cover 20 guests.',
    },
  ],
  recommendations: [
    { candidateId: 'cand_venue_a', rank: 1, matched: ['capacity', 'budget', 'cancellation'], unmet: [], unchecked: ['availability', 'taxes'] },
    { candidateId: 'cand_venue_b', rank: 2, matched: ['capacity'], unmet: [], unchecked: ['price', 'cancellation'] },
    { candidateId: 'cand_item_plates', rank: 1, matched: ['quantity', 'cancellation'], unmet: [], unchecked: ['delivery'] },
  ],
  budgetFit: 'within',
  budgetBasis: 'Venue quote 30000 plus supplies 1500 is 31500, under the 50000 budget; taxes and delivery are not included.',
  currency: 'usd',
  warnings: ['Date-specific venue availability is unverified.'],
  sourceChecks: [
    { url: 'https://example.com/venue-a/terms', tool: 'simulated-research', candidateId: 'cand_venue_a', outcome: 'ok', missingFields: ['availability'] },
    { url: 'https://example.com/venue-b', tool: 'simulated-research', candidateId: 'cand_venue_b', outcome: 'absent', missingFields: ['price', 'cancellation'], reason: 'Page has no pricing or terms.' },
  ],
  superseded: false,
  createdAt: T0,
}

const built = buildPlanFromResult({
  result: researchResult,
  brief,
  planId: 'plan_sim_1',
  revision: 1,
  actionIds: { cand_venue_a: 'act_sim_venue', cand_item_plates: 'act_sim_item' },
  executionMode: 'simulated',
})
if (!built.ok) throw new Error(`fixture plan failed to build: ${built.reason}`)
const plan: Plan = built.plan

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
  advancingUntil: null,
  correctionsUsed: 0,
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
  researchResult,
  plan,
  approval: null,
  payment: null,
  attempts: [],
  progress,
}

export const bookedEvent: EventView = {
  event: { ...event, status: 'booked', progressSequence: 6 },
  run,
  researchResult,
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
  researchResult,
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
