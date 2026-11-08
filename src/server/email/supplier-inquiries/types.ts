/** Private transport contracts; Tony owns the application approval/inquiry model. */
export type InquiryInput = {
  requestId: string
  conversationId: string
  inquiryId: string
  draftRevision: number
  replyToMessageId?: string
  to: string
  subject: string
  text: string
}

export type ProviderReferences = { messageId: string; threadId?: string }
export type SendResult = { operationId: string; provider: 'agentmail' } & (
  | ({ status: 'accepted'; acceptedAt: string } & ProviderReferences)
  | { status: 'failed'; code: string; reason: string }
  | { status: 'uncertain'; messageId?: string; threadId?: string }
)

export type SendOperation = {
  id: string
  input: InquiryInput
  fingerprint: string
  idempotencyKey: string
  inboxId: string
  result: SendResult
}

export interface OperationRepository {
  /** Atomic insert by globally unique requestId. Existing rows must never be overwritten.
   * New rows start uncertain BEFORE any send. Return created=true to exactly one caller.
   * Persist input, fingerprint, key, inboxId and result durably in the same transaction. */
  reserve(intent: Omit<SendOperation, 'id' | 'result'>): Promise<{ created: boolean; operation: SendOperation }>
  get(operationId: string): Promise<SendOperation | null>
  /** Atomic, durable replacement; an error must not clear the original intent. */
  saveResult(operationId: string, result: SendResult): Promise<void>
}

export type ProviderMessage = ProviderReferences & {
  inboxId: string
  from: string
  to: string[]
  cc?: string[]
  subject?: string
  text?: string
  inReplyTo?: string
  references?: string[]
  timestamp: string
}

export interface MailProvider {
  readonly inboxId: string
  /** One bounded attempt, no SDK retries. */
  send(input: Pick<InquiryInput, 'to' | 'subject' | 'text' | 'replyToMessageId'>, idempotencyKey: string): Promise<ProviderReferences>
  /** Fetch only by provider identity; never infer acceptance by subject/name. */
  getMessage(messageId: string): Promise<ProviderMessage>
}

/** Only a provider adapter that established non-acceptance may throw this. */
export class SendRejected extends Error {
  constructor(readonly code: string) { super('Provider rejected the inquiry') }
}

export class InquiryConflict extends Error {
  constructor() { super('Request ID already belongs to a different approved inquiry') }
}
