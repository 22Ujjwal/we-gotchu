import { createHash } from 'node:crypto'
import { z } from 'zod'
import { InquiryConflict, SendRejected } from './types'
import type { InquiryInput, MailProvider, OperationRepository, SendResult } from './types'

const inputSchema = z.object({
  requestId: z.string().min(1).max(256),
  conversationId: z.string().min(1).max(256),
  inquiryId: z.string().min(1).max(256),
  draftRevision: z.number().int().nonnegative(),
  to: z.email().max(320),
  subject: z.string().min(1).max(998).regex(/^[^\r\n]+$/),
  text: z.string().min(1).max(100_000),
  replyToMessageId: z.string().min(1).max(998).optional(),
})
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

/** The caller MUST authorize the owner and saved draft approval before this boundary. */
export function createSupplierInquiryTransport(opts: {
  provider: MailProvider
  operations: OperationRepository
  now?: () => Date
}) {
  const now = opts.now ?? (() => new Date())
  const { provider, operations } = opts
  return {
    async sendInquiry(value: InquiryInput): Promise<SendResult> {
      // Parsing copies the approved fields in stable order; it does not trim or rewrite them.
      const input = inputSchema.parse(value)
      const fingerprint = hash(JSON.stringify(input))
      const { created, operation } = await operations.reserve({
        input, fingerprint, inboxId: provider.inboxId,
        idempotencyKey: `supplier-inquiry-${hash(input.requestId)}`,
      })
      if (operation.fingerprint !== fingerprint || operation.inboxId !== provider.inboxId) throw new InquiryConflict()
      if (!created) return operation.result

      const uncertain: SendResult = { operationId: operation.id, provider: 'agentmail', status: 'uncertain' }
      let result: SendResult
      try {
        const refs = await provider.send({ to: input.to, subject: input.subject, text: input.text, ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}) }, operation.idempotencyKey)
        if (!refs.messageId) return uncertain
        Object.assign(uncertain, refs)
        result = { operationId: operation.id, provider: 'agentmail', status: 'accepted', ...refs, acceptedAt: now().toISOString() }
      } catch (error) {
        if (!(error instanceof SendRejected)) return uncertain
        result = { operationId: operation.id, provider: 'agentmail', status: 'failed', code: error.code, reason: 'Provider rejected the inquiry' }
      }
      try {
        await operations.saveResult(operation.id, result)
        return result
      } catch {
        // Intent still blocks resend. Preserve any refs for operator recovery, never claim durable acceptance.
        return uncertain
      }
    },

    async reconcileInquiry(operationId: string): Promise<SendResult | null> {
      const operation = await operations.get(operationId)
      if (!operation) return null
      const prior = operation.result
      if (operation.inboxId !== provider.inboxId || prior.status !== 'uncertain' || !prior.messageId) return prior
      try {
        const message = await provider.getMessage(prior.messageId)
        if (message.inboxId !== operation.inboxId || message.messageId !== prior.messageId) return prior
        const result: SendResult = { operationId, provider: 'agentmail', status: 'accepted', messageId: message.messageId, threadId: message.threadId, acceptedAt: message.timestamp }
        await operations.saveResult(operationId, result)
        return result
      } catch {
        // No lookup by idempotency key is available. Not found/timeout is not proof of non-send.
        return prior
      }
    },
  }
}
