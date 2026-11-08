import { isDeepStrictEqual } from 'node:util'
import { CONTRACT_VERSION, Plan } from '../../contracts'
import type { PlanningOption } from '../../agent/planning/contract'

export { selectedOfferSchema, type SelectedOffer } from '../../agent/planning/offer-contract'
import { calculateOfferCosts, selectedOfferSchema, type SelectedOffer } from '../../agent/planning/offer-contract'

type Input = {
  offer: SelectedOffer; selections: PlanningOption[]; contextMessageIds: string[];
  eventId: string; runId: string; briefRevision: number; planId: string; planRevision: number; now: number;
}
type Result = { ok: true; plan: Plan } | { ok: false; reason: string }

// Consume a server-saved offer, never a customer-supplied payment amount.
export function buildSelectedOfferPlan(input: Input): Result {
  const parsed = selectedOfferSchema.safeParse(input.offer)
  if (!parsed.success) return { ok: false, reason: 'The offer has invalid or incomplete fields.' }
  const offer = parsed.data
  const fail = (reason: string): Result => ({ ok: false, reason })
  if (offer.missing.length) return fail('The offer still has unresolved requirements.')
  if (offer.expiresAt && Date.parse(offer.expiresAt) <= input.now) return fail('The offer has expired.')
  if (offer.currency !== offer.brief.currency.toLowerCase()) return fail('The offer and event use different currencies.')
  if (!isDeepStrictEqual(offer.contextMessageIds, input.contextMessageIds)) return fail('The customer requirements changed.')
  const selected = new Map(input.selections.map(option => [option.id, option]))
  const ids = offer.lines.map(line => line.option.id)
  if (selected.size !== input.selections.length || new Set(ids).size !== ids.length || ids.length !== selected.size
    || offer.lines.some(line => !isDeepStrictEqual(line.option, selected.get(line.option.id)))) {
    return fail('The offer does not match the current selected options.')
  }
  if (offer.lines.filter(line => line.option.kind === 'venue').length !== 1) return fail('Select exactly one venue.')

  const costs = calculateOfferCosts(offer)
  if (!costs.ok) return costs
  const { amounts, total } = costs
  const venue = offer.lines.find(line => line.option.kind === 'venue')!
  const actionId = (optionId: string) => `${input.planId}:${optionId}`
  const plan = Plan.safeParse({
    planId: input.planId, eventId: input.eventId, runId: input.runId, contractVersion: CONTRACT_VERSION,
    briefRevision: input.briefRevision, revision: input.planRevision,
    selectedCandidateIds: ids, total, currency: offer.currency, serviceFee: 0,
    cancellationTerms: offer.lines.map(line => `${line.option.name}: ${line.cancellationTerms}`).join('\n'),
    agentReasoning: `Customer-selected offer ${offer.id}, revision ${offer.revision}.`,
    mode: 'simulated', budgetFit: 'within', budgetBasis: 'Selected quantities, tax, delivery, fees and additional deposits included.',
    warnings: ['Sandbox payment only. Supplier execution is simulated; payment does not reserve or purchase anything.'],
    actions: offer.lines.map((line, index) => ({
      actionId: actionId(line.option.id), kind: line.option.kind === 'venue' ? 'venue_booking' : 'item_purchase',
      supplierName: line.option.name, target: line.option.name, quantityOrSchedule: line.quantityDescription,
      maximumAmount: amounts[index], cancellationTerms: { known: true, summary: line.cancellationTerms, sourceUrl: line.option.url },
      sourceUrl: line.option.url, dependsOn: line.option.kind === 'venue' ? [] : [actionId(venue.option.id)], mode: 'simulated',
    })),
  })
  return plan.success ? { ok: true, plan: plan.data } : fail('The offer could not be converted to a transaction plan.')
}

// Approval and execution both recheck the saved offer against the immutable plan.
export function isCurrentPlanningOffer(record: import('./repository').PlanningRecord | null, plan: Plan, now: Date): boolean {
  const binding = plan.planningOffer
  if (!binding) return true
  if (!record || record.id !== binding.conversationId || record.pending) return false
  const offer = record.view.offer
  const inquiry = record.view.inquiry
  const reply = inquiry?.replies?.at(-1)
  const link = record.view.paymentLink
  if (!offer || offer.id !== binding.offerId || offer.revision !== binding.revision || offer.expiresAt !== binding.expiresAt
    || inquiry?.id !== offer.inquiryId || inquiry.status === 'stale' || reply?.id !== offer.replyId || reply.status !== 'ready'
    || reply.message.mode !== offer.mode || link?.eventId !== plan.eventId || link.planId !== plan.planId) return false
  const built = buildSelectedOfferPlan({ offer, selections: record.view.selections,
    contextMessageIds: record.view.messages.filter(message => message.role === 'user').map(message => message.id),
    eventId: plan.eventId, runId: plan.runId, briefRevision: plan.briefRevision, planId: plan.planId,
    planRevision: plan.revision, now: now.getTime() })
  return built.ok && isDeepStrictEqual(plan, { ...built.plan, planningOffer: binding })
}
