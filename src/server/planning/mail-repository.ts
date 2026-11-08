import { randomUUID } from 'node:crypto'
import { and, eq, or, isNull, lte, sql, type SQL } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { schema, supplierMailOperations as operationsTable, supplierMailReceipts as receiptsTable } from '../db/schema'
import type { OperationRepository, SendOperation } from '../email/supplier-inquiries/types'
import type { IncomingReceipt, InquiryReference, ReceiptRepository } from '../email/supplier-inquiries/incoming-types'

export function createSupplierMailRepositories(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  const operations: OperationRepository = {
    async reserve(intent) {
      const id = `mailop_${randomUUID()}`
      const operation: SendOperation = { ...intent, id, result: { status: 'uncertain', operationId: id, provider: 'agentmail' } }
      const [created] = await db.insert(operationsTable).values({ id, requestId: intent.input.requestId, data: operation })
        .onConflictDoNothing({ target: operationsTable.requestId }).returning()
      if (created) return { created: true, operation: created.data }
      const [existing] = await db.select().from(operationsTable).where(eq(operationsTable.requestId, intent.input.requestId))
      if (!existing) throw new Error('Reserved mail operation could not be read.')
      return { created: false, operation: existing.data }
    },
    async get(id) {
      const [row] = await db.select().from(operationsTable).where(eq(operationsTable.id, id))
      return row?.data ?? null
    },
    async saveResult(id, result) {
      if (result.operationId !== id) throw new Error('Mail operation identity mismatch.')
      const rows = await db.update(operationsTable).set({
        data: sql`${operationsTable.data} || ${JSON.stringify({ result })}::jsonb`, updatedAt: sql`now()`,
      }).where(eq(operationsTable.id, id)).returning({ id: operationsTable.id })
      if (!rows.length) throw new Error('Mail operation not found.')
    },
  }
  async function fenced(id: string, token: string, changes: { completed?: boolean; outcome?: unknown; leaseToken?: string | null; leaseUntil?: Date | null; data?: IncomingReceipt | SQL }) {
    const rows = await db.update(receiptsTable).set({ ...changes, updatedAt: sql`now()` }).where(and(
      eq(receiptsTable.id, id), eq(receiptsTable.leaseToken, token), eq(receiptsTable.completed, false),
    )).returning({ id: receiptsTable.id })
    if (!rows.length) throw new Error('Receipt lease no longer belongs to this worker.')
  }
  const receipts: ReceiptRepository = {
    async record(intent) {
      const id = `receipt_${randomUUID()}`
      const data: IncomingReceipt = { ...intent, id, completed: false }
      const [created] = await db.insert(receiptsTable).values({ id, key: intent.key, data })
        .onConflictDoNothing({ target: receiptsTable.key }).returning()
      if (created) return { ...created.data, completed: created.completed }
      const [existing] = await db.select().from(receiptsTable).where(eq(receiptsTable.key, intent.key))
      if (!existing) throw new Error('Recorded receipt could not be read.')
      return { ...existing.data, completed: existing.completed }
    },
    async claim(id, token, _now, until) {
      const rows = await db.update(receiptsTable).set({ leaseToken: token, leaseUntil: new Date(until), updatedAt: sql`now()` })
        .where(and(eq(receiptsTable.id, id), eq(receiptsTable.completed, false),
          or(isNull(receiptsTable.leaseToken), lte(receiptsTable.leaseUntil, sql`now()`))))
        .returning({ id: receiptsTable.id })
      return rows.length === 1
    },
    async saveReply(id, token, reply) {
      await fenced(id, token, { data: sql`${receiptsTable.data} || ${JSON.stringify({ reply })}::jsonb` })
    },
    async complete(id, token, result) { await fenced(id, token, { completed: true, outcome: result, leaseToken: null, leaseUntil: null }) },
    async release(id, token) { await fenced(id, token, { leaseToken: null, leaseUntil: null }) },
  }
  return { operations, receipts,
    async operationForRequest(requestId: string) {
      const [row] = await db.select().from(operationsTable).where(eq(operationsTable.requestId, requestId))
      return row?.data ?? null
    },
    async references(inboxId: string): Promise<InquiryReference[]> {
      const rows = await db.select({ data: operationsTable.data }).from(operationsTable)
        .where(sql`${operationsTable.data}->>'inboxId' = ${inboxId} AND ${operationsTable.data}->'result'->>'messageId' IS NOT NULL`)
      return rows.flatMap(({ data }) => 'messageId' in data.result && data.result.messageId ? [{
        conversationId: data.input.conversationId, inquiryId: data.input.inquiryId, inboxId,
        recipient: data.input.to, messageId: data.result.messageId, threadId: data.result.threadId,
      }] : [])
    },
  }
}
