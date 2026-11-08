import { z } from 'zod'

const text = z.string().trim().min(1)
export const supplierMessageSchema = z.object({
  provider: text, messageId: text, threadId: text.nullable(), inReplyTo: text.nullable(), references: z.array(text).optional(),
  // Incoming headers can contain groups or omit To. Routing uses the inbox and saved message references.
  from: z.email(), to: z.array(z.string().max(1024)).max(100), subject: z.string().max(10000), text: z.string().max(60000),
  receivedAt: z.iso.datetime(), originalRef: text, mode: z.enum(['live', 'simulated']),
}).strict()
export const replyInterpretationSchema = z.object({
  kind: z.enum(['question', 'refusal', 'tentative', 'quote', 'confirmation', 'other']),
  summary: text.max(3000), nextAction: text.max(1500),
  facts: z.array(z.object({
    field: z.enum(['price', 'currency', 'date', 'time', 'timezone', 'capacity', 'deposit', 'charges', 'terms', 'expiry', 'availability']),
    value: text.max(2000), quote: text.max(4000),
  }).strict()).max(40),
  missing: z.array(text.max(500)).max(30),
}).strict()
export const supplierReplySchema = z.object({
  id: text, receiptId: text.optional(), message: supplierMessageSchema, status: z.enum(['received', 'processing', 'ready', 'failed']),
  interpretation: replyInterpretationSchema.optional(), error: text.optional(),
  lease: z.object({ token: text, expiresAt: z.number().int() }).optional(),
}).strict()
export type SupplierMessage = z.infer<typeof supplierMessageSchema>
export type SupplierReply = z.infer<typeof supplierReplySchema>
export type ReplyInterpretation = z.infer<typeof replyInterpretationSchema>
