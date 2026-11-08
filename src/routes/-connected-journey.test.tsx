import { expect, test } from 'vitest'
import { EventView } from '../contracts'
import { createEventViewFixture, type EventViewScenario } from '../lib/hostwell/event-view.test-fixtures'

const scenarios: EventViewScenario[] = [
  'running', 'partial', 'failed', 'missingInput', 'planReady', 'awaitingPayment',
  'booked', 'canceling', 'refundPending', 'refundCompleted',
]

for (const scenario of scenarios) {
  test(`${scenario} supplies a complete response with consistent event, run, and revision identities`, () => {
    const view = createEventViewFixture(scenario, { eventId: 'evt_second', customerId: 'customer_second', briefRevision: 3 })
    expect(EventView.safeParse(view).success).toBe(true)
    expect(view.event).toMatchObject({ eventId: 'evt_second', customerId: 'customer_second', briefRevision: 3 })
    expect(view.run).toMatchObject({ eventId: view.event.eventId, briefRevision: 3 })
    if (view.researchResult) expect(view.researchResult).toMatchObject({
      eventId: view.event.eventId, runId: view.run!.runId, briefRevision: 3, superseded: false,
    })
    if (view.plan) expect(view.plan).toMatchObject({
      eventId: view.event.eventId, runId: view.run!.runId, briefRevision: 3, revision: view.event.planRevision,
    })
    if (view.approval) {
      expect(view.approval).toMatchObject({ eventId: view.event.eventId, planId: view.plan!.planId, planRevision: view.plan!.revision })
      expect(view.approval.actionIds).toEqual(view.plan!.actions.map(action => action.actionId))
    }
    if (view.payment) expect(view.payment.approvalId).toBe(view.approval!.approvalId)
    for (const attempt of view.attempts) {
      expect(attempt.eventId).toBe(view.event.eventId)
      expect(attempt.approvalId).toBe(view.approval!.approvalId)
      expect(view.approval!.actionIds).toContain(attempt.actionId)
    }
    expect(view.progress.every(entry => entry.eventId === view.event.eventId)).toBe(true)
    expect(view.event.progressSequence).toBe(view.progress.at(-1)!.sequence)
  })
}

test('research-only responses cannot accidentally inherit approval or payment evidence', () => {
  for (const scenario of ['running', 'partial', 'failed', 'missingInput'] as const) {
    const view = createEventViewFixture(scenario)
    expect(view.plan).toBeNull()
    expect(view.approval).toBeNull()
    expect(view.payment).toBeNull()
    expect(view.attempts).toEqual([])
  }
  expect(createEventViewFixture('running').researchResult).toBeNull()
  expect(createEventViewFixture('partial').researchResult!.budgetFit).toBe('unknown')
  expect(createEventViewFixture('missingInput').researchResult!.missing).toEqual(['location'])
})

test('checkout pending and completed refund scenarios have distinct authoritative evidence', () => {
  const checkout = createEventViewFixture('awaitingPayment')
  expect(checkout.payment).toMatchObject({ state: 'pending', paymentIntentId: null, refundState: 'none' })
  expect(checkout.attempts).toEqual([])
  expect(createEventViewFixture('refundPending').payment!.refundState).toBe('pending')
  const refunded = createEventViewFixture('refundCompleted')
  expect(refunded.payment).toMatchObject({ state: 'paid', refundState: 'succeeded' })
  expect(refunded.progress.at(-1)!.message).toContain('Refund completed')
})

test('scenario builders isolate edits from other events and shared examples', () => {
  const edited = createEventViewFixture('planReady')
  edited.event.brief.location = 'Unsent edit'
  edited.plan!.actions.length = 0
  const fresh = createEventViewFixture('planReady')
  expect(fresh.event.brief.location).toBe('San Francisco, CA')
  expect(fresh.plan!.actions).toHaveLength(2)
})
