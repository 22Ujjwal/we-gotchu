import { afterEach, beforeEach, expect, test } from 'vitest'
import { createTestPlanningRepository } from '../db/client'

let db: Awaited<ReturnType<typeof createTestPlanningRepository>>
beforeEach(async () => { db = await createTestPlanningRepository() })
afterEach(async () => db.close())

test('reserves one durable send intent across concurrent callers and retains its result', async () => {
  const intent = { input: { requestId: 'request', conversationId: 'conversation', inquiryId: 'inquiry', draftRevision: 1,
    to: 'venue@example.com', subject: 'Inquiry', text: 'Our party' }, fingerprint: 'hash', idempotencyKey: 'key', inboxId: 'inbox' }
  const results = await Promise.all([db.mail.operations.reserve(intent), db.mail.operations.reserve(intent)])
  expect(results.filter(item => item.created)).toHaveLength(1)
  expect(results[0].operation.id).toBe(results[1].operation.id)
  expect(results[0].operation.result.status).toBe('uncertain')
  const operationId = results[0].operation.id
  const accepted = { operationId, provider: 'agentmail' as const, status: 'accepted' as const, messageId: 'sent', threadId: 'thread', acceptedAt: new Date().toISOString() }
  await db.mail.operations.saveResult(operationId, accepted)
  expect((await db.mail.operations.get(operationId))?.result).toEqual(accepted)
  expect((await db.mail.operations.reserve({ ...intent, fingerprint: 'different' })).operation.fingerprint).toBe('hash')
  expect(await db.mail.references('inbox')).toEqual([{ conversationId: 'conversation', inquiryId: 'inquiry', inboxId: 'inbox', recipient: 'venue@example.com', messageId: 'sent', threadId: 'thread' }])
})

test('deduplicates receipts and fences stale lease writes using database time', async () => {
  const intent = { key: 'key', eventId: 'event', eventType: 'message.received', inboxId: 'inbox', messageId: 'reply',
    rawBody: '{"original":true}', receivedAt: new Date().toISOString(), evidenceMode: 'fixture' as const }
  const first = await db.mail.receipts.record(intent)
  expect(await db.mail.receipts.record({ ...intent, rawBody: 'replacement' })).toEqual(first)
  const past = '2000-01-01T00:00:00Z'
  const future = '2099-01-01T00:00:00Z'
  expect(await db.mail.receipts.claim(first.id, 'expired', past, past)).toBe(true)
  expect(await db.mail.receipts.claim(first.id, 'owner', past, future)).toBe(true)
  expect(await db.mail.receipts.claim(first.id, 'rival', future, future)).toBe(false)
  await expect(db.mail.receipts.complete(first.id, 'expired', { status: 'withheld' })).rejects.toThrow()
  await expect(db.mail.receipts.release(first.id, 'expired')).rejects.toThrow()
  await db.mail.receipts.complete(first.id, 'owner', { status: 'provider_event' })
  expect((await db.mail.receipts.record(intent)).completed).toBe(true)
  expect(await db.mail.receipts.claim(first.id, 'again', past, future)).toBe(false)
})
