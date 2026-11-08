import { createHmac } from 'node:crypto'
import type { MailProvider, ProviderMessage } from '../email/supplier-inquiries/types'
import type { NaiveSessions } from './naive'

// In-memory stand-ins for AgentMail and Naïve. Like the real services, they
// treat a repeated idempotency key as the same request.

export function createFakeMail(inboxId = 'arrange@agentmail.test') {
  const sent: { to: string; subject: string; text: string; replyToMessageId?: string; idempotencyKey: string; messageId: string; threadId: string }[] = []
  const byKey = new Map<string, { messageId: string; threadId: string }>()
  const knownThreads = new Map<string, string>()
  let failNext: 'lost_response' | null = null
  const provider: MailProvider = {
    inboxId,
    async send(input, idempotencyKey) {
      const existing = byKey.get(idempotencyKey)
      if (existing) return existing
      const parent = input.replyToMessageId ? sent.find(m => m.messageId === input.replyToMessageId) : undefined
      const refs = {
        messageId: `<sent-${sent.length + 1}@agentmail.test>`,
        // AgentMail threads a reply from the message it answers. When the fake
        // doesn't know that message, fall back to this recipient's latest thread.
        threadId: parent?.threadId ?? (input.replyToMessageId ? knownThreads.get(input.replyToMessageId) : undefined)
          ?? sent.filter(m => m.to === input.to).at(-1)?.threadId ?? `thread-${sent.length + 1}`,
      }
      sent.push({ ...input, idempotencyKey, ...refs })
      byKey.set(idempotencyKey, refs)
      if (failNext === 'lost_response') {
        failNext = null
        throw new Error('Provider send outcome is unknown')
      }
      return refs
    },
    async getMessage(messageId): Promise<ProviderMessage> {
      const message = sent.find(m => m.messageId === messageId)
      if (!message) throw new Error('not found')
      return { inboxId, messageId, threadId: message.threadId, from: inboxId, to: [message.to], subject: message.subject, text: message.text, timestamp: '2026-11-08T12:00:00.000Z' }
    },
  }
  return {
    provider,
    sent,
    /** The next send reaches the provider but its response is lost. */
    loseNextResponse() { failNext = 'lost_response' },
    /** Teach the fake about an inbound message so replies to it keep the thread. */
    registerInbound(messageId: string, threadId: string) { knownThreads.set(messageId, threadId) },
  }
}

export function createFakeNaive() {
  const sessions: { sessionId: string; eventId: string; message: string; idempotencyKey: string }[] = []
  const deliveries: { sessionId: string; message: string; idempotencyKey: string }[] = []
  const deliverCalls: { sessionId: string; idempotencyKey: string }[] = []
  let failDeliveries = 0
  const naive: NaiveSessions = {
    async startSession({ eventId, message }) {
      const idempotencyKey = `event:${eventId}`
      const existing = sessions.find(s => s.idempotencyKey === idempotencyKey)
      if (existing) return { sessionId: existing.sessionId }
      const sessionId = `ses_fake_${sessions.length + 1}`
      sessions.push({ sessionId, eventId, message, idempotencyKey })
      return { sessionId }
    },
    async deliver(input) {
      deliverCalls.push({ sessionId: input.sessionId, idempotencyKey: input.idempotencyKey })
      if (failDeliveries > 0) {
        failDeliveries--
        throw new Error('naive unavailable')
      }
      // Naïve replays a repeated key instead of queueing the message again.
      if (!deliveries.some(d => d.idempotencyKey === input.idempotencyKey)) deliveries.push(input)
    },
  }
  return {
    naive,
    sessions,
    deliveries,
    deliverCalls,
    failNextDeliveries(count: number) { failDeliveries = count },
  }
}

/** Signs a webhook body the way AgentMail (Svix) does, for local tests. */
export function signAgentMailRequest(url: string, body: string, secret: string, svixId = `msg_${Math.random().toString(36).slice(2)}`): Request {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', Buffer.from(secret.slice('whsec_'.length), 'base64')).update(`${svixId}.${timestamp}.${body}`).digest('base64')
  return new Request(url, { method: 'POST', body, headers: { 'svix-id': svixId, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}`, 'content-type': 'application/json' } })
}

/** A `message.received` payload in AgentMail's webhook shape. */
export function agentMailReply(input: { inboxId: string; messageId: string; inReplyTo: string; threadId: string; from: string; text: string; providerEventId?: string }): string {
  return JSON.stringify({
    type: 'event', event_type: 'message.received', event_id: input.providerEventId ?? `evt_${input.messageId}`,
    message: {
      inbox_id: input.inboxId, message_id: input.messageId, thread_id: input.threadId, from: input.from, to: [input.inboxId],
      subject: 'Re: Team dinner on 20 November', text: input.text, timestamp: '2026-11-08T13:00:00Z',
      in_reply_to: input.inReplyTo, references: [input.inReplyTo],
    },
  })
}
