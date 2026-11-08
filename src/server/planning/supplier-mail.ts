import { z } from 'zod'

const id = z.string().min(1)
export const inquirySendResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('accepted'), operationId: id.optional(), messageId: id, threadId: id.nullable(), acceptedAt: z.iso.datetime() }).strict(),
  z.object({ status: z.literal('failed'), operationId: id.optional(), code: id, reason: id }).strict(),
  z.object({ status: z.literal('uncertain'), operationId: id, messageId: id.optional(), threadId: id.optional() }).strict(),
])
export type InquirySendResult = z.infer<typeof inquirySendResultSchema>
export type InquirySendInput = {
  requestId: string
  conversationId: string
  inquiryId: string
  draftRevision: number
  to: string
  subject: string
  text: string
}

// The caller has persisted approval of these exact fields before invoking transport.
export interface SupplierMailTransport {
  sendInquiry(input: InquirySendInput): Promise<InquirySendResult>
  reconcileInquiry?(input: Pick<InquirySendInput, 'requestId' | 'conversationId' | 'inquiryId'>): Promise<InquirySendResult | null>
}
