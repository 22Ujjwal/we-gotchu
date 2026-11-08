import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createTestPlanningRepository } from '../db/client'
import type { PlanningRecord } from './repository'
import { acceptIncomingReply, interpretReply } from './replies'

let db: Awaited<ReturnType<typeof createTestPlanningRepository>>
const venue = { id: 'venue', kind: 'venue' as const, name: 'Test Room', url: 'https://example.com', why: 'Room', facts: [], unknowns: [] }
const incoming = { provider: 'controlled', messageId: 'reply-1', threadId: 'thread-1', inReplyTo: 'sent-1',
  from: 'venue@example.com', to: ['planner@example.com'], subject: 'Re: Inquiry', text: 'Can you confirm the start time?',
  receivedAt: '2026-11-08T10:00:00Z', originalRef: 'controlled:reply-1', mode: 'simulated' as const }
const question = { kind: 'question', summary: 'The venue needs a start time.', nextAction: 'Confirm your start time.',
  facts: [], missing: ['Start time'] }
beforeEach(async () => {
  db = await createTestPlanningRepository()
  const record: PlanningRecord = { id: 'conversation', customerId: 'customer', createRequestId: 'create', initialMessage: 'Party',
    revision: 0, sessionId: null, sequence: 0, pending: null, requests: {}, view: {
      id: 'conversation', version: 0, status: 'ready', messages: [], proposal: null, selections: [venue], progress: null, error: null,
      inquiry: { id: 'inquiry', revision: 1, status: 'draft', recipient: incoming.from, subject: 'Inquiry', text: 'Our party',
        venue, contextMessageIds: [], contactSourceUrl: null, updatedAt: '2026-11-08T09:00:00Z', delivery: {
          status: 'accepted', requestId: 'send', draftRevision: 1, approvedAt: '2026-11-08T09:00:00Z', expiresAt: 0,
          messageId: 'sent-1', threadId: 'thread-1', acceptedAt: '2026-11-08T09:00:01Z',
        } },
    } }
  await db.repository.insert(record)
})
afterEach(async () => db.close())
const target = { customerId: 'customer', conversationId: 'conversation', inquiryId: 'inquiry' }

test('persists a correlated reply before interpretation and deduplicates concurrent deliveries', async () => {
  const results = await Promise.all([acceptIncomingReply(db.repository, target, incoming), acceptIncomingReply(db.repository, target, incoming)])
  expect(results[0].id).toBe(results[1].id)
  let record = (await db.repository.get('customer', 'conversation'))!
  expect(record.view.inquiry?.replies).toHaveLength(1)
  expect(record.view.inquiry?.replies?.[0]).toMatchObject({ status: 'received', message: incoming })
  const interpret = vi.fn(async () => question)
  await interpretReply(db.repository, target, results[0].id, interpret)
  await interpretReply(db.repository, target, results[0].id, interpret)
  record = (await db.repository.get('customer', 'conversation'))!
  expect(record.view.inquiry?.replies?.[0]).toMatchObject({ status: 'ready', interpretation: question })
  expect(record.view.selections).toEqual([venue])
  expect(interpret).toHaveBeenCalledTimes(1)
})

test('rejects a different sender, unrelated provider references, and changed content under the same identity', async () => {
  await expect(acceptIncomingReply(db.repository, target, { ...incoming, from: 'stranger@example.com' })).rejects.toMatchObject({ status: 422 })
  await expect(acceptIncomingReply(db.repository, target, { ...incoming, threadId: 'wrong', inReplyTo: null })).rejects.toMatchObject({ status: 422 })
  await acceptIncomingReply(db.repository, target, incoming)
  await expect(acceptIncomingReply(db.repository, target, { ...incoming, text: 'Changed' })).rejects.toMatchObject({ status: 409 })
})

test('retains failed interpretation and retries from the original message without another email', async () => {
  const reply = await acceptIncomingReply(db.repository, target, incoming)
  await interpretReply(db.repository, target, reply.id, async () => { throw new Error('Provider down') })
  expect((await db.repository.get('customer', 'conversation'))?.view.inquiry?.replies?.[0]).toMatchObject({ status: 'failed', message: incoming })
  await interpretReply(db.repository, target, reply.id, async () => question)
  expect((await db.repository.get('customer', 'conversation'))?.view.inquiry?.replies?.[0].status).toBe('ready')
})

test('rejects extracted facts without supporting text and does not invent currency', async () => {
  const reply = await acceptIncomingReply(db.repository, target, { ...incoming, text: 'The room costs 200. Which date do you want?' })
  await interpretReply(db.repository, target, reply.id, async () => ({ ...question, kind: 'quote',
    facts: [{ field: 'currency', value: 'USD', quote: 'USD 200' }], missing: [] }))
  expect((await db.repository.get('customer', 'conversation'))?.view.inquiry?.replies?.[0].status).toBe('failed')
})
