import { and, eq } from 'drizzle-orm'
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
  inquiryHistory?: PlanningInquiry[]
}
export interface PlanningRepository {
  get(customerId: string, id: string): Promise<PlanningRecord | null>
  insert(record: PlanningRecord): Promise<PlanningRecord>
  compareAndSet(before: PlanningRecord, after: PlanningRecord): Promise<PlanningRecord | null>
}

export function createPlanningRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>): PlanningRepository {
  const table = planningConversations
  return {
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
