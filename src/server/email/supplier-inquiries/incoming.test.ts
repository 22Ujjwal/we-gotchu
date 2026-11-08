import { expect, it } from 'vitest'
import { correlateReply, createIncomingReceiver } from './incoming'
import type { IncomingReceipt, IncomingReply, ReceiptRepository, ReplyDisposition } from './incoming-types'
import type { MailProvider } from './types'

const rawEvent = {
  type: 'event', event_type: 'message.received', event_id: 'evt-1',
  message: { inbox_id: 'team@agentmail.to', message_id: '<reply-1>', thread_id: 'thread-1', from: 'Venue <venue@example.com>', to: ['team@agentmail.to'], subject: 'Re: TEST inquiry', text: 'TEST QUOTE. No reservation.', timestamp: '2026-11-08T12:00:00Z', in_reply_to: '<sent-1>', references: ['<sent-1>'] },
}
const candidate = { conversationId: 'c-1', inquiryId: 'i-1', inboxId: 'team@agentmail.to', recipient: 'venue@example.com', messageId: '<sent-1>', threadId: 'thread-1' }

function setup() {
  const rows = new Map<string, IncomingReceipt & { lease?: string; until?: string; disposition?: unknown }>()
  const effects = new Map<string, IncomingReply>()
  const store: ReceiptRepository = {
    async record(intent) {
      const row = rows.get(intent.key) ?? { ...intent, id: 'receipt-1', completed: false }
      rows.set(intent.key, row)
      return structuredClone(row)
    },
    async claim(id, lease, now, until) {
      const row = [...rows.values()].find(r => r.id === id)!
      if (row.completed || (row.lease && row.until! > now)) return false
      row.lease = lease; row.until = until
      return true
    },
    async saveReply(id, lease, reply) { const row = [...rows.values()].find(r => r.id === id)!; if (row.lease !== lease) throw new Error('Lost lease'); row.reply = structuredClone(reply) },
    async complete(id, lease, result) { const row = [...rows.values()].find(r => r.id === id)!; if (row.lease !== lease) throw new Error('Lost lease'); row.completed = true; row.disposition = result },
    async release(id, lease) { const row = [...rows.values()].find(r => r.id === id)!; if (row.lease === lease) row.lease = undefined },
  }
  let getCalls = 0
  const provider: MailProvider = {
    inboxId: 'team@agentmail.to',
    async send() { throw new Error('Receiver must never send') },
    async getMessage() { getCalls++; return { inboxId: 'team@agentmail.to', messageId: '<reply-1>', threadId: 'thread-1', from: 'venue@example.com', to: ['team@agentmail.to'], text: 'Full provider body', timestamp: '2026-11-08T12:00:00Z' } },
  }
  const callback = async (reply: IncomingReply): Promise<ReplyDisposition> => {
    effects.set(reply.receiptId, reply)
    const match = correlateReply(reply, [candidate])
    return match ? { status: 'matched', conversationId: match.conversationId, inquiryId: match.inquiryId } : { status: 'unmatched', reason: 'No unambiguous match' }
  }
  const create = (acceptIncomingReply = callback) => createIncomingReceiver({ provider, receipts: store, acceptIncomingReply, evidenceMode: 'fixture', now: () => new Date('2026-11-08T12:00:00Z') })
  return { rows, effects, store, provider, create, callback, getCalls: () => getCalls }
}

it('retains raw evidence and normalized references before awaiting the application callback', async () => {
  const s = setup()
  const body = JSON.stringify(rawEvent)
  await s.create(async reply => {
    expect([...s.rows.values()][0].rawBody).toBe(body)
    expect([...s.rows.values()][0].reply?.text).toBe('TEST QUOTE. No reservation.')
    return s.callback(reply)
  }).receive(body)
  expect([...s.effects.values()][0]).toMatchObject({ provider: 'agentmail', evidenceMode: 'fixture', eventId: 'evt-1', receiptId: 'receipt-1', messageId: '<reply-1>', inReplyTo: '<sent-1>', originalMessage: { inboxId: 'team@agentmail.to', messageId: '<reply-1>' }, timestamp: '2026-11-08T12:00:00.000Z' })
  expect([...s.rows.values()][0].completed).toBe(true)
})

it('deduplicates the same message even under a different provider event ID', async () => {
  const s = setup()
  let callbacks = 0
  const receiver = s.create(async reply => { callbacks++; return s.callback(reply) })
  await receiver.receive(JSON.stringify(rawEvent))
  await receiver.receive(JSON.stringify({ ...rawEvent, event_id: 'evt-duplicate' }))
  expect(s.rows.size).toBe(1)
  expect(s.effects.size).toBe(1)
  expect(callbacks).toBe(1)
})

it('retries processing failures from durable evidence without losing the reply or sending mail', async () => {
  const s = setup()
  await expect(s.create(async () => { throw new Error('interpretation queue unavailable') }).receive(JSON.stringify(rawEvent))).rejects.toThrow()
  expect([...s.rows.values()][0].completed).toBe(false)
  expect([...s.rows.values()][0].reply?.text).toBe('TEST QUOTE. No reservation.')
  await s.create().receive(JSON.stringify(rawEvent))
  expect(s.effects.size).toBe(1)
})

it('uses the same receipt identity if a crash happens after the callback effect', async () => {
  const s = setup()
  const complete = s.store.complete
  s.store.complete = async () => { throw new Error('lost database response') }
  await expect(s.create().receive(JSON.stringify(rawEvent))).rejects.toThrow()
  s.store.complete = complete
  await s.create().receive(JSON.stringify(rawEvent))
  expect(s.effects.size).toBe(1)
})

it('does not acknowledge a receipt-store failure or concurrent processing', async () => {
  const s = setup()
  s.store.record = async () => { throw new Error('store down') }
  await expect(s.create().receive(JSON.stringify(rawEvent))).rejects.toThrow('store down')
  expect(s.effects.size).toBe(0)
  const other = setup()
  other.store.claim = async () => false
  await expect(other.create().receive(JSON.stringify(rawEvent))).rejects.toThrow()
  expect(other.effects.size).toBe(0)
})

it('fetches omitted body through provider IDs without following body_url', async () => {
  const s = setup()
  const message = { ...rawEvent.message, text: undefined, body_url: 'http://127.0.0.1/private' }
  await s.create().receive(JSON.stringify({ ...rawEvent, message }))
  expect(s.getCalls()).toBe(1)
  expect([...s.effects.values()][0]).toMatchObject({ text: 'Full provider body', inReplyTo: '<sent-1>' })
})

it('refuses a hydrated message from a different inbox or identity', async () => {
  const s = setup()
  s.provider.getMessage = async () => ({ inboxId: 'other@agentmail.to', messageId: 'other', from: 'venue@example.com', to: [], timestamp: '2026-11-08T12:00:00Z', text: 'wrong' })
  await expect(s.create().receive(JSON.stringify({ ...rawEvent, message: { ...rawEvent.message, text: undefined } }))).rejects.toThrow()
  expect(s.effects.size).toBe(0)
})

it('retains unmatched replies without attaching a conversation', async () => {
  const s = setup()
  await s.create().receive(JSON.stringify({ ...rawEvent, message: { ...rawEvent.message, from: 'stranger@example.com' } }))
  expect([...s.rows.values()][0].disposition).toMatchObject({ status: 'unmatched' })
})

it('ignores a different inbox and retains unsafe received events without interpreting', async () => {
  const s = setup()
  expect(await s.create().receive(JSON.stringify({ ...rawEvent, message: { ...rawEvent.message, inbox_id: 'other@agentmail.to' } }))).toBe('ignored')
  expect(s.rows.size).toBe(0)
  await s.create().receive(JSON.stringify({ ...rawEvent, event_type: 'message.received.unauthenticated' }))
  expect([...s.rows.values()][0].disposition).toEqual({ status: 'withheld' })
  expect(s.effects.size).toBe(0)
})

it('retains delivery evidence separately from incoming replies', async () => {
  const s = setup()
  await s.create().receive(JSON.stringify({ type: 'event', event_type: 'message.delivered', event_id: 'evt-delivered', delivery: { inbox_id: 'team@agentmail.to', message_id: '<sent-1>', thread_id: 'thread-1', timestamp: '2026-11-08T12:00:00Z', recipients: ['venue@example.com'] } }))
  expect([...s.rows.values()][0].disposition).toEqual({ status: 'provider_event' })
  expect(s.effects.size).toBe(0)
})

it.each([['message.sent', 'send'], ['message.rejected', 'reject']])('retains the SDK-documented %s payload', async (eventType, field) => {
  const s = setup()
  await s.create().receive(JSON.stringify({ type: 'event', event_type: eventType, event_id: 'evt-status', [field]: { inbox_id: 'team@agentmail.to', message_id: '<sent-1>', thread_id: 'thread-1', timestamp: '2026-11-08T12:00:00Z' } }))
  expect(s.rows.size).toBe(1)
  expect([...s.rows.values()][0].disposition).toEqual({ status: 'provider_event' })
  expect(s.effects.size).toBe(0)
})

it('requires a unique provider-reference and sender match, never a subject match', async () => {
  const s = setup()
  await s.create().receive(JSON.stringify(rawEvent))
  const reply = [...s.effects.values()][0]
  expect(correlateReply(reply, [candidate])).toEqual(candidate)
  expect(correlateReply({ ...reply, from: 'imposter@example.com' }, [candidate])).toBeNull()
  expect(correlateReply({ ...reply, inReplyTo: '<unknown>' }, [candidate])).toBeNull()
  expect(correlateReply({ ...reply, threadId: 'wrong-thread' }, [candidate])).toBeNull()
  expect(correlateReply(reply, [candidate, { ...candidate, inquiryId: 'i-2' }])).toBeNull()
  expect(correlateReply({ ...reply, inReplyTo: undefined, references: undefined, threadId: undefined }, [candidate])).toBeNull()
})
