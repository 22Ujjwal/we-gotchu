import { and, eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { events, plans, planningConversations, runs, schema } from '../db/schema'
import { ApiError } from '../events/errors'
import { buildSelectedOfferPlan, selectedOfferSchema, type SelectedOffer } from './offer'
import type { PlanningRecord } from './repository'
import type { PlanningPaymentLink } from '../../agent/planning/offer-contract'

const stale = () => new ApiError(409, 'stale_offer', 'The event or offer changed. Reload before continuing.')
function sourceMatches(record: PlanningRecord, offer: SelectedOffer) {
  const inquiry = record.view.inquiry
  const reply = inquiry?.replies?.at(-1)
  return inquiry?.id === offer.inquiryId && inquiry.status !== 'stale'
    && reply?.id === offer.replyId && reply.status === 'ready' && reply.message.mode === offer.mode
    && isDeepStrictEqual(offer.contextMessageIds, record.view.messages.filter(message => message.role === 'user').map(message => message.id))
}

export function createOfferRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  return {
    // Internal model-output storage. Customer commands cannot submit their own prices.
    async save(customerId: string, conversationId: string, expectedVersion: number, input: SelectedOffer): Promise<PlanningRecord> {
      const offer = selectedOfferSchema.parse(input)
      return db.transaction(async tx => {
        const [row] = await tx.select().from(planningConversations).where(and(eq(planningConversations.id, conversationId),
          eq(planningConversations.customerId, customerId))).for('update')
        if (!row) throw new ApiError(404, 'not_found', 'Conversation not found.')
        const record = row.data
        if (record.view.version !== expectedVersion || record.pending || !sourceMatches(record, offer)) throw stale()
        if (record.view.paymentLink) throw new ApiError(409, 'payment_plan_exists', 'Cancel the existing payment plan before replacing its offer.')
        if (record.view.offer && (offer.id !== record.view.offer.id || offer.revision !== record.view.offer.revision + 1)) throw stale()
        if (!record.view.offer && offer.revision !== 1) throw stale()
        const data = { ...record, revision: row.revision + 1, view: { ...record.view, version: record.view.version + 1, offer } }
        await tx.update(planningConversations).set({ revision: data.revision, data }).where(eq(planningConversations.id, conversationId))
        return data
      })
    },
    async prepare(customerId: string, conversationId: string, offerId: string, offerRevision: number, now: Date): Promise<PlanningPaymentLink> {
      return db.transaction(async tx => {
        const [row] = await tx.select().from(planningConversations).where(and(eq(planningConversations.id, conversationId),
          eq(planningConversations.customerId, customerId))).for('update')
        if (!row) throw new ApiError(404, 'not_found', 'Conversation not found.')
        const record = row.data
        const offer = record.view.offer
        if (!offer || offer.id !== offerId || offer.revision !== offerRevision || record.pending || !sourceMatches(record, offer)) throw stale()
        const existing = record.view.paymentLink
        const link: PlanningPaymentLink = existing ?? { eventId: `evt_${randomUUID()}`, planId: `plan_${randomUUID()}`,
          planRevision: 1, offerId, offerRevision }
        if (link.offerId !== offerId || link.offerRevision !== offerRevision) throw stale()
        const runId = `run_${randomUUID()}`
        const built = buildSelectedOfferPlan({ offer, selections: record.view.selections,
          contextMessageIds: record.view.messages.filter(message => message.role === 'user').map(message => message.id),
          eventId: link.eventId, runId, briefRevision: 1, planId: link.planId, planRevision: link.planRevision, now: now.getTime() })
        if (!built.ok) throw new ApiError(422, 'offer_incomplete', built.reason)
        if (existing) return existing
        await tx.insert(events).values({ id: link.eventId, customerId, brief: offer.brief, briefRevision: 1,
          status: 'plan_ready', planRevision: 1, createdAt: now })
        await tx.insert(runs).values({ id: runId, eventId: link.eventId, phase: 'research', briefRevision: 1,
          idempotencyKey: `${link.eventId}:offer:${offer.id}:${offer.revision}`, state: 'succeeded', createdAt: now })
        await tx.insert(plans).values({ id: link.planId, eventId: link.eventId, revision: 1, briefRevision: 1, runId, data: { ...built.plan, planningOffer: { conversationId, offerId, revision: offerRevision, expiresAt: offer.expiresAt } } })
        const data = { ...record, revision: row.revision + 1,
          view: { ...record.view, version: record.view.version + 1, paymentLink: link } }
        await tx.update(planningConversations).set({ revision: data.revision, data }).where(eq(planningConversations.id, conversationId))
        return link
      })
    },
  }
}
