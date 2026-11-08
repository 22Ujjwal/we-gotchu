import { and, eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type { PlanningInquiry, PlanningOption, PlanningView } from '../../agent/planning/contract'
import { planningConversations, schema } from '../db/schema'

export type PendingWrite = {
  requestId: string
  kind: 'create' | 'message' | 'confirm'
  approval?: { id: string; decision: 'allow' | 'deny' }
  message: string
  selections: PlanningOption[]
  expiresAt: number
}
export type PlanningRecord = {
  id: string
  customerId: string
  createRequestId: string
  initialMessage: string
  revision: number
  sessionId: string | null
  sequence: number
  pending: PendingWrite | null
  requests: Record<string, string>
  view: PlanningView
  paymentHistory?: import('../../agent/planning/offer-contract').PlanningPaymentLink[]
  inquiryHistory?: PlanningInquiry[]
  companyFollowups?: Record<string, { content: { recipient: string; subject: string; text: string }; status: string }>
  companyReplyTurns?: Record<string, { sessionId?: string }>
  companySession?: { id: string; arrangementId: string }
  notifications?: Record<string, { to: string; subject: string; text: string; status: 'uncertain' | 'accepted' | 'failed'; messageId?: string }>
}
export type ReplyJob = { customerId: string; conversationId: string; inquiryId: string; replyId: string }
export interface PlanningRepository {
  getById(id: string): Promise<PlanningRecord | null>
  pendingArrangements?(limit: number): Promise<PlanningRecord[]>
  pendingReplyJobs(limit: number, now: number): Promise<ReplyJob[]>
  get(customerId: string, id: string): Promise<PlanningRecord | null>
  insert(record: PlanningRecord): Promise<PlanningRecord>
  compareAndSet(before: PlanningRecord, after: PlanningRecord): Promise<PlanningRecord | null>
}

export function createPlanningRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>): PlanningRepository {
  const table = planningConversations
  return {
    async pendingArrangements(limit) {
      // Apply eligibility before LIMIT: an idle conversation must not consume the
      // recovery slot forever while a later conversation has a ready reply.
      // A reserved follow-up (including uncertain sends) must never be retried here.
      const rows = await db.select().from(table).where(sql`
        ${table.data}->'view'->'arrangement'->>'status' IN ('requested', 'preparing')
        OR (
          ${table.data}->'view'->'arrangement'->>'status' = 'awaiting_reply'
          AND (${table.data}->>'pending') IS NULL
          AND (${table.data}->'view'->>'paymentLink') IS NULL
          AND ${table.data}->'view'->'inquiry'->'replies'->-1->>'status' = 'ready'
          AND NOT COALESCE(${table.data}->'companyFollowups' ?
            (${table.data}->'view'->'inquiry'->'replies'->-1->>'id'), false)
        )`)
        .limit(Math.max(1, Math.min(5, limit)))
      return rows.map(row => ({ ...row.data, revision: row.revision }))
    },
    // Internal webhook/job lookup; customer HTTP handlers must use the owner-scoped get below.
    async getById(id) {
      const [row] = await db.select().from(table).where(eq(table.id, id))
      return row ? { ...row.data, revision: row.revision } : null
    },
    async pendingReplyJobs(limit, now) {
      const count = Math.max(1, Math.min(25, Math.floor(limit)))
      const rows = await db.select({ data: table.data }).from(table).where(sql`
        jsonb_path_exists(${table.data}, '$.**.replies[*] ? (@.status == "received" || (@.status == "processing" && @.lease.expiresAt <= $now))'::jsonpath,
          jsonb_build_object('now', ${now}::bigint))
      `).limit(count)
      return rows.flatMap(({ data }) => [data.view.inquiry, ...(data.inquiryHistory ?? [])].flatMap(inquiry =>
        inquiry?.replies?.filter(reply => reply.status === 'received'
          || (reply.status === 'processing' && (reply.lease?.expiresAt ?? 0) <= now))
          .map(reply => ({ customerId: data.customerId, conversationId: data.id, inquiryId: inquiry.id, replyId: reply.id })) ?? []
      )).slice(0, count)
    },
    async get(customerId, id) {
      const [row] = await db.select().from(table).where(and(eq(table.id, id), eq(table.customerId, customerId)))
      return row ? { ...row.data, revision: row.revision } : null
    },
    async insert(record) {
      const [inserted] = await db.insert(table).values({
        id: record.id, customerId: record.customerId, createRequestId: record.createRequestId,
        revision: record.revision, data: record,
      }).onConflictDoNothing({ target: [table.customerId, table.createRequestId] }).returning()
      if (inserted) return inserted.data
      const [existing] = await db.select().from(table).where(and(
        eq(table.customerId, record.customerId), eq(table.createRequestId, record.createRequestId),
      ))
      if (!existing) throw new Error('Conversation disappeared after duplicate create.')
      return { ...existing.data, revision: existing.revision }
    },
    async compareAndSet(before, after) {
      const data = { ...after, id: before.id, customerId: before.customerId, revision: before.revision + 1 }
      const [row] = await db.update(table).set({ data, revision: data.revision }).where(and(
        eq(table.id, before.id), eq(table.customerId, before.customerId), eq(table.revision, before.revision),
      )).returning()
      return row ? row.data : null
    },
  }
}
