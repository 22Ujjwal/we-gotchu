import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type { schema } from '../db/schema'
import { correlateReply } from '../email/supplier-inquiries/incoming'
import type { IncomingReply, InquiryReference, ReceiptRepository } from '../email/supplier-inquiries/incoming-types'
import { InquiryConflict } from '../email/supplier-inquiries/types'
import type { OperationRepository, SendOperation, SendResult } from '../email/supplier-inquiries/types'
import { eventBriefSchema, type EventBrief } from './brief'
import {
  arrangeEvents, arrangeMailOperations, arrangeMailReceipts, arrangeSupplierContacts, arrangeSupplierTerms, arrangeUpdates,
} from './tables'

// The Event ledger stores facts about an event and enforces the rules that guard
// them. It never decides what to do next; the agent does. Every refusal is a
// LedgerRefusal with a stable code the caller can show or relay to the agent.

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export type RefusalCode =
  | 'invalid_brief' | 'unknown_event' | 'not_found' | 'session_conflict'
  | 'no_consent' | 'contact_not_on_event' | 'send_cap_reached' | 'key_conflict'
  | 'unknown_operation' | 'operation_final'
  | 'message_not_on_event' | 'excerpt_not_in_message' | 'money_not_minor_units' | 'no_terms'
  | 'empty_update' | 'invalid_update_kind'

export class LedgerRefusal extends Error {
  constructor(readonly code: RefusalCode, message: string) { super(message) }
}

export type SeedContact = { name: string; email: string; kind: string }
export type Stage = 'getting_started' | 'contacting_suppliers' | 'supplier_replied' | 'negotiating'
export type EmailDraft = { subject: string; body: string }
export type EmailOutcome =
  | { state: 'sent'; messageId: string; threadId?: string; sentAt: Date }
  | { state: 'rejected'; code: string }
  | { state: 'unknown'; messageId?: string; threadId?: string }
export type SupplierTerm = { term: string; amountMinor?: number; currency?: string; note?: string; excerpt: string }
export type UpdateKind = 'progress' | 'question_for_customer'

export type MailOperation = {
  id: string; eventId: string; contactId: string; operationKey: string; recipient: string
  subject: string; body: string; replyToMessageId: string | null
  state: 'authorized' | 'unknown' | 'sent' | 'rejected'
  messageId: string | null; threadId: string | null; rejectCode: string | null
  sentAt: Date | null; createdAt: Date
}

export type EventRecord = {
  id: string
  customerId: string
  brief: EventBrief
  contactConsent: boolean
  sessionId: string | null
  createdAt: Date
  contacts: { id: string; name: string; email: string; kind: string }[]
  sent: MailOperation[]
  received: { id: string; messageId: string; contactId: string; operationId: string | null; from: string; subject: string | null; text: string | null; receivedAt: Date; deliveryState: string | null }[]
  terms: { id: string; messageId: string; contactId: string; term: string; amountMinor: number | null; currency: string | null; note: string | null; excerpt: string; recordedAt: Date }[]
  updates: { id: string; kind: UpdateKind; text: string; createdAt: Date }[]
  stage: Stage
}

const FINAL_STATES = ['sent', 'rejected']
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()

export function createEventLedger(db: Db, opts: { seedContacts: SeedContact[]; sendCap?: number; now?: () => Date }) {
  const now = opts.now ?? (() => new Date())
  const sendCap = opts.sendCap ?? 5
  const newId = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '')}`

  async function requireEvent(eventId: string) {
    const [event] = await db.select().from(arrangeEvents).where(eq(arrangeEvents.id, eventId))
    if (!event) throw new LedgerRefusal('unknown_event', 'There is no event with that id.')
    return event
  }

  async function readEvent(eventId: string): Promise<EventRecord> {
    const event = await requireEvent(eventId)
    const [contacts, ops, receipts, terms, updates] = await Promise.all([
      db.select().from(arrangeSupplierContacts).where(eq(arrangeSupplierContacts.eventId, eventId)).orderBy(asc(arrangeSupplierContacts.createdAt)),
      db.select().from(arrangeMailOperations).where(eq(arrangeMailOperations.eventId, eventId)).orderBy(asc(arrangeMailOperations.seq)),
      db.select().from(arrangeMailReceipts).where(eq(arrangeMailReceipts.eventId, eventId)).orderBy(asc(arrangeMailReceipts.seq)),
      db.select().from(arrangeSupplierTerms).where(eq(arrangeSupplierTerms.eventId, eventId)).orderBy(asc(arrangeSupplierTerms.seq)),
      db.select().from(arrangeUpdates).where(eq(arrangeUpdates.eventId, eventId)).orderBy(asc(arrangeUpdates.seq)),
    ])
    const received = receipts.map(r => ({
      id: r.id, messageId: r.messageId, contactId: r.contactId!, operationId: r.operationId,
      from: r.reply?.from ?? '', subject: r.reply?.subject ?? null, text: r.reply?.text ?? null,
      receivedAt: r.receivedAt, deliveryState: r.deliveryState,
    }))
    const byReceipt = new Map(received.map(r => [r.id, r]))
    const sent = ops.map(toMailOperation)
    const record: Omit<EventRecord, 'stage'> = {
      id: event.id, customerId: event.customerId, brief: event.brief, contactConsent: event.contactConsent,
      sessionId: event.sessionId, createdAt: event.createdAt,
      contacts: contacts.map(c => ({ id: c.id, name: c.name, email: c.email, kind: c.kind })),
      sent, received,
      terms: terms.map(t => ({
        id: t.id, messageId: byReceipt.get(t.receiptId)!.messageId, contactId: byReceipt.get(t.receiptId)!.contactId,
        term: t.term, amountMinor: t.amountMinor, currency: t.currency, note: t.note, excerpt: t.excerpt, recordedAt: t.createdAt,
      })),
      updates: updates.map(u => ({ id: u.id, kind: u.kind as UpdateKind, text: u.text, createdAt: u.createdAt })),
    }
    return { ...record, stage: deriveStage(record) }
  }

  const mailOperations: OperationRepository = {
    // The transport reserves an operation the ledger already authorized. Only
    // one caller can move it from authorized to unknown, so only one sends.
    async reserve(intent) {
      const [claimed] = await db.update(arrangeMailOperations)
        .set({ state: 'unknown', fingerprint: intent.fingerprint, idempotencyKey: intent.idempotencyKey, inboxId: intent.inboxId, updatedAt: now() })
        .where(and(
          eq(arrangeMailOperations.id, intent.input.requestId), eq(arrangeMailOperations.state, 'authorized'),
          eq(arrangeMailOperations.recipient, intent.input.to), eq(arrangeMailOperations.subject, intent.input.subject),
          eq(arrangeMailOperations.body, intent.input.text),
        ))
        .returning()
      if (claimed) return { created: true, operation: toSendOperation(claimed) }
      const [existing] = await db.select().from(arrangeMailOperations).where(eq(arrangeMailOperations.id, intent.input.requestId))
      if (!existing) throw new LedgerRefusal('unknown_operation', 'This email was never authorized.')
      if (existing.state === 'authorized') throw new InquiryConflict()
      return { created: false, operation: toSendOperation(existing) }
    },
    async get(operationId) {
      const [row] = await db.select().from(arrangeMailOperations).where(eq(arrangeMailOperations.id, operationId))
      return row ? toSendOperation(row) : null
    },
    async saveResult(operationId, result) {
      await recordEmailOutcome(operationId, fromSendResult(result))
    },
  }

  const mailReceipts: ReceiptRepository = {
    async record(intent) {
      await db.insert(arrangeMailReceipts).values({
        id: newId('rcp'), key: intent.key, providerEventId: intent.eventId, eventType: intent.eventType,
        inboxId: intent.inboxId, messageId: intent.messageId, rawBody: intent.rawBody,
        evidenceMode: intent.evidenceMode, receivedAt: new Date(intent.receivedAt),
      }).onConflictDoNothing({ target: arrangeMailReceipts.key })
      const [row] = await db.select().from(arrangeMailReceipts).where(eq(arrangeMailReceipts.key, intent.key))
      return {
        id: row.id, key: row.key, eventId: row.providerEventId, eventType: row.eventType, inboxId: row.inboxId,
        messageId: row.messageId, rawBody: row.rawBody, receivedAt: row.receivedAt.toISOString(),
        evidenceMode: row.evidenceMode as 'live' | 'fixture', completed: row.completed, ...(row.reply ? { reply: row.reply } : {}),
      }
    },
    async claim(receiptId, leaseToken, at, leaseUntil) {
      const claimed = await db.update(arrangeMailReceipts).set({ leaseToken, leaseUntil: new Date(leaseUntil) })
        .where(and(eq(arrangeMailReceipts.id, receiptId), eq(arrangeMailReceipts.completed, false),
          or(isNull(arrangeMailReceipts.leaseUntil), lte(arrangeMailReceipts.leaseUntil, new Date(at)))))
        .returning({ id: arrangeMailReceipts.id })
      return claimed.length === 1
    },
    async saveReply(receiptId, leaseToken, reply) {
      await leased(receiptId, leaseToken, { reply })
    },
    async complete(receiptId, leaseToken, result) {
      await leased(receiptId, leaseToken, { completed: true, outcome: result, leaseToken: null, leaseUntil: null })
    },
    async release(receiptId, leaseToken) {
      await db.update(arrangeMailReceipts).set({ leaseToken: null, leaseUntil: null })
        .where(and(eq(arrangeMailReceipts.id, receiptId), eq(arrangeMailReceipts.leaseToken, leaseToken)))
    },
  }

  async function leased(receiptId: string, leaseToken: string, values: Partial<typeof arrangeMailReceipts.$inferInsert>) {
    const rows = await db.update(arrangeMailReceipts).set(values)
      .where(and(eq(arrangeMailReceipts.id, receiptId), eq(arrangeMailReceipts.leaseToken, leaseToken)))
      .returning({ id: arrangeMailReceipts.id })
    if (rows.length !== 1) throw new Error('Lost receipt lease')
  }

  async function recordEmailOutcome(operationId: string, outcome: EmailOutcome): Promise<MailOperation> {
    const [row] = await db.select().from(arrangeMailOperations).where(eq(arrangeMailOperations.id, operationId))
    if (!row) throw new LedgerRefusal('unknown_operation', 'There is no email operation with that id.')
    if (FINAL_STATES.includes(row.state)) throw new LedgerRefusal('operation_final', 'This email already has a final outcome.')
    const values = outcome.state === 'sent'
      ? { state: 'sent', messageId: outcome.messageId, threadId: outcome.threadId ?? null, sentAt: outcome.sentAt }
      : outcome.state === 'rejected'
        ? { state: 'rejected', rejectCode: outcome.code }
        : { state: 'unknown', messageId: outcome.messageId ?? row.messageId, threadId: outcome.threadId ?? row.threadId }
    const [updated] = await db.update(arrangeMailOperations).set({ ...values, updatedAt: now() })
      .where(and(eq(arrangeMailOperations.id, operationId), sql`${arrangeMailOperations.state} not in ('sent', 'rejected')`))
      .returning()
    if (!updated) throw new LedgerRefusal('operation_final', 'This email already has a final outcome.')
    return toMailOperation(updated)
  }

  return {
    mailOperations,
    mailReceipts,
    readEvent,

    async createEvent(customerId: string, brief: unknown, contactConsent: boolean): Promise<{ eventId: string }> {
      const parsed = eventBriefSchema.safeParse(brief)
      if (!parsed.success) throw new LedgerRefusal('invalid_brief', 'The brief is missing something we need.')
      const eventId = newId('evt')
      const createdAt = now()
      await db.transaction(async tx => {
        await tx.insert(arrangeEvents).values({ id: eventId, customerId, brief: parsed.data, contactConsent, createdAt })
        if (opts.seedContacts.length) {
          await tx.insert(arrangeSupplierContacts).values(opts.seedContacts.map(c => ({ id: newId('con'), eventId, name: c.name, email: c.email.toLowerCase(), kind: c.kind, createdAt })))
        }
      })
      return { eventId }
    },

    async attachSession(eventId: string, sessionId: string): Promise<void> {
      const event = await requireEvent(eventId)
      if (event.sessionId === sessionId) return
      if (event.sessionId) throw new LedgerRefusal('session_conflict', 'This event already has a different session.')
      const rows = await db.update(arrangeEvents).set({ sessionId })
        .where(and(eq(arrangeEvents.id, eventId), isNull(arrangeEvents.sessionId))).returning({ sessionId: arrangeEvents.sessionId })
      if (rows.length === 0 && (await requireEvent(eventId)).sessionId !== sessionId) {
        throw new LedgerRefusal('session_conflict', 'This event already has a different session.')
      }
    },

    async readEventView(customerId: string, eventId: string): Promise<EventRecord> {
      const [owner] = await db.select({ customerId: arrangeEvents.customerId }).from(arrangeEvents).where(eq(arrangeEvents.id, eventId))
      // Same refusal for "missing" and "someone else's", so ids can't be probed.
      if (!owner || owner.customerId !== customerId) throw new LedgerRefusal('not_found', 'We could not find that event.')
      return readEvent(eventId)
    },

    async authorizeSupplierEmail(eventId: string, contactId: string, draft: EmailDraft, operationKey: string): Promise<{ operation: MailOperation; replayed: boolean }> {
      return db.transaction(async tx => {
        // Lock the event row so concurrent sends can't both slip under the cap.
        const [event] = await tx.select().from(arrangeEvents).where(eq(arrangeEvents.id, eventId)).for('update')
        if (!event) throw new LedgerRefusal('unknown_event', 'There is no event with that id.')
        const [existing] = await tx.select().from(arrangeMailOperations)
          .where(and(eq(arrangeMailOperations.eventId, eventId), eq(arrangeMailOperations.operationKey, operationKey)))
        if (existing) {
          if (existing.contactId !== contactId || existing.subject !== draft.subject || existing.body !== draft.body) {
            throw new LedgerRefusal('key_conflict', 'This operation key was already used for a different email.')
          }
          return { operation: toMailOperation(existing), replayed: true }
        }
        if (!event.contactConsent) throw new LedgerRefusal('no_consent', 'The customer has not allowed us to contact suppliers.')
        const [contact] = await tx.select().from(arrangeSupplierContacts)
          .where(and(eq(arrangeSupplierContacts.id, contactId), eq(arrangeSupplierContacts.eventId, eventId)))
        if (!contact) throw new LedgerRefusal('contact_not_on_event', 'That contact is not a supplier on this event.')
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(arrangeMailOperations).where(eq(arrangeMailOperations.eventId, eventId))
        if (count >= sendCap) throw new LedgerRefusal('send_cap_reached', `This event has reached its limit of ${sendCap} supplier emails.`)
        // Keep the conversation in one thread: answer the supplier's latest
        // message, or follow up on our latest one.
        const [lastReply] = await tx.select({ messageId: arrangeMailReceipts.messageId }).from(arrangeMailReceipts)
          .where(and(eq(arrangeMailReceipts.eventId, eventId), eq(arrangeMailReceipts.contactId, contactId))).orderBy(desc(arrangeMailReceipts.seq)).limit(1)
        const [lastSent] = await tx.select({ messageId: arrangeMailOperations.messageId }).from(arrangeMailOperations)
          .where(and(eq(arrangeMailOperations.eventId, eventId), eq(arrangeMailOperations.contactId, contactId), eq(arrangeMailOperations.state, 'sent')))
          .orderBy(desc(arrangeMailOperations.seq)).limit(1)
        const at = now()
        const [created] = await tx.insert(arrangeMailOperations).values({
          id: newId('mop'), eventId, contactId, operationKey, recipient: contact.email,
          subject: draft.subject, body: draft.body, replyToMessageId: lastReply?.messageId ?? lastSent?.messageId ?? null,
          state: 'authorized', createdAt: at, updatedAt: at,
        }).returning()
        return { operation: toMailOperation(created), replayed: false }
      })
    },

    recordEmailOutcome,

    async recordInboundEmail(reply: IncomingReply): Promise<{ receiptId: string; matched: boolean; eventId: string | null; operationId: string | null; sessionId: string | null; deliveryState: string | null }> {
      const [receipt] = await db.select().from(arrangeMailReceipts).where(eq(arrangeMailReceipts.id, reply.receiptId))
      if (!receipt) throw new Error('Inbound email must be recorded as a receipt first')
      if (receipt.eventId) {
        const event = await requireEvent(receipt.eventId)
        return { receiptId: receipt.id, matched: true, eventId: receipt.eventId, operationId: receipt.operationId, sessionId: event.sessionId, deliveryState: receipt.deliveryState }
      }
      const referenced = [reply.inReplyTo, ...(reply.references ?? [])].filter((v): v is string => !!v)
      const candidates = await db.select().from(arrangeMailOperations).where(and(
        eq(arrangeMailOperations.inboxId, reply.inboxId),
        or(
          referenced.length ? inArray(arrangeMailOperations.messageId, referenced) : sql`false`,
          reply.threadId ? eq(arrangeMailOperations.threadId, reply.threadId) : sql`false`,
        ),
      ))
      const references: InquiryReference[] = candidates.filter(c => c.messageId).map(c => ({
        conversationId: c.eventId, inquiryId: c.id, inboxId: c.inboxId!, recipient: c.recipient, messageId: c.messageId!, ...(c.threadId ? { threadId: c.threadId } : {}),
      }))
      const match = correlateReply(reply, references)
      if (!match) return { receiptId: receipt.id, matched: false, eventId: null, operationId: null, sessionId: null, deliveryState: null }
      const operation = candidates.find(c => c.id === match.inquiryId)!
      await db.update(arrangeMailReceipts).set({ eventId: operation.eventId, contactId: operation.contactId, operationId: operation.id, deliveryState: 'pending' })
        .where(and(eq(arrangeMailReceipts.id, receipt.id), isNull(arrangeMailReceipts.eventId)))
      const event = await requireEvent(operation.eventId)
      return { receiptId: receipt.id, matched: true, eventId: operation.eventId, operationId: operation.id, sessionId: event.sessionId, deliveryState: 'pending' }
    },

    async recordSessionDelivery(receiptId: string, outcome: 'delivered' | 'failed'): Promise<void> {
      await db.update(arrangeMailReceipts)
        .set(outcome === 'delivered' ? { deliveryState: 'delivered', deliveredAt: now() } : { deliveryState: 'failed' })
        .where(and(eq(arrangeMailReceipts.id, receiptId), sql`${arrangeMailReceipts.deliveryState} is distinct from 'delivered'`))
    },

    async recordSupplierTerms(eventId: string, messageId: string, terms: SupplierTerm[]): Promise<{ recorded: number }> {
      await requireEvent(eventId)
      if (terms.length === 0) throw new LedgerRefusal('no_terms', 'There are no terms to record.')
      const [receipt] = await db.select().from(arrangeMailReceipts)
        .where(and(eq(arrangeMailReceipts.eventId, eventId), eq(arrangeMailReceipts.messageId, messageId)))
      if (!receipt) throw new LedgerRefusal('message_not_on_event', 'That message is not a supplier reply on this event.')
      const body = normalize(receipt.reply?.text ?? '')
      terms.forEach((term, index) => {
        const excerpt = normalize(term.excerpt)
        if (!excerpt || !body.includes(excerpt)) {
          throw new LedgerRefusal('excerpt_not_in_message', `Term ${index + 1} (${term.term}) quotes text that is not in the supplier's email.`)
        }
        const hasAmount = term.amountMinor !== undefined
        if (hasAmount !== (term.currency !== undefined) || (hasAmount && (!Number.isSafeInteger(term.amountMinor) || term.amountMinor! < 0 || !/^[A-Z]{3}$/.test(term.currency!)))) {
          throw new LedgerRefusal('money_not_minor_units', `Term ${index + 1} (${term.term}) needs a whole amount in minor units (cents) together with a 3-letter currency.`)
        }
      })
      const at = now()
      await db.insert(arrangeSupplierTerms).values(terms.map(t => ({
        id: newId('trm'), eventId, receiptId: receipt.id, term: t.term, amountMinor: t.amountMinor ?? null,
        currency: t.currency ?? null, note: t.note ?? null, excerpt: t.excerpt, createdAt: at,
      })))
      return { recorded: terms.length }
    },

    async postUpdate(eventId: string, text: string, kind: UpdateKind): Promise<{ updateId: string }> {
      await requireEvent(eventId)
      if (!text.trim()) throw new LedgerRefusal('empty_update', 'An update needs some text.')
      if (kind !== 'progress' && kind !== 'question_for_customer') throw new LedgerRefusal('invalid_update_kind', 'Updates are either progress or a question for the customer.')
      const updateId = newId('upd')
      await db.insert(arrangeUpdates).values({ id: updateId, eventId, kind, text: text.trim(), createdAt: now() })
      return { updateId }
    },
  }
}

export type EventLedger = ReturnType<typeof createEventLedger>

/** The customer-facing stage, derived from facts each time the event is read. */
export function deriveStage(event: Pick<EventRecord, 'sent' | 'received' | 'terms'>): Stage {
  const sends = event.sent.filter(s => s.state !== 'rejected')
  if (event.received.length === 0) return sends.length ? 'contacting_suppliers' : 'getting_started'
  const firstReply = Math.min(...event.received.map(r => r.receivedAt.getTime()))
  const followedUp = sends.some(s => s.createdAt.getTime() > firstReply)
  return event.terms.length && followedUp ? 'negotiating' : 'supplier_replied'
}

function toMailOperation(row: typeof arrangeMailOperations.$inferSelect): MailOperation {
  return {
    id: row.id, eventId: row.eventId, contactId: row.contactId, operationKey: row.operationKey, recipient: row.recipient,
    subject: row.subject, body: row.body, replyToMessageId: row.replyToMessageId, state: row.state as MailOperation['state'],
    messageId: row.messageId, threadId: row.threadId, rejectCode: row.rejectCode, sentAt: row.sentAt, createdAt: row.createdAt,
  }
}

function toSendOperation(row: typeof arrangeMailOperations.$inferSelect): SendOperation {
  const base = { operationId: row.id, provider: 'agentmail' as const }
  const result: SendResult = row.state === 'sent'
    ? { ...base, status: 'accepted', messageId: row.messageId!, ...(row.threadId ? { threadId: row.threadId } : {}), acceptedAt: row.sentAt!.toISOString() }
    : row.state === 'rejected'
      ? { ...base, status: 'failed', code: row.rejectCode ?? 'rejected', reason: 'Provider rejected the inquiry' }
      : { ...base, status: 'uncertain', ...(row.messageId ? { messageId: row.messageId } : {}), ...(row.threadId ? { threadId: row.threadId } : {}) }
  return {
    id: row.id,
    input: {
      requestId: row.id, conversationId: row.eventId, inquiryId: row.contactId, draftRevision: 0,
      to: row.recipient, subject: row.subject, text: row.body, ...(row.replyToMessageId ? { replyToMessageId: row.replyToMessageId } : {}),
    },
    fingerprint: row.fingerprint ?? '',
    idempotencyKey: row.idempotencyKey ?? '',
    inboxId: row.inboxId ?? '',
    result,
  }
}

function fromSendResult(result: SendResult): EmailOutcome {
  if (result.status === 'accepted') return { state: 'sent', messageId: result.messageId, threadId: result.threadId, sentAt: new Date(result.acceptedAt) }
  if (result.status === 'failed') return { state: 'rejected', code: result.code }
  return { state: 'unknown', messageId: result.messageId, threadId: result.threadId }
}
