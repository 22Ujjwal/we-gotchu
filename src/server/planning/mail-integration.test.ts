import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { processReplyJobs } from './reply-worker'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createTestPlanningRepository } from '../db/client'
import { createPlanningMail } from './mail-integration'
import type { PlanningRecord } from './repository'

let db: Awaited<ReturnType<typeof createTestPlanningRepository>>
let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'planning-mail-'))
  db = await createTestPlanningRepository(directory)
})
afterEach(async () => {
  await db.close()
  await rm(directory, { recursive: true, force: true })
})

test('transport receipt atomically queues one reply and does not run interpretation inside acknowledgement', async () => {
  const inquiry = { id: 'inquiry', revision: 1, status: 'draft' as const, recipient: 'venue@example.com', subject: 'Inquiry', text: 'Party',
    venue: { id: 'v', kind: 'venue' as const, name: 'Room', url: 'https://example.com', why: 'Room', facts: [], unknowns: [] },
    contactSourceUrl: null, contextMessageIds: [], updatedAt: new Date().toISOString(), delivery: { status: 'accepted' as const,
      requestId: 'send', draftRevision: 1, approvedAt: new Date().toISOString(), expiresAt: 0, messageId: 'sent', threadId: 'thread' } }
  const record: PlanningRecord = { id: 'conversation', customerId: 'customer', createRequestId: 'create', initialMessage: 'Party', revision: 0,
    sessionId: null, sequence: 0, pending: null, requests: {}, view: { id: 'conversation', version: 0, status: 'ready', messages: [],
      proposal: null, selections: [inquiry.venue], inquiry, progress: null, error: null } }
  await db.repository.insert(record)
  const provider = { inboxId: 'inbox', send: vi.fn(async () => ({ messageId: 'sent', threadId: 'thread' })), getMessage: vi.fn() }
  const mail = createPlanningMail({ repository: db.repository, storage: db.mail, provider, secret: 'unused', evidenceMode: 'fixture' })
  const sent = await mail.transport.sendInquiry({ requestId: 'send', conversationId: 'conversation', inquiryId: 'inquiry', draftRevision: 1,
    to: 'venue@example.com', subject: 'Inquiry', text: 'Party' })
  expect(sent).toMatchObject({ status: 'accepted', threadId: 'thread' })
  const raw = JSON.stringify({ type: 'event', event_id: 'event', event_type: 'message.received', message: { inbox_id: 'inbox', message_id: 'reply',
    thread_id: 'thread', in_reply_to: 'sent', from: 'venue@example.com', to: ['planner@example.com'], subject: 'Re: Inquiry',
    text: 'Which time?', timestamp: new Date().toISOString() } })
  expect(await mail.receiver.receive(raw)).toBe('processed')
  expect(await mail.receiver.receive(raw)).toBe('duplicate')
  const saved = (await db.repository.getById('conversation'))!
  expect(saved.view.inquiry?.replies).toHaveLength(1)
  expect(saved.view.inquiry?.replies?.[0]).toMatchObject({ status: 'received', receiptId: expect.any(String), message: { mode: 'simulated' } })
  expect(await db.repository.pendingReplyJobs(10, Date.now())).toHaveLength(1)
  expect(provider.send).toHaveBeenCalledTimes(1)

  await db.close()
  db = await createTestPlanningRepository(directory)
  const restarted = createPlanningMail({ repository: db.repository, storage: db.mail, provider, secret: 'unused', evidenceMode: 'fixture' })
  expect(await restarted.receiver.receive(raw)).toBe('duplicate')
  const interpret = vi.fn(async () => ({ kind: 'question', summary: 'The venue asks for the time.',
    nextAction: 'Confirm the event time.', facts: [], missing: ['Event time'] }))
  expect(await processReplyJobs(db.repository, interpret)).toEqual({ processed: 1 })
  expect(await processReplyJobs(db.repository, interpret)).toEqual({ processed: 0 })
  expect(interpret).toHaveBeenCalledTimes(1)
  const restored = (await db.repository.getById('conversation'))!
  expect(restored.view.inquiry?.replies?.[0]).toMatchObject({ status: 'ready', message: { text: 'Which time?' } })
  expect(restored.view.selections).toEqual([inquiry.venue])
  expect(provider.send).toHaveBeenCalledTimes(1)
})
