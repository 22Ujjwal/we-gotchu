import { createIncomingReceiver, correlateReply } from '../email/supplier-inquiries/incoming'
import { createSupplierInquiryTransport } from '../email/supplier-inquiries/transport'
import { createSupplierMailWebhook } from '../email/supplier-inquiries/webhook'
import type { MailProvider } from '../email/supplier-inquiries/types'
import type { EvidenceMode } from '../email/supplier-inquiries/incoming-types'
import type { createSupplierMailRepositories } from './mail-repository'
import type { PlanningRepository } from './repository'
import { inquirySendResultSchema, type SupplierMailTransport } from './supplier-mail'
import { acceptIncomingReply } from './replies'

export function createPlanningMail({ repository, storage, provider, secret, evidenceMode = 'live' }: {
  repository: PlanningRepository
  storage: ReturnType<typeof createSupplierMailRepositories>
  provider: MailProvider
  secret: string
  evidenceMode?: EvidenceMode
}) {
  const rawTransport = createSupplierInquiryTransport({ provider, operations: storage.operations })
  const transport: SupplierMailTransport = {
    async reconcileInquiry(input) {
      const operation = await storage.operationForRequest(input.requestId)
      if (!operation || operation.input.conversationId !== input.conversationId || operation.input.inquiryId !== input.inquiryId) return null
      const result = await rawTransport.reconcileInquiry(operation.id)
      if (!result) return null
      const { provider: _provider, ...value } = result
      return inquirySendResultSchema.parse(value.status === 'accepted' ? { ...value, threadId: value.threadId ?? null } : value)
    },
    async sendInquiry(input) {
      const result = await rawTransport.sendInquiry(input)
      // Keep the application's strict contract while preserving provider operation identity.
      const { provider: _provider, ...value } = result
      return value.status === 'accepted' ? { ...value, threadId: value.threadId ?? null } : value
    },
  }
  const receiver = createIncomingReceiver({ provider, receipts: storage.receipts, evidenceMode,
    async acceptIncomingReply(reply) {
      const match = correlateReply(reply, await storage.references(reply.inboxId))
      if (!match) return { status: 'unmatched', reason: 'No unique approved inquiry matches this sender and provider reference.' }
      const record = await repository.getById(match.conversationId)
      if (!record) return { status: 'unmatched', reason: 'The linked conversation is unavailable.' }
      if ((reply.text?.length ?? 0) > 60000) return { status: 'unmatched', reason: 'Reply exceeds the interpretation size limit. Original evidence is retained.' }
      await acceptIncomingReply(repository, { customerId: record.customerId, conversationId: record.id, inquiryId: match.inquiryId }, {
        provider: reply.provider, messageId: reply.messageId, threadId: reply.threadId ?? null,
        inReplyTo: reply.inReplyTo ?? null, references: reply.references,
        from: reply.from.match(/<([^<>]+)>$/)?.[1] ?? reply.from,
        to: reply.to.map(value => value.match(/<([^<>]+)>$/)?.[1] ?? value), subject: reply.subject ?? '', text: reply.text ?? '',
        receivedAt: reply.timestamp, originalRef: `${reply.originalMessage.inboxId}/${reply.originalMessage.messageId}`,
        mode: reply.evidenceMode === 'fixture' ? 'simulated' : 'live',
      }, reply.receiptId)
      return { status: 'matched', conversationId: record.id, inquiryId: match.inquiryId }
    },
  })
  return { transport, receiver, reconcileInquiry: rawTransport.reconcileInquiry,
    webhook: createSupplierMailWebhook({ secret, receiver }) }
}
