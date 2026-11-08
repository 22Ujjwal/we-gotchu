import type { ProviderMessage } from './types'

export type EvidenceMode = 'live' | 'fixture'
export type IncomingReply = ProviderMessage & {
  receiptId: string
  eventId: string
  provider: 'agentmail'
  evidenceMode: EvidenceMode
  originalMessage: { inboxId: string; messageId: string }
}
export type ReplyDisposition =
  | { status: 'matched'; conversationId: string; inquiryId: string }
  | { status: 'unmatched'; reason: string }

export type ReceiptIntent = {
  key: string
  eventId: string
  eventType: string
  inboxId: string
  messageId: string
  rawBody: string
  receivedAt: string
  evidenceMode: EvidenceMode
}
export type IncomingReceipt = ReceiptIntent & {
  id: string
  completed: boolean
  reply?: IncomingReply
}
export interface ReceiptRepository {
  /** Atomic insert-or-return-existing by key. Retain the first raw payload unchanged. */
  record(intent: ReceiptIntent): Promise<IncomingReceipt>
  /** Atomic claim only if incomplete and no unexpired lease; use database time in production.
   * All subsequent mutations MUST compare leaseToken and reject stale workers. */
  claim(receiptId: string, leaseToken: string, now: string, leaseUntil: string): Promise<boolean>
  saveReply(receiptId: string, leaseToken: string, reply: IncomingReply): Promise<void>
  complete(receiptId: string, leaseToken: string, result: ReplyDisposition | { status: 'provider_event' | 'withheld' }): Promise<void>
  /** Clear only the matching lease, preserve receipt and normalized reply for retry. */
  release(receiptId: string, leaseToken: string): Promise<void>
}

export type InquiryReference = {
  conversationId: string
  inquiryId: string
  inboxId: string
  recipient: string
  messageId: string
  threadId?: string
}
