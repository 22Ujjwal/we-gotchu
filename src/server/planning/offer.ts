import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { Brief, CONTRACT_VERSION, Plan } from '../../contracts'
import { planningOptionSchema, type PlanningOption } from '../../agent/planning/contract'

const text = z.string().trim().min(1)
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const selectedOfferSchema = z.object({
  id: text, revision: z.number().int().positive(), inquiryId: text, replyId: text,
  contextMessageIds: z.array(text), expiresAt: z.iso.datetime().nullable(),
  mode: z.enum(['live', 'simulated']), currency: z.string().regex(/^[a-z]{3}$/), brief: Brief,
  missing: z.array(text),
  lines: z.array(z.object({
    option: planningOptionSchema, sourceReplyId: text,
    unitAmount: money.nullable(), units: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    quantityDescription: text, tax: money.nullable(), delivery: money.nullable(), fees: money.nullable(),
    deposit: z.object({ amount: money.nullable(), treatment: z.enum(['included', 'additional', 'unknown']) }).strict(),
    cancellationTerms: text.nullable(),
  }).strict()).min(1),
}).strict()
export type SelectedOffer = z.infer<typeof selectedOfferSchema>

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
