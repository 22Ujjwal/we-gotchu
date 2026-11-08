import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { replyInterpretationSchema, supplierMessageSchema, type SupplierReply } from '../../agent/planning/reply-contract'
import type { PlanningInquiry } from '../../agent/planning/contract'
import { ApiError } from '../events/errors'
import type { PlanningRecord, PlanningRepository } from './repository'
import type { InquiryReference } from '../email/supplier-inquiries/incoming-types'

export type ReplyTarget = { customerId: string; conversationId: string; inquiryId: string }

async function load(repository: PlanningRepository, target: ReplyTarget) {
  const record = await repository.get(target.customerId, target.conversationId)
  if (!record) throw new ApiError(404, 'not_found', 'Conversation not found.')
  const inquiry = record.view.inquiry?.id === target.inquiryId ? record.view.inquiry
    : record.inquiryHistory?.find(item => item.id === target.inquiryId)
  if (!inquiry) throw new ApiError(404, 'not_found', 'Inquiry not found.')
  return { record, inquiry }
}

function updated(record: PlanningRecord, inquiry: PlanningInquiry): PlanningRecord {
  return { ...record,
    inquiryHistory: record.inquiryHistory?.map(item => item.id === inquiry.id ? inquiry : item),
    view: { ...record.view, version: record.view.version + 1,
      ...(record.view.inquiry?.id === inquiry.id ? { inquiry } : {}) },
  }
}

// The transport authenticates the webhook and resolves the target from its saved send operation.
export async function acceptIncomingReply(repository: PlanningRepository, target: ReplyTarget, input: unknown, receiptId?: string,
  verifiedReference?: InquiryReference): Promise<SupplierReply> {
  const message = supplierMessageSchema.parse(input)
  for (let attempt = 0; attempt < 5; attempt++) {
    const { record, inquiry } = await load(repository, target)
    // Follow-ups can have their own provider thread. The receiver resolves this from durable send operations.
    if (verifiedReference && (verifiedReference.conversationId !== target.conversationId
      || verifiedReference.inquiryId !== inquiry.id || verifiedReference.recipient.toLowerCase() !== inquiry.recipient.toLowerCase())) {
      throw new ApiError(422, 'unmatched_reply', 'Reply does not match this inquiry and recipient.')
    }
    const delivery = verifiedReference ?? inquiry.delivery
    const correlated = (message.inReplyTo && message.inReplyTo === delivery?.messageId)
      || (delivery?.messageId && message.references?.includes(delivery.messageId))
      || (message.threadId && message.threadId === delivery?.threadId)
    if (!correlated || message.from.toLowerCase() !== inquiry.recipient.toLowerCase()) {
      throw new ApiError(422, 'unmatched_reply', 'Reply does not match this inquiry and recipient.')
    }
    const existing = inquiry.replies?.find(reply => (receiptId && reply.receiptId === receiptId) || (reply.message.provider === message.provider && reply.message.messageId === message.messageId))
    if (existing) {
      if (!isDeepStrictEqual(existing.message, message)) throw new ApiError(409, 'reply_conflict', 'This message identity already has different content.')
      return existing
    }
    const reply: SupplierReply = { id: `reply_${randomUUID()}`, receiptId, message, status: message.text.trim() ? 'received' : 'failed',
      ...(!message.text.trim() ? { error: 'This reply has no plain text to interpret. The original provider message is retained.' } : {}) }
    const replies = [...(inquiry.replies ?? []), reply].sort((a, b) => Date.parse(a.message.receivedAt) - Date.parse(b.message.receivedAt) || a.id.localeCompare(b.id))
    if (await repository.compareAndSet(record, updated(record, { ...inquiry, replies }))) return reply
  }
  throw new ApiError(409, 'reply_busy', 'The inquiry changed while saving the reply. Retry receipt storage.')
}

export async function recordSupplierReply(repository: PlanningRepository, target: ReplyTarget, replyId: string,
  input: unknown): Promise<void> {
  const interpretation = replyInterpretationSchema.parse(input)
  for (let attempt = 0; attempt < 5; attempt++) {
    const { record, inquiry } = await load(repository, target)
    const reply = inquiry.replies?.find(item => item.id === replyId)
    if (!reply) throw new ApiError(404, 'not_found', 'Reply not found.')
    if (reply.status === 'ready') return
    for (const fact of interpretation.facts) {
      if (!reply.message.text.includes(fact.quote)) throw new ApiError(422, 'unsupported_evidence', 'The source excerpt is absent from the supplier reply.')
    }
    const result: SupplierReply = { ...reply, status: 'ready', interpretation, lease: undefined, error: undefined }
    if (await repository.compareAndSet(record, updated(record, { ...inquiry,
      replies: inquiry.replies!.map(item => item.id === replyId ? result : item) }))) return
  }
  throw new ApiError(409, 'reply_busy', 'Could not save the interpretation. The original reply remains saved.')
}
