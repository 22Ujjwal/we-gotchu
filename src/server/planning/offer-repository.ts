import { and, eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { approvals, payments, events, plans, planningConversations, runs, schema } from '../db/schema'
import { ApiError } from '../events/errors'
import { buildSelectedOfferPlan, supplierConfirmedOffer, selectedOfferSchema, type SelectedOffer } from './offer'
import type { PlanningRecord } from './repository'
import type { PlanningPaymentLink } from '../../agent/planning/offer-contract'

const stale = () => new ApiError(409, 'stale_offer', 'The event or offer changed. Reload before continuing.')
function sourceMatches(record: PlanningRecord, offer: SelectedOffer) {
  const inquiry = record.view.inquiry
  const reply = inquiry?.replies?.at(-1)
  return inquiry?.id === offer.inquiryId && inquiry.status !== 'stale'
    && (reply?.id === offer.replyId || supplierConfirmedOffer(record.view)) && reply?.status === 'ready' && reply?.message.mode === offer.mode
    && isDeepStrictEqual(offer.contextMessageIds, record.view.messages.filter(message => message.role === 'user').map(message => message.id))
}

export function createOfferRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  return {
    // Internal model-output storage. Customer commands cannot submit their own prices.
    async save(customerId: string, conversationId: string, expectedVersion: number, input: SelectedOffer, request?: { id: string; fingerprint: string }): Promise<PlanningRecord> {
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
        const data = { ...record, revision: row.revision + 1,
          requests: request ? { ...record.requests, [request.id]: request.fingerprint } : record.requests,
          view: { ...record.view, version: record.view.version + 1, offer, offerApproval: undefined } }
        await tx.update(planningConversations).set({ revision: data.revision, data }).where(eq(planningConversations.id, conversationId))
        return data
      })
    },
    async release(customerId: string, conversationId: string, expectedVersion: number, eventId: string,
      request?: { id: string; fingerprint: string }): Promise<PlanningRecord> {
      return db.transaction(async tx => {
        // Approval and execution also lock the event before the conversation.
        const [event] = await tx.select().from(events).where(and(eq(events.id, eventId), eq(events.customerId, customerId))).for('update')
        const [row] = await tx.select().from(planningConversations).where(and(eq(planningConversations.id, conversationId),
          eq(planningConversations.customerId, customerId))).for('update')
        if (!event || !row) throw new ApiError(404, 'not_found', 'Payment plan not found.')
        const record = row.data
        const link = record.view.paymentLink
        if (record.view.version !== expectedVersion || link?.eventId !== eventId || record.pending) throw stale()
        if (event.status !== 'canceled') throw new ApiError(409, 'cancellation_required', 'Cancel the existing payment plan before replacing it.')
        const related = await tx.select({ payment: payments }).from(payments).innerJoin(approvals, eq(approvals.id, payments.approvalId))
          .where(eq(approvals.eventId, eventId)).for('update', { of: payments })
        if (related.some(({ payment }) => payment.state === 'pending' || payment.state === 'paid' && payment.refundState !== 'succeeded')) {
          throw new ApiError(409, 'payment_unsettled', 'Wait for payment cancellation or refund confirmation before replacing this plan.')
        }
        const data = { ...record, revision: row.revision + 1, paymentHistory: [...(record.paymentHistory ?? []), link],
          requests: request ? { ...record.requests, [request.id]: request.fingerprint } : record.requests,
          view: { ...record.view, version: record.view.version + 1, paymentLink: undefined } }
        await tx.update(planningConversations).set({ revision: data.revision, data }).where(eq(planningConversations.id, conversationId))
        return data
      })
    },
    async prepare(customerId: string, conversationId: string, offerId: string, offerRevision: number, now: Date, request?: { id: string; fingerprint: string }): Promise<PlanningPaymentLink> {
      return db.transaction(async tx => {
        const [row] = await tx.select().from(planningConversations).where(and(eq(planningConversations.id, conversationId),
          eq(planningConversations.customerId, customerId))).for('update')
        if (!row) throw new ApiError(404, 'not_found', 'Conversation not found.')
        const record = row.data
        const offer = record.view.offer
        if (!offer || offer.id !== offerId || offer.revision !== offerRevision || record.pending || !sourceMatches(record, offer)) throw stale()
        if (record.view.arrangement?.controlled && !supplierConfirmedOffer(record.view)) {
          throw new ApiError(409, 'supplier_confirmation_required', 'Approve this offer and wait for the supplier to confirm the same terms before payment.')
        }
        const existing = record.view.paymentLink
        const link: PlanningPaymentLink = existing ?? { eventId: `evt_${randomUUID()}`, planId: `plan_${randomUUID()}`,
          planRevision: 1, offerId, offerRevision }
        if (link.offerId !== offerId || link.offerRevision !== offerRevision) throw stale()
        const runId = `run_${randomUUID()}`
        const built = buildSelectedOfferPlan({ offer, selections: record.view.selections,
          contextMessageIds: record.view.messages.filter(message => message.role === 'user').map(message => message.id),
          eventId: link.eventId, runId, briefRevision: 1, planId: link.planId, planRevision: link.planRevision, now: now.getTime() })
        if (!built.ok) throw new ApiError(422, 'offer_incomplete', built.reason)
        if (built.plan.total === 0) throw new ApiError(422, 'no_payment_due', 'This offer has no payment due. No Checkout is needed.')
        if (existing) return existing
        await tx.insert(events).values({ id: link.eventId, customerId, brief: offer.brief, briefRevision: 1,
          status: 'plan_ready', planRevision: 1, createdAt: now })
        await tx.insert(runs).values({ id: runId, eventId: link.eventId, phase: 'research', briefRevision: 1,
          idempotencyKey: `${link.eventId}:offer:${offer.id}:${offer.revision}`, state: 'succeeded', createdAt: now })
        await tx.insert(plans).values({ id: link.planId, eventId: link.eventId, revision: 1, briefRevision: 1, runId, data: { ...built.plan, planningOffer: { conversationId, offerId, revision: offerRevision, expiresAt: offer.expiresAt } } })
        const data = { ...record, revision: row.revision + 1,
          requests: request ? { ...record.requests, [request.id]: request.fingerprint } : record.requests,
          view: { ...record.view, version: record.view.version + 1, paymentLink: link } }
        await tx.update(planningConversations).set({ revision: data.revision, data }).where(eq(planningConversations.id, conversationId))
        return link
      })
    },
  }
}
