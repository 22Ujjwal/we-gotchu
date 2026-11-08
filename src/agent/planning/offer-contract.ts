import { z } from 'zod'
import { Brief } from '../../contracts'
import { planningOptionSchema } from './contract'

const text = z.string().trim().min(1)
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const selectedOfferSchema = z.object({
  id: text, revision: z.number().int().positive(), inquiryId: text, replyId: text,
  contextMessageIds: z.array(text), expiresAt: z.iso.datetime().nullable(),
  mode: z.enum(['live', 'simulated']), currency: z.string().regex(/^[a-z]{3}$/), brief: Brief,
  missing: z.array(text),
  lines: z.array(z.object({
    option: planningOptionSchema, sourceReplyId: text.nullable(),
    sourceQuotes: z.array(text).optional(),
    unitAmount: money.nullable(), units: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    quantityDescription: text, tax: money.nullable(), delivery: money.nullable(), fees: money.nullable(),
    deposit: z.object({ amount: money.nullable(), treatment: z.enum(['included', 'additional', 'unknown']) }).strict(),
    cancellationTerms: text.nullable(),
  }).strict()).min(1),
}).strict()
export type SelectedOffer = z.infer<typeof selectedOfferSchema>


export type PlanningPaymentLink = {
  eventId: string; planId: string; planRevision: number; offerId: string; offerRevision: number;
}
