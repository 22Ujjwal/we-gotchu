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

test.each([
  { recipient: 'venue@example.com', to: ['planner@example.com'], subject: 'Re: Inquiry' },
  { recipient: 'Venue@Example.com', to: ['planner@example.com'], subject: 'Re: Inquiry' },
  { recipient: 'venue@example.com', to: [], subject: 'Long subject '.repeat(100) },
  { recipient: 'venue@example.com', to: ['undisclosed-recipients:;'], subject: 'Re: Inquiry' },
])('durably queues and deduplicates replies with headers $recipient $to', async ({ recipient, to, subject }) => {
  const inquiry = { id: 'inquiry', revision: 1, status: 'draft' as const, recipient, subject: 'Inquiry', text: 'Party',
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
    to: recipient, subject: 'Inquiry', text: 'Party' })
  expect(sent).toMatchObject({ status: 'accepted', threadId: 'thread' })
  expect(await mail.transport.reconcileInquiry!({ requestId: 'send', conversationId: 'conversation', inquiryId: 'inquiry' })).toEqual(sent)
  expect(await mail.transport.reconcileInquiry!({ requestId: 'send', conversationId: 'other-customer', inquiryId: 'inquiry' })).toBeNull()
  expect(provider.send).toHaveBeenCalledTimes(1)
  const echo = JSON.stringify({ type: 'event', event_id: 'self-send', event_type: 'message.received', message: {
    inbox_id: 'inbox', message_id: 'sent', thread_id: 'thread', from: 'venue@example.com', to: ['venue@example.com'],
    subject: 'Inquiry', text: 'Party', timestamp: new Date().toISOString(),
  } })
  expect(await mail.receiver.receive(echo)).toBe('processed')
  expect(await mail.receiver.receive(echo)).toBe('duplicate')
  expect((await db.repository.getById('conversation'))!.view.inquiry?.replies ?? []).toHaveLength(0)
  expect(await db.repository.pendingReplyJobs(10, Date.now())).toHaveLength(0)
  const raw = JSON.stringify({ type: 'event', event_id: 'event', event_type: 'message.received', message: { inbox_id: 'inbox', message_id: 'reply',
    thread_id: 'thread', in_reply_to: 'sent', from: 'venue@example.com', to, subject,
    text: 'Which time?', timestamp: new Date().toISOString() } })
  expect(await mail.receiver.receive(raw)).toBe('processed')
  expect(await mail.receiver.receive(raw)).toBe('duplicate')
  const saved = (await db.repository.getById('conversation'))!
  expect(saved.view.inquiry?.replies).toHaveLength(1)
  expect(saved.view.inquiry?.replies?.[0]).toMatchObject({ status: 'received', receiptId: expect.any(String), message: { mode: 'simulated', to, subject } })
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

test('queues a reply to an authorized follow-up in a new provider thread', async () => {
  const venue = { id: 'v', kind: 'venue' as const, name: 'Room', url: 'https://example.com', why: 'Room', facts: [], unknowns: [] }
  await db.repository.insert({ id: 'followup-conversation', customerId: 'customer', createRequestId: 'create', initialMessage: 'Party', revision: 0,
    sessionId: null, sequence: 0, pending: null, requests: {}, view: { id: 'followup-conversation', version: 0, status: 'ready', messages: [],
      proposal: null, selections: [venue], progress: null, error: null,
      inquiry: { id: 'inquiry', revision: 1, status: 'draft', recipient: 'venue@example.com', subject: 'Inquiry', text: 'Party', venue,
        contactSourceUrl: null, contextMessageIds: [], updatedAt: new Date().toISOString(),
        delivery: { status: 'accepted', requestId: 'original', draftRevision: 1, approvedAt: new Date().toISOString(), expiresAt: 0,
          messageId: 'original-message', threadId: 'original-thread' } } } })
  const provider = { inboxId: 'inbox', send: vi.fn(async () => ({ messageId: 'followup-message', threadId: 'followup-thread' })), getMessage: vi.fn() }
  const mail = createPlanningMail({ repository: db.repository, storage: db.mail, provider, secret: 'unused', evidenceMode: 'fixture' })
  await mail.transport.sendInquiry({ requestId: 'followup', conversationId: 'followup-conversation', inquiryId: 'inquiry', draftRevision: 1,
    to: 'venue@example.com', subject: 'Missing terms', text: 'Please confirm taxes.' })
  const raw = JSON.stringify({ type: 'event', event_id: 'followup-reply', event_type: 'message.received', message: {
    inbox_id: 'inbox', message_id: 'reply-to-followup', thread_id: 'followup-thread', in_reply_to: 'followup-message',
    from: 'venue@example.com', to: ['planner@example.com'], subject: 'Re: Missing terms', text: 'Taxes are included.', timestamp: new Date().toISOString(),
  } })
  expect(await mail.receiver.receive(raw)).toBe('processed')
  expect(await mail.receiver.receive(raw)).toBe('duplicate')
  const saved = await db.repository.getById('followup-conversation')
  expect(saved?.view.inquiry?.delivery?.messageId).toBe('original-message')
  expect(saved?.view.inquiry?.replies).toHaveLength(1)
  expect(saved?.view.inquiry?.replies?.[0].message.inReplyTo).toBe('followup-message')
  expect(await db.repository.pendingReplyJobs(10, Date.now())).toHaveLength(1)
  expect(provider.send).toHaveBeenCalledTimes(1)
})
