import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { replyInterpretationSchema, supplierMessageSchema, type SupplierMessage, type SupplierReply } from '../../agent/planning/reply-contract'
import type { PlanningInquiry } from '../../agent/planning/contract'
import { ApiError } from '../events/errors'
import type { PlanningRecord, PlanningRepository } from './repository'

export type ReplyTarget = { customerId: string; conversationId: string; inquiryId: string }
export type ReplyInterpreter = (input: { message: SupplierMessage; inquiry: PlanningInquiry }) => Promise<unknown>

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
export async function acceptIncomingReply(repository: PlanningRepository, target: ReplyTarget, input: unknown): Promise<SupplierReply> {
  const message = supplierMessageSchema.parse(input)
  for (let attempt = 0; attempt < 5; attempt++) {
    const { record, inquiry } = await load(repository, target)
    const delivery = inquiry.delivery
    const correlated = (message.inReplyTo && message.inReplyTo === delivery?.messageId)
      || (message.threadId && message.threadId === delivery?.threadId)
    if (!correlated || message.from.toLowerCase() !== inquiry.recipient.toLowerCase()) {
      throw new ApiError(422, 'unmatched_reply', 'Reply does not match this inquiry and recipient.')
    }
    const existing = inquiry.replies?.find(reply => reply.message.provider === message.provider && reply.message.messageId === message.messageId)
    if (existing) {
      if (!isDeepStrictEqual(existing.message, message)) throw new ApiError(409, 'reply_conflict', 'This message identity already has different content.')
      return existing
    }
    const reply: SupplierReply = { id: `reply_${randomUUID()}`, message, status: 'received' }
    const replies = [...(inquiry.replies ?? []), reply].sort((a, b) => Date.parse(a.message.receivedAt) - Date.parse(b.message.receivedAt) || a.id.localeCompare(b.id))
    if (await repository.compareAndSet(record, updated(record, { ...inquiry, replies }))) return reply
  }
  throw new ApiError(409, 'reply_busy', 'The inquiry changed while saving the reply. Retry receipt storage.')
}

export async function interpretReply(repository: PlanningRepository, target: ReplyTarget, replyId: string, interpret: ReplyInterpreter,
  now = Date.now, leaseMs = 60_000): Promise<void> {
  let claimed: { inquiry: PlanningInquiry; reply: SupplierReply } | undefined
  const token = randomUUID()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { record, inquiry } = await load(repository, target)
    const reply = inquiry.replies?.find(item => item.id === replyId)
    if (!reply) throw new ApiError(404, 'not_found', 'Reply not found.')
    if (reply.status === 'ready' || (reply.status === 'processing' && (reply.lease?.expiresAt ?? 0) > now())) return
    const reserved: SupplierReply = { ...reply, status: 'processing', error: undefined, lease: { token, expiresAt: now() + leaseMs } }
    if (await repository.compareAndSet(record, updated(record, { ...inquiry,
      replies: inquiry.replies!.map(item => item.id === replyId ? reserved : item) }))) {
      claimed = { inquiry, reply: reserved }
      break
    }
  }
  if (!claimed) throw new ApiError(409, 'reply_busy', 'Reply processing is busy.')
  let result: SupplierReply
  try {
    const interpretation = replyInterpretationSchema.parse(await interpret({ message: claimed.reply.message, inquiry: claimed.inquiry }))
    for (const fact of interpretation.facts) {
      if (!claimed.reply.message.text.includes(fact.quote)) throw new Error('Unsupported source excerpt.')
    }
    result = { ...claimed.reply, status: 'ready', interpretation, lease: undefined, error: undefined }
  } catch {
    result = { ...claimed.reply, status: 'failed', lease: undefined, error: 'We saved the reply but could not interpret it. The original message is available.' }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { record, inquiry } = await load(repository, target)
    if (inquiry.replies?.find(item => item.id === replyId)?.lease?.token !== token) return
    if (await repository.compareAndSet(record, updated(record, { ...inquiry,
      replies: inquiry.replies!.map(item => item.id === replyId ? result : item) }))) return
  }
  throw new ApiError(409, 'reply_busy', 'Could not save the interpretation. The original reply remains saved.')
}

// Await from the verified transport callback. Receipt and job are the same atomic stored entry.
export async function receivePlanningReply(repository: PlanningRepository, conversationId: string, inquiryId: string,
  input: unknown, interpreter: ReplyInterpreter) {
  const record = await repository.getById(conversationId)
  if (!record) throw new ApiError(404, 'not_found', 'Conversation not found.')
  const target = { customerId: record.customerId, conversationId, inquiryId }
  const reply = await acceptIncomingReply(repository, target, input)
  await interpretReply(repository, target, reply.id, interpreter)
  return { replyId: reply.id }
}
