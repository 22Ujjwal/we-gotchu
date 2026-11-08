import type { CommerceFacts } from './commerce-types'
import { bigint, bigserial, boolean, index, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import type { IncomingReply } from '../email/supplier-inquiries/incoming-types'
import type { EventBrief } from './brief'

// Event ledger tables. Prefixed `arrange_` so they sit next to the older
// transaction tables without a name clash. Facts only: there is no status column;
// the customer stage is derived from these rows when an event is read.

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const arrangeEvents = pgTable('arrange_events', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  brief: jsonb('brief').$type<EventBrief>().notNull(),
  contactConsent: boolean('contact_consent').notNull(),
  sessionId: text('session_id'),
  createdAt: ts('created_at').notNull(),
}, (t) => [index('arrange_events_customer_idx').on(t.customerId)])

export const arrangeSupplierContacts = pgTable('arrange_supplier_contacts', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => arrangeEvents.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  kind: text('kind').notNull(),
  createdAt: ts('created_at').notNull(),
}, (t) => [unique('arrange_contacts_event_email_unique').on(t.eventId, t.email)])

// Outbound supplier email. State: authorized -> unknown (reserved for sending)
// -> sent | rejected; unknown may also be final until reconciled.
export const arrangeMailOperations = pgTable('arrange_mail_operations', {
  id: text('id').primaryKey(),
  seq: bigserial('seq', { mode: 'number' }).notNull(),
  eventId: text('event_id').notNull().references(() => arrangeEvents.id),
  contactId: text('contact_id').notNull().references(() => arrangeSupplierContacts.id),
  operationKey: text('operation_key').notNull(),
  recipient: text('recipient').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  replyToMessageId: text('reply_to_message_id'),
  state: text('state').notNull(),
  fingerprint: text('fingerprint'),
  idempotencyKey: text('idempotency_key'),
  inboxId: text('inbox_id'),
  messageId: text('message_id'),
  threadId: text('thread_id'),
  rejectCode: text('reject_code'),
  sentAt: ts('sent_at'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
}, (t) => [unique('arrange_mail_operations_key_unique').on(t.eventId, t.operationKey)])

// Inbound AgentMail events, one row per logical message (see incoming.ts key).
// The receipt columns are the ported PR #70 receipt store; event_id onward are
// the ledger's facts about the reply once it is matched.
export const arrangeMailReceipts = pgTable('arrange_mail_receipts', {
  id: text('id').primaryKey(),
  seq: bigserial('seq', { mode: 'number' }).notNull(),
  key: text('key').notNull().unique('arrange_mail_receipts_key_unique'),
  providerEventId: text('provider_event_id').notNull(),
  eventType: text('event_type').notNull(),
  inboxId: text('inbox_id').notNull(),
  messageId: text('message_id').notNull(),
  rawBody: text('raw_body').notNull(),
  evidenceMode: text('evidence_mode').notNull(),
  receivedAt: ts('received_at').notNull(),
  reply: jsonb('reply').$type<IncomingReply>(),
  completed: boolean('completed').notNull().default(false),
  leaseToken: text('lease_token'),
  leaseUntil: ts('lease_until'),
  outcome: jsonb('outcome'),
  eventId: text('event_id').references(() => arrangeEvents.id),
  contactId: text('contact_id').references(() => arrangeSupplierContacts.id),
  operationId: text('operation_id').references(() => arrangeMailOperations.id),
  deliveryState: text('delivery_state'),
  deliveredAt: ts('delivered_at'),
})

export const arrangeSupplierTerms = pgTable('arrange_supplier_terms', {
  id: text('id').primaryKey(),
  seq: bigserial('seq', { mode: 'number' }).notNull(),
  eventId: text('event_id').notNull().references(() => arrangeEvents.id),
  receiptId: text('receipt_id').notNull().references(() => arrangeMailReceipts.id),
  term: text('term').notNull(),
  amountMinor: bigint('amount_minor', { mode: 'number' }),
  currency: text('currency'),
  note: text('note'),
  excerpt: text('excerpt').notNull(),
  createdAt: ts('created_at').notNull(),
})

export const arrangeUpdates = pgTable('arrange_updates', {
  id: text('id').primaryKey(),
  seq: bigserial('seq', { mode: 'number' }).notNull(),
  eventId: text('event_id').notNull().references(() => arrangeEvents.id),
  kind: text('kind').notNull(),
  text: text('text').notNull(),
  createdAt: ts('created_at').notNull(),
})

export const arrangeCommerce = pgTable('arrange_commerce', {
  eventId: text('event_id').primaryKey().references(() => arrangeEvents.id),
  facts: jsonb('facts').$type<CommerceFacts>().notNull(),
})
