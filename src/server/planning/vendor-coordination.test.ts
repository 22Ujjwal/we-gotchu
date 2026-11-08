import { expect, test, vi } from 'vitest'
import type { PlanningRecord, PlanningRepository } from './repository'
import { sendVendorNote, finishVendorConfirmation } from './vendor-coordination'

test('sends each authorized vendor stage once and retains the provider reference', async () => {
  let record = { id: 'conversation', customerId: 'customer', revision: 0, view: {
    version: 1, arrangement: { id: 'arrangement', controlled: true, inquiryId: 'inquiry' },
    inquiry: { id: 'inquiry', revision: 1, recipient: 'supplier@example.com' },
  } } as PlanningRecord
  const repository: PlanningRepository = { get: async () => record, getById: async () => record, pendingReplyJobs: async () => [], insert: async value => value, compareAndSet: async (before: PlanningRecord, after: PlanningRecord) => {
    if (before.revision !== record.revision) return null
    return record = { ...after, revision: before.revision + 1 }
  } }
  const sendInquiry = vi.fn().mockResolvedValue({ status: 'accepted', messageId: 'sent', threadId: 'thread', acceptedAt: new Date().toISOString() })
  const input = { key: 'quote:1', subject: 'Quote received', text: 'Thank you. We are awaiting customer approval.' }
  await sendVendorNote(repository, { sendInquiry }, record, 'supplier@example.com', input)
  await sendVendorNote(repository, { sendInquiry }, record, 'supplier@example.com', input)
  expect(sendInquiry).toHaveBeenCalledTimes(1)
  expect(record.vendorNotes?.['quote:1'].result).toMatchObject({ status: 'accepted', messageId: 'sent' })
  await sendVendorNote(repository, { sendInquiry }, record, 'another@example.com', { ...input, key: 'other' })
  expect(sendInquiry).toHaveBeenCalledTimes(1)
  record.vendorBooking = { paymentId: 'payment', noteKey: 'quote:1' }
  record.view.arrangement!.customerEmail = 'customer@example.com'
  record.view.inquiry!.replies = [{ id: 'reply', status: 'ready', message: {
    provider: 'agentmail', messageId: 'reply-message', threadId: 'thread', inReplyTo: 'sent', from: 'supplier@example.com',
    to: ['arrange@example.com'], subject: 'Confirmed', text: 'Confirmed for the demo.', receivedAt: new Date().toISOString(), originalRef: 'reply-message', mode: 'live',
  }, interpretation: { kind: 'quote', summary: 'Confirmed for the demo.', nextAction: 'Notify customer', facts: [], missing: [] } }]
  const send = vi.fn().mockResolvedValue({ messageId: 'customer-confirmation' })
  const provider = { inboxId: 'arrange', send, getMessage: async () => { throw Error('Not used') } }
  await finishVendorConfirmation(repository, provider, record, 'http://localhost:3000')
  expect(send).not.toHaveBeenCalled()
  record.view.inquiry!.replies[0].interpretation!.kind = 'confirmation'
  await finishVendorConfirmation(repository, provider, record, 'http://localhost:3000')
  await finishVendorConfirmation(repository, provider, record, 'http://localhost:3000')
  expect(send).toHaveBeenCalledTimes(1)
  expect(record.view.arrangement!.status).toBe('vendor_confirmed')
})
