import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { MailProvider } from './types'
import type { EvidenceMode, IncomingReply, InquiryReference, ReceiptRepository, ReplyDisposition } from './incoming-types'

const id = z.string().min(1).max(1024)
const identitySchema = z.object({ inbox_id: id, message_id: id })
const envelopeSchema = z.object({ type: z.literal('event'), event_id: id, event_type: id }).passthrough()
const messageSchema = identitySchema.extend({
  thread_id: id.optional(), from: z.string().min(1).max(1024), to: z.array(z.string()).max(100),
  cc: z.array(z.string()).max(100).optional(), subject: z.string().max(10_000).optional(),
  text: z.string().max(1_000_000).optional(), in_reply_to: id.optional(),
  references: z.array(id).max(100).optional(),
  timestamp: z.string().refine(v => Number.isFinite(Date.parse(v)), 'Invalid timestamp'),
})

/** Called only after authenticating the raw webhook. No browser or fire-and-forget work. */
export function createIncomingReceiver(opts: {
  provider: MailProvider
  receipts: ReceiptRepository
  evidenceMode: EvidenceMode
  /** MUST durably deduplicate/enqueue by receiptId in the application's transaction.
   * May be called again after a crash between application acknowledgement and complete().
   * Resolve only after storage, not after starting an unawaited interpretation promise. */
  acceptIncomingReply(reply: IncomingReply): Promise<ReplyDisposition>
  now?: () => Date
}) {
  const now = opts.now ?? (() => new Date())
  return {
    async receive(rawBody: string): Promise<'processed' | 'duplicate' | 'ignored'> {
      const event = envelopeSchema.parse(JSON.parse(rawBody))
      const received = event.event_type.startsWith('message.received')
      const payload = received ? event.message
        : event.event_type === 'message.sent' ? event.send
        : event.event_type === 'message.delivered' ? event.delivery
          : event.event_type === 'message.bounced' ? event.bounce
            : event.event_type === 'message.complained' ? event.complaint
              : event.event_type === 'message.rejected' ? event.reject : undefined
      if (!payload) return 'ignored'
      const identity = identitySchema.parse(payload)
      if (identity.inbox_id !== opts.provider.inboxId) return 'ignored'
      if (event.event_type === 'message.received') messageSchema.parse(payload)
      // Receipt and unsafe variants are separate: a held message can later be released.
      const keyParts = received ? [event.event_type, identity.inbox_id, identity.message_id] : [event.event_type, identity.inbox_id, event.event_id]
      const key = `agentmail-${createHash('sha256').update(JSON.stringify(keyParts)).digest('hex')}`
      const receipt = await opts.receipts.record({ key, eventId: event.event_id, eventType: event.event_type,
        inboxId: identity.inbox_id, messageId: identity.message_id, rawBody,
        receivedAt: now().toISOString(), evidenceMode: opts.evidenceMode })
      if (receipt.completed) return 'duplicate'
      const token = randomUUID()
      const started = now()
      if (!await opts.receipts.claim(receipt.id, token, started.toISOString(), new Date(started.getTime() + 60_000).toISOString())) {
        throw new Error('Receipt processing is already in progress; retry later')
      }
      try {
        // Always use the first durable payload, not a mutable webhook redelivery.
        const saved = envelopeSchema.parse(JSON.parse(receipt.rawBody))
        if (saved.event_type !== 'message.received') {
          await opts.receipts.complete(receipt.id, token, { status: saved.event_type.startsWith('message.received') ? 'withheld' : 'provider_event' })
          return 'processed'
        }
        let reply = receipt.reply
        if (!reply) {
          const m = messageSchema.parse(saved.message)
          let text = m.text
          if (text === undefined) {
            // Never fetch a webhook-supplied URL. SDK IDs keep reads on AgentMail's API.
            const hydrated = await opts.provider.getMessage(m.message_id)
            if (hydrated.inboxId !== m.inbox_id || hydrated.messageId !== m.message_id) throw new Error('Provider identity mismatch')
            text = z.string().max(1_000_000).optional().parse(hydrated.text)
          }
          reply = {
            receiptId: receipt.id, eventId: receipt.eventId, provider: 'agentmail', evidenceMode: receipt.evidenceMode,
            inboxId: m.inbox_id, messageId: m.message_id, threadId: m.thread_id,
            from: m.from, to: m.to, cc: m.cc, subject: m.subject, text,
            timestamp: new Date(m.timestamp).toISOString(), inReplyTo: m.in_reply_to, references: m.references,
            originalMessage: { inboxId: m.inbox_id, messageId: m.message_id },
          }
          await opts.receipts.saveReply(receipt.id, token, reply)
        }
        const disposition = await opts.acceptIncomingReply(reply)
        await opts.receipts.complete(receipt.id, token, disposition)
        return 'processed'
      } catch (error) {
        // If release fails, lease expiry still permits recovery; never erase evidence.
        await opts.receipts.release(receipt.id, token).catch(() => {})
        throw error
      }
    },
  }
}

function mailbox(value: string): string | null {
  const candidate = value.match(/^[^<>\r\n]*<([^<>\r\n]+)>$/)?.[1] ?? value
  if (!z.email().safeParse(candidate).success) return null
  const at = candidate.lastIndexOf('@')
  return candidate.slice(0, at) + candidate.slice(at).toLowerCase()
}

/** Application uses persisted inquiry candidates. Subject/text never choose a conversation.
 * Matching is routing evidence, not proof of an offer or availability. */
export function correlateReply(reply: IncomingReply, candidates: InquiryReference[]): InquiryReference | null {
  const sender = mailbox(reply.from)
  if (!sender) return null
  const matches = candidates.filter(candidate => {
    if (candidate.inboxId !== reply.inboxId || mailbox(candidate.recipient) !== sender) return false
    if (reply.threadId && candidate.threadId && reply.threadId !== candidate.threadId) return false
    if (reply.inReplyTo) return reply.inReplyTo === candidate.messageId
    if (reply.references?.length) return reply.references.includes(candidate.messageId)
    return Boolean(reply.threadId && reply.threadId === candidate.threadId)
  })
  return matches.length === 1 ? matches[0] : null
}
