import { afterEach, beforeEach, expect, test } from 'vitest'
import { createTestPlanningRepository } from '../db/client'
import type { PlanningRecord } from './repository'
import type { SelectedOffer } from './offer'

let db: Awaited<ReturnType<typeof createTestPlanningRepository>>
const venue = { id: 'room', kind: 'venue' as const, name: 'Controlled room', url: 'https://example.com/room', why: 'Selected', facts: [], unknowns: [] }
const offer: SelectedOffer = {
  id: 'offer', revision: 1, inquiryId: 'inquiry', replyId: 'reply', contextMessageIds: ['brief'], currency: 'usd',
  mode: 'simulated', expiresAt: '2026-12-01T00:00:00Z', missing: [],
  brief: { eventType: 'Birthday', location: 'SF', startsAt: '2026-12-12T20:00:00Z', timezone: 'America/Los_Angeles',
    headcount: 12, budget: 30000, currency: 'usd', supplyNeeds: [], maximumCancellationLoss: 0 },
  lines: [{ option: venue, sourceReplyId: 'reply', unitAmount: 20000, units: 1, quantityDescription: 'Room for 12 people',
    tax: 0, delivery: 0, fees: 0, deposit: { amount: 5000, treatment: 'included' }, cancellationTerms: 'Fully refundable.' }],
}
const now = new Date('2026-11-08T12:00:00Z')
beforeEach(async () => {
  db = await createTestPlanningRepository()
  const record: PlanningRecord = { id: 'conversation', customerId: 'customer', createRequestId: 'create', initialMessage: 'Party',
    revision: 0, sessionId: null, sequence: 0, pending: null, requests: {}, view: {
      id: 'conversation', version: 0, status: 'ready', messages: [{ id: 'brief', role: 'user', text: 'Party', createdAt: now.toISOString() }],
      proposal: null, selections: [venue], progress: null, error: null,
      inquiry: { id: 'inquiry', revision: 1, status: 'draft', recipient: 'venue@example.com', subject: 'Party', text: 'Party',
        venue, contextMessageIds: ['brief'], contactSourceUrl: null, updatedAt: now.toISOString(), replies: [{
          id: 'reply', status: 'ready', message: { provider: 'controlled', messageId: 'message', threadId: 'thread', inReplyTo: null,
            from: 'venue@example.com', to: ['planner@example.com'], subject: 'Quote', text: 'USD 200 all included.',
            receivedAt: now.toISOString(), originalRef: 'controlled:message', mode: 'simulated' },
          interpretation: { kind: 'quote', summary: 'Quote', nextAction: 'Review', facts: [], missing: [] },
        }] },
    } }
  await db.repository.insert(record)
})
afterEach(async () => db.close())

test('saves one offer and atomically links concurrent preparation to the same existing transaction records', async () => {
  const saved = await db.offers.save('customer', 'conversation', 0, offer)
  expect(saved.view.offer).toEqual(offer)
  const [first, second] = await Promise.all([
    db.offers.prepare('customer', 'conversation', 'offer', 1, now),
    db.offers.prepare('customer', 'conversation', 'offer', 1, now),
  ])
  expect(second).toEqual(first)
  const event = await db.store.getEvent(first.eventId)
  const plan = await db.store.getPlan(first.eventId)
  expect(event).toMatchObject({ customerId: 'customer', status: 'plan_ready', planRevision: 1 })
  expect(plan).toMatchObject({ planId: first.planId, selectedCandidateIds: ['room'], total: 20000, mode: 'simulated' })
  expect((await db.repository.getById('conversation'))?.view.paymentLink).toEqual(first)
})

test('keeps incomplete offers visible but refuses payment preparation and unauthorized access', async () => {
  const incomplete = { ...offer, missing: ['Tax amount'], lines: [{ ...offer.lines[0], tax: null }] }
  await db.offers.save('customer', 'conversation', 0, incomplete)
  await expect(db.offers.prepare('customer', 'conversation', 'offer', 1, now)).rejects.toMatchObject({ status: 422 })
  await expect(db.offers.prepare('other', 'conversation', 'offer', 1, now)).rejects.toMatchObject({ status: 404 })
  expect((await db.repository.getById('conversation'))?.view.paymentLink).toBeUndefined()
})

test('refuses stale model output and changed selections without creating a payable event', async () => {
  await db.offers.save('customer', 'conversation', 0, offer)
  await expect(db.offers.save('customer', 'conversation', 0, { ...offer, revision: 2 })).rejects.toMatchObject({ status: 409 })
  const saved = (await db.repository.getById('conversation'))!
  await db.repository.compareAndSet(saved, { ...saved, view: { ...saved.view, selections: [], version: saved.view.version + 1 } })
  await expect(db.offers.prepare('customer', 'conversation', 'offer', 1, now)).rejects.toMatchObject({ status: 422 })
})
