import { expect, test } from 'vitest'
import { buildSelectedOfferPlan, type SelectedOffer } from './offer'
import type { PlanningOption } from '../../agent/planning/contract'

const venue: PlanningOption = { id: 'chosen-room', kind: 'venue', name: 'Controlled room', url: 'https://example.com/room', why: 'Selected', facts: [], unknowns: [] }
const supply: PlanningOption = { ...venue, id: 'chosen-plates', kind: 'supply', name: 'Controlled plates', url: 'https://example.com/plates' }
const offer: SelectedOffer = {
  id: 'offer', revision: 1, inquiryId: 'inquiry', replyId: 'reply', contextMessageIds: ['brief'],
  expiresAt: '2026-12-01T00:00:00Z', mode: 'simulated', currency: 'usd',
  brief: { eventType: 'Birthday', location: 'San Francisco', startsAt: '2026-12-12T20:00:00Z',
    endsAt: '2026-12-12T23:00:00Z', timezone: 'America/Los_Angeles', headcount: 12, budget: 30000,
    currency: 'usd', supplyNeeds: ['plates'], maximumCancellationLoss: 5000 },
  missing: [], lines: [
    { option: venue, unitAmount: 20000, units: 1, quantityDescription: 'Room for 12 guests, noon to 3pm',
      tax: 0, delivery: 0, fees: 0, deposit: { amount: 5000, treatment: 'included' },
      cancellationTerms: 'Fully refundable before December 1.', sourceReplyId: 'reply' },
    { option: supply, unitAmount: 347, units: 1, quantityDescription: '1 pack of 24 plates for 12 guests',
      tax: 35, delivery: 500, fees: 0, deposit: { amount: 0, treatment: 'included' },
      cancellationTerms: 'Refundable before dispatch.', sourceReplyId: 'reply' },
  ],
}
const input = (value = offer) => ({ offer: value, selections: [venue, supply], contextMessageIds: ['brief'],
  eventId: 'event', runId: 'run', briefRevision: 1, planId: 'plan', planRevision: 1,
  now: Date.parse('2026-11-08T12:00:00Z') })

test('maps exact selected items to the existing plan and includes a deposit only once', () => {
  const result = buildSelectedOfferPlan(input())
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.plan.total).toBe(20882)
  expect(result.plan.selectedCandidateIds).toEqual(['chosen-room', 'chosen-plates'])
  expect(result.plan.actions.map(action => action.maximumAmount)).toEqual([20000, 882])
  expect(result.plan.actions[1].quantityOrSchedule).toBe(offer.lines[1].quantityDescription)
  expect(result.plan.actions.every(action => action.mode === 'simulated')).toBe(true)
})

test('blocks missing required costs, unresolved requirements, and an unknown deposit treatment', () => {
  for (const field of ['tax', 'delivery', 'fees', 'unitAmount'] as const) {
    const changed = structuredClone(offer)
    changed.lines[0][field] = null
    expect(buildSelectedOfferPlan(input(changed)).ok).toBe(false)
  }
  const changed = structuredClone(offer)
  changed.lines[0].deposit.treatment = 'unknown'
  expect(buildSelectedOfferPlan(input(changed)).ok).toBe(false)
  expect(buildSelectedOfferPlan(input({ ...offer, missing: ['Date availability'] })).ok).toBe(false)
})

test('refuses stale selections, customer instructions, expired offers and over-budget totals', () => {
  expect(buildSelectedOfferPlan({ ...input(), selections: [venue] }).ok).toBe(false)
  expect(buildSelectedOfferPlan({ ...input(), selections: [{ ...venue, name: 'Changed' }, supply] }).ok).toBe(false)
  expect(buildSelectedOfferPlan({ ...input(), contextMessageIds: ['brief', 'changed-date'] }).ok).toBe(false)
  expect(buildSelectedOfferPlan({ ...input(), now: Date.parse(offer.expiresAt!) }).ok).toBe(false)
  expect(buildSelectedOfferPlan(input({ ...offer, brief: { ...offer.brief, budget: 10000 } })).ok).toBe(false)
})

test('counts an explicitly additional deposit and rejects currency or quantity errors', () => {
  const changed = structuredClone(offer)
  changed.lines[0].deposit.treatment = 'additional'
  const result = buildSelectedOfferPlan(input(changed))
  expect(result.ok && result.plan.total).toBe(25882)
  expect(buildSelectedOfferPlan(input({ ...offer, currency: 'eur' })).ok).toBe(false)
  changed.lines[1].units = 0
  expect(buildSelectedOfferPlan(input(changed)).ok).toBe(false)
})
