import { z } from 'zod'

const webUrl = z.string().url().refine(value => /^https?:\/\//.test(value), 'Use an HTTP or HTTPS source')
export const optionSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().min(1).max(160), reason: z.string().min(1).max(1000),
  sourceUrl: webUrl, imageUrl: webUrl.optional(),
  knownTerms: z.array(z.string().min(1).max(500)).max(20),
  unknownTerms: z.array(z.string().min(1).max(500)).max(20),
  contactIds: z.array(z.string().min(1)).min(1).max(2),
}).strict()
export const offerLineSchema = z.object({
  description: z.string().min(1).max(250), quantity: z.number().int().positive().max(10000),
  priceTermId: z.string().min(1), depositTermId: z.string().min(1), cancellationTermId: z.string().min(1),
})
export type ResearchedOption = z.infer<typeof optionSchema>
export type OfferLineInput = z.infer<typeof offerLineSchema>
export type OfferLine = OfferLineInput & { contactId: string; unitAmountMinor: number; totalMinor: number; currency: string; priceExcerpt: string; deposit: string; cancellation: string; messageIds: string[] }
export type Offer = { id: string; operationKey: string; version: number; lines: OfferLine[]; totalMinor: number; currency: string; overBudgetMinor: number; createdAt: string }
export type Checkout = { id: string; offerId: string; approvalId: string; amountMinor: number; currency: string; sessionId?: string; url?: string; expiresAt?: number }
export type PaymentFact = { providerEventId: string; checkoutId: string; operationId: string; amountMinor: number; currency: string; paymentIntentId: string; receivedAt: string }
export type Delivery = { id: string; kind: 'choice' | 'payment' | 'answer'; message: string; delivered: boolean }
export type Notification = { id: string; kind: 'offer_ready' | 'confirmed'; offerId: string; state: 'pending' | 'unknown' | 'sent'; messageId?: string }
export type CommerceFacts = {
  options: ResearchedOption[]
  researchKey?: string
  choice?: { optionId: string; chosenAt: string }
  offers: Offer[]
  approval?: { id: string; offerId: string; approvedAt: string; acceptedOverage: boolean }
  checkout?: Checkout
  payment?: PaymentFact
  confirmations: { contactId: string; messageId: string; excerpt: string; confirmedAt: string }[]
  deliveries: Delivery[]
  notifications: Notification[]
}
export const emptyCommerce = (): CommerceFacts => ({ options: [], offers: [], confirmations: [], deliveries: [], notifications: [] })
