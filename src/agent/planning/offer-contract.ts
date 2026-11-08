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

export function calculateOfferCosts(offer: SelectedOffer): { ok: true; amounts: number[]; total: number } | { ok: false; reason: string } {
  const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })
  const amounts: number[] = []
  for (const line of offer.lines) {
    if (line.unitAmount === null || line.tax === null || line.delivery === null || line.fees === null
      || line.deposit.amount === null || line.deposit.treatment === 'unknown' || !line.cancellationTerms) {
      return fail(`${line.option.name} has unknown required costs or cancellation terms.`)
    }
    const subtotal = line.unitAmount * line.units
    if (line.deposit.treatment === 'included' && line.deposit.amount > subtotal) return fail('The included deposit exceeds the quoted subtotal.')
    const amount = subtotal + line.tax + line.delivery + line.fees
      + (line.deposit.treatment === 'additional' ? line.deposit.amount : 0)
    if (!Number.isSafeInteger(amount)) return fail('The offer amount is too large.')
    amounts.push(amount)
  }
  const total = amounts.reduce((sum, amount) => sum + amount, 0)
  if (!Number.isSafeInteger(total) || total > offer.brief.budget) return fail('The complete offer exceeds the event budget.')
  return { ok: true, amounts, total }
}
