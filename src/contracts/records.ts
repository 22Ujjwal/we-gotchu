import { z } from 'zod'

// Contract 0.4 draft. See docs/contracts-draft.md. This file imports only zod,
// so browser code, the agent and the backend can all use it.
export const CONTRACT_VERSION = '0.4'

export const Mode = z.enum(['live', 'test', 'simulated'])
export type Mode = z.infer<typeof Mode>

const Id = z.string().min(1)
const Timestamp = z.iso.datetime()
const Minor = z.number().int().nonnegative()
const Currency = z.string().length(3)

export const CancellationTerms = z.object({
  known: z.boolean(),
  summary: z.string().optional(),
  sourceUrl: z.url().optional(),
})
export type CancellationTerms = z.infer<typeof CancellationTerms>

export const Brief = z.object({
  eventType: z.string().min(1),
  location: z.string().min(1),
  startsAt: Timestamp,
  endsAt: Timestamp.optional(),
  timezone: z.string().min(1),
  headcount: z.number().int().positive(),
  budget: Minor,
  currency: Currency,
  supplyNeeds: z.array(z.string().min(1)),
  maximumCancellationLoss: Minor,
}).refine((brief) => !brief.endsAt || Date.parse(brief.endsAt) > Date.parse(brief.startsAt), {
  path: ['endsAt'], message: 'End time must be after start time.',
})
export type Brief = z.infer<typeof Brief>

// What the backend gives the research workflow (Tony's startResearch input).
export const ResearchInput = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  eventId: Id,
  briefRevision: z.number().int().positive(),
  runId: Id,
  brief: Brief,
})
export type ResearchInput = z.infer<typeof ResearchInput>

export const Verification = z.object({
  status: z.enum(['known', 'unknown', 'conflict']),
  sourceUrl: z.url().optional(),
  note: z.string().optional(),
})

// Where a claim came from. "detail" is a supplier page or API beyond a search listing.
export const SourceRef = z.object({
  url: z.url(),
  tool: z.string().min(1),
  stage: z.enum(['discovery', 'detail', 'quote']),
  retrievedAt: Timestamp,
})

export const Candidate = z.object({
  candidateId: Id,
  name: z.string().min(1),
  kind: z.enum(['venue', 'supply']),
  supplierId: Id.optional(),
  // A category page is a discovery lead, never a candidate.
  sources: z.array(SourceRef).min(1),
  observedAt: Timestamp,
  evidenceMode: z.enum(['live', 'simulated']),
  priceEstimate: Minor.nullable(),
  priceProvenance: z.enum(['quote', 'supplier_listing', 'estimate']),
  taxesAndDelivery: z.enum(['included', 'excluded', 'unknown']),
  quantityInfo: z
    .object({ needed: z.number().int().positive(), packSize: z.number().int().positive(), packs: z.number().int().positive() })
    .optional(),
  cancellationTerms: CancellationTerms,
  verification: z.record(z.string(), Verification),
  affiliateDisclosure: z.string().optional(),
  whyChosenOrRejected: z.string().min(1),
})
export type Candidate = z.infer<typeof Candidate>

export const PlannedAction = z.object({
  actionId: Id,
  kind: z.enum(['venue_booking', 'item_purchase']),
  supplierName: z.string().min(1),
  target: z.string().min(1),
  quantityOrSchedule: z.string().min(1),
  maximumAmount: Minor,
  cancellationTerms: CancellationTerms,
  sourceUrl: z.url(),
  dependsOn: z.array(Id),
  mode: Mode,
})
export type PlannedAction = z.infer<typeof PlannedAction>

export const ResearchOutcome = z.enum(['success', 'partial', 'awaiting_input', 'failed', 'canceled'])
export const BudgetFit = z.enum(['within', 'over', 'unknown'])

export const Recommendation = z.object({
  candidateId: Id,
  rank: z.number().int().positive(),
  matched: z.array(z.string()),
  unmet: z.array(z.string()),
  unchecked: z.array(z.string()),
})

// What was checked and why a field is still unknown. Research never contacts suppliers.
export const SourceCheck = z.object({
  url: z.url(),
  tool: z.string().min(1),
  candidateId: Id.optional(),
  outcome: z.enum(['ok', 'failed', 'absent']),
  missingFields: z.array(z.string()),
  reason: z.string().optional(),
})

// The output of one research run. Read-only: it is NOT a bookable plan and
// nothing can be approved from it directly. The backend derives a Plan from it.
export const ResearchResult = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  eventId: Id,
  briefRevision: z.number().int().positive(),
  runId: Id,
  outcome: ResearchOutcome,
  missing: z.array(z.string()),
  candidates: z.array(Candidate),
  recommendations: z.array(Recommendation),
  budgetFit: BudgetFit,
  budgetBasis: z.string(),
  currency: Currency,
  warnings: z.array(z.string()),
  sourceChecks: z.array(SourceCheck),
  // Set by the backend when a newer brief revision exists.
  superseded: z.boolean(),
  createdAt: Timestamp,
})
export type ResearchResult = z.infer<typeof ResearchResult>

// A bookable proposal derived from a ResearchResult by the backend.
// This is the glossary's "Event plan", not a booking confirmation or an approval.
export const Plan = z.object({
  planningOffer: z.object({ conversationId: Id, offerId: Id, revision: z.number().int().positive(), expiresAt: Timestamp.nullable() }).optional(),
  planId: Id,
  eventId: Id,
  contractVersion: z.literal(CONTRACT_VERSION),
  briefRevision: z.number().int().positive(),
  revision: z.number().int().positive(),
  runId: Id,
  selectedCandidateIds: z.array(Id).min(1),
  actions: z.array(PlannedAction).min(1),
  total: Minor,
  currency: Currency,
  serviceFee: z.literal(0),
  cancellationTerms: z.string(),
  agentReasoning: z.string(),
  mode: Mode,
  budgetFit: z.literal('within'),
  budgetBasis: z.string(),
  warnings: z.array(z.string()),
})
export type Plan = z.infer<typeof Plan>

export const EventStatus = z.enum([
  'researching',
  'needs_input',
  'researched',
  'plan_ready',
  'awaiting_payment',
  'executing',
  'booked',
  'partially_booked',
  'canceling',
  'canceled',
  'failed',
])
export type EventStatus = z.infer<typeof EventStatus>

export const Event = z.object({
  eventId: Id,
  customerId: Id,
  brief: Brief,
  briefRevision: z.number().int().positive(),
  status: EventStatus,
  planRevision: z.number().int().nonnegative(),
  cancelRequestedAt: Timestamp.nullable(),
  progressSequence: z.number().int().nonnegative(),
  createdAt: Timestamp,
})
export type Event = z.infer<typeof Event>

export const Run = z.object({
  runId: Id,
  eventId: Id,
  phase: z.enum(['research', 'execute', 'cancel']),
  briefRevision: z.number().int().positive(),
  idempotencyKey: Id,
  naiveSessionId: Id.nullable(),
  lastSequence: z.number().int().nonnegative(),
  state: z.enum(['running', 'awaiting_input', 'succeeded', 'partial', 'failed', 'canceled', 'unknown']),
  // Single-flight lease so concurrent polls do not advance the same run twice.
  advancingUntil: Timestamp.nullable(),
  // At most one corrective message per run; written in the same update that sends it.
  correctionsUsed: z.number().int().min(0).max(1),
  createdAt: Timestamp,
})
export type Run = z.infer<typeof Run>

export const Approval = z.object({
  approvalId: Id,
  eventId: Id,
  planId: Id,
  planRevision: z.number().int().positive(),
  actionIds: z.array(Id).min(1),
  approvedTotal: Minor,
  currency: Currency,
  approvedAt: Timestamp,
  expiresAt: Timestamp,
  revokedAt: Timestamp.nullable(),
})
export type Approval = z.infer<typeof Approval>

export const Payment = z.object({
  paymentId: Id,
  approvalId: Id,
  checkoutSessionId: Id,
  paymentIntentId: Id.nullable(),
  amount: Minor,
  currency: Currency,
  state: z.enum(['pending', 'paid', 'expired']),
  refundId: Id.nullable(),
  refundState: z.enum(['none', 'pending', 'succeeded', 'failed']),
  refundReason: z.string().nullable(),
  mode: Mode,
})
export type Payment = z.infer<typeof Payment>

export const AttemptState = z.enum(['pending', 'running', 'succeeded', 'failed', 'unknown', 'skipped'])
export type AttemptState = z.infer<typeof AttemptState>

export const Evidence = z.object({
  providerReference: z.string().min(1),
  confirmation: z.string().optional(),
})

export const Attempt = z.object({
  attemptId: Id,
  eventId: Id,
  actionId: Id,
  approvalId: Id,
  kind: z.enum(['commit', 'cancel']),
  executionKey: Id,
  state: AttemptState,
  providerReference: z.string().nullable(),
  actualAmount: Minor.nullable(),
  evidence: Evidence.nullable(),
  errorReason: z.string().nullable(),
  mode: Mode,
  updatedAt: Timestamp,
})
export type Attempt = z.infer<typeof Attempt>

export const ProgressEntry = z.object({
  eventId: Id,
  sequence: z.number().int().positive(),
  actor: z.enum(['agent', 'customer', 'system']),
  message: z.string().min(1),
  createdAt: Timestamp,
})
export type ProgressEntry = z.infer<typeof ProgressEntry>

// Shape returned by GET /api/events/:id for the frontend.
export const EventView = z.object({
  event: Event,
  run: Run.nullable(),
  researchResult: ResearchResult.nullable(),
  plan: Plan.nullable(),
  approval: Approval.nullable(),
  payment: Payment.nullable(),
  attempts: z.array(Attempt),
  progress: z.array(ProgressEntry),
})
export type EventView = z.infer<typeof EventView>
