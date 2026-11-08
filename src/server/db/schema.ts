import type { ResearchCheckpoint } from '../research-checkpoint'
import { bigint, bigserial, boolean, check, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { Attempt, Brief, Plan, ResearchResult } from '../../contracts'

// Drizzle schema for the transaction service (contract 0.4).
// Keep in sync with BOOTSTRAP_SQL in migrate.ts; store.test.ts exercises every table.
// Nested contract objects are stored as jsonb; columns exist for anything a
// conditional write or a uniqueness constraint has to look at.

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id').notNull(),
    brief: jsonb('brief').$type<Brief>().notNull(),
    briefRevision: integer('brief_revision').notNull(),
    status: text('status').notNull(),
    planRevision: integer('plan_revision').notNull().default(0),
    cancelRequestedAt: ts('cancel_requested_at'),
    progressSequence: integer('progress_sequence').notNull().default(0),
    createdAt: ts('created_at').notNull(),
  },
)

export const runs = pgTable(
  'runs',
  {
    id: text('id').primaryKey(),
    // Insertion order; created_at can tie within one millisecond.
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    phase: text('phase').notNull(),
    briefRevision: integer('brief_revision').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique('runs_idempotency_key_unique'),
    naiveSessionId: text('naive_session_id'),
    lastSequence: integer('last_sequence').notNull().default(0),
    state: text('state').notNull(),
    advancingUntil: ts('advancing_until'),
    researchCheckpoint: jsonb('research_checkpoint').$type<ResearchCheckpoint>(),
    correctionsUsed: integer('corrections_used').notNull().default(0),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [check('runs_corrections_used_check', sql`${t.correctionsUsed} between 0 and 1`)],
)

export const researchResults = pgTable('research_results', {
  runId: text('run_id')
    .primaryKey()
    .references(() => runs.id),
  seq: bigserial('seq', { mode: 'number' }).notNull(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id),
  briefRevision: integer('brief_revision').notNull(),
  outcome: text('outcome').notNull(),
  superseded: boolean('superseded').notNull().default(false),
  // The full ResearchResult; `superseded` above is authoritative.
  data: jsonb('data').$type<ResearchResult>().notNull(),
  createdAt: ts('created_at').notNull(),
})

export const plans = pgTable(
  'plans',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    revision: integer('revision').notNull(),
    briefRevision: integer('brief_revision').notNull(),
    runId: text('run_id').notNull(),
    // Set when a brief change drops an unapproved plan.
    dropped: boolean('dropped').notNull().default(false),
    data: jsonb('data').$type<Plan>().notNull(),
  },
  (t) => [unique('plans_event_revision_unique').on(t.eventId, t.revision)],
)

export const approvals = pgTable('approvals', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id),
  planId: text('plan_id')
    .notNull()
    .references(() => plans.id),
  planRevision: integer('plan_revision').notNull(),
  actionIds: jsonb('action_ids').$type<string[]>().notNull(),
  approvedTotal: bigint('approved_total', { mode: 'number' }).notNull(),
  currency: text('currency').notNull(),
  approvedAt: ts('approved_at').notNull(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
})

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  approvalId: text('approval_id')
    .notNull()
    .unique('payments_approval_id_unique')
    .references(() => approvals.id),
  checkoutSessionId: text('checkout_session_id').notNull().unique('payments_checkout_session_id_unique'),
  paymentIntentId: text('payment_intent_id'),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  currency: text('currency').notNull(),
  state: text('state').notNull(),
  refundId: text('refund_id'),
  refundState: text('refund_state').notNull().default('none'),
  refundReason: text('refund_reason'),
  mode: text('mode').notNull(),
})

export const attempts = pgTable('attempts', {
  id: text('id').primaryKey(),
  seq: bigserial('seq', { mode: 'number' }).notNull(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id),
  actionId: text('action_id').notNull(),
  approvalId: text('approval_id').notNull(),
  kind: text('kind').notNull(),
  executionKey: text('execution_key').notNull().unique('attempts_execution_key_unique'),
  state: text('state').notNull(),
  providerReference: text('provider_reference'),
  actualAmount: bigint('actual_amount', { mode: 'number' }),
  evidence: jsonb('evidence').$type<Attempt['evidence']>(),
  errorReason: text('error_reason'),
  mode: text('mode').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const progressEntries = pgTable(
  'progress_entries',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    sequence: integer('sequence').notNull(),
    actor: text('actor').notNull(),
    message: text('message').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [primaryKey({ name: 'progress_entries_pkey', columns: [t.eventId, t.sequence] })],
)

export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  receivedAt: ts('received_at').notNull(),
})

export const schema = { events, runs, researchResults, plans, approvals, payments, attempts, progressEntries, stripeEvents }
