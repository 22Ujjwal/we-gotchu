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
  const controlled = await db.repository.compareAndSet(saved, { ...saved, view: { ...saved.view,
    arrangement: { id: 'arrangement', inquiryId: 'inquiry', status: 'offer_ready', controlled: true,
      requestedAt: now.toISOString(), selections: [venue], detail: 'Review offer' } } })
  await expect(db.offers.prepare('customer', 'conversation', 'offer', 1, now)).rejects.toMatchObject({ errorCode: 'supplier_confirmation_required' })
  await db.repository.compareAndSet(controlled!, { ...controlled!, view: { ...controlled!.view,
    offerApproval: { offerId: 'offer', offerRevision: 1, approvedAt: now.toISOString() } } } as PlanningRecord)
  await expect(db.offers.prepare('customer', 'conversation', 'offer', 1, now)).rejects.toMatchObject({ errorCode: 'supplier_confirmation_required' })
  const waiting = (await db.repository.getById('conversation'))!
  const { requestOfferConfirmation, processSupplierDecision } = await import('./vendor-coordination')
  const confirming = (await db.repository.compareAndSet(waiting, { ...waiting, view: { ...waiting.view,
    arrangement: { ...waiting.view.arrangement!, status: 'awaiting_offer_confirmation' } } }))!
  const sendInquiry = async () => ({ status: 'accepted' as const, messageId: 'hold-request', threadId: 'thread', acceptedAt: now.toISOString() })
  await requestOfferConfirmation(db.repository, { sendInquiry }, confirming, 'venue@example.com')
  const sent = (await db.repository.getById('conversation'))!
  const confirmation = { ...sent.view.inquiry!.replies![0], id: 'confirmation',
    message: { ...sent.view.inquiry!.replies![0].message, messageId: 'confirmation', inReplyTo: 'wrong-request',
      text: 'The approved terms are unchanged and the room is available.' },
    interpretation: { kind: 'confirmation' as const, confirmsApprovedOffer: true, summary: 'Confirmed', nextAction: 'Pay', missing: [],
      facts: [{ field: 'availability' as const, value: 'Available', quote: 'The approved terms are unchanged and the room is available.' }] } }
  const received = (await db.repository.compareAndSet(sent, { ...sent, view: { ...sent.view,
    inquiry: { ...sent.view.inquiry!, replies: [...sent.view.inquiry!.replies!, confirmation] } } }))!
  const provider = { inboxId: 'arrange', send: async () => ({ messageId: 'customer-notice' }), getMessage: async () => { throw new Error('Unexpected provider read') } }
  await processSupplierDecision(db.repository, provider, received, 'http://localhost:3000')
  expect((await db.repository.getById('conversation'))!.view.offerApproval?.confirmedReplyId).toBeUndefined()
  const linked = (await db.repository.compareAndSet(received, { ...received, view: { ...received.view,
    inquiry: { ...received.view.inquiry!, replies: [received.view.inquiry!.replies![0],
      { ...confirmation, message: { ...confirmation.message, inReplyTo: 'hold-request' } }] } } }))!
  await processSupplierDecision(db.repository, provider, linked, 'http://localhost:3000')
  expect((await db.repository.getById('conversation'))!.view.offerApproval?.confirmedReplyId).toBe('confirmation')
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

test('rechecks a linked offer before approval and after a customer changes selection', async () => {
  await db.offers.save('customer', 'conversation', 0, offer)
  const link = await db.offers.prepare('customer', 'conversation', 'offer', 1, now)
  const plan = (await db.store.getPlan(link.eventId))!
  expect(await db.store.validatePlanOffer!(plan, now)).toBe(true)
  expect(await db.store.validatePlanOffer!(plan, new Date('2026-12-02T00:00:00Z'))).toBe(false)
  const approval = { approvalId: 'approval', eventId: link.eventId, planId: link.planId, planRevision: 1,
    actionIds: plan.actions.map(action => action.actionId), approvedTotal: plan.total, currency: plan.currency,
    approvedAt: now.toISOString(), expiresAt: '2026-11-08T12:30:00Z', revokedAt: null }
  const payment = { paymentId: 'payment', approvalId: 'approval', checkoutSessionId: 'checkout', paymentIntentId: null,
    amount: plan.total, currency: plan.currency, state: 'pending' as const, refundId: null, refundState: 'none' as const,
    refundReason: null, mode: 'test' as const }
  const saved = (await db.repository.getById('conversation'))!
  await db.repository.compareAndSet(saved, { ...saved, view: { ...saved.view, selections: [], version: saved.view.version + 1 } })
  expect(await db.store.validatePlanOffer!(plan, now)).toBe(false)
  await expect(db.store.createApproval(approval, payment)).rejects.toMatchObject({ status: 409, errorCode: 'stale_offer' })
  expect(await db.store.getApproval('approval')).toBeNull()
})

test('customer prepares one payment link through the existing planning command', async () => {
  const { commandPlanning } = await import('./service')
  const saved = await db.offers.save('customer', 'conversation', 0, offer)
  const deps = { repository: db.repository, offers: db.offers, requireCustomerId: async () => 'customer', now: () => now.getTime(),
    agent: () => { throw new Error('Research must not restart') } }
  const command = { kind: 'prepare_payment', requestId: 'payment-link', expectedVersion: saved.view.version, offerId: 'offer', offerRevision: 1 }
  const first = await commandPlanning(deps, 'conversation', command)
  expect(first.paymentLink).toMatchObject({ offerId: 'offer', offerRevision: 1 })
  expect(await commandPlanning(deps, 'conversation', command)).toEqual(first)
})

test('releases only a canceled settled payment plan and preserves its history', async () => {
  const { makeDeps } = await import('../events/testFakes')
  const { approve, cancel } = await import('../events/service')
  await db.offers.save('customer', 'conversation', 0, offer)
  const link = await db.offers.prepare('customer', 'conversation', 'offer', 1, now)
  const getVersion = async () => (await db.repository.getById('conversation'))!.view.version
  await expect(db.offers.release('customer', 'conversation', await getVersion(), link.eventId)).rejects.toMatchObject({ status: 409 })
  const { deps } = makeDeps({ store: db.store, requireCustomerId: async () => 'customer', now: () => now })
  const approved = await approve(deps, link.eventId, link.planId, link.planRevision)
  await cancel(deps, link.eventId)
  await expect(db.offers.release('customer', 'conversation', await getVersion(), link.eventId)).rejects.toMatchObject({ status: 409 })
  await db.store.markPaymentExpired(approved.payment.checkoutSessionId)
  const released = await db.offers.release('customer', 'conversation', await getVersion(), link.eventId)
  expect(released.view.paymentLink).toBeUndefined()
  expect(released.paymentHistory).toEqual([link])
  expect(await db.store.getEvent(link.eventId)).toMatchObject({ status: 'canceled' })
  expect(await db.store.getPaymentByApproval(approved.approval.approvalId)).toMatchObject({ state: 'expired' })
  const updated = await db.offers.save('customer', 'conversation', released.view.version, { ...offer, revision: 2 })
  expect(updated.view.offer?.revision).toBe(2)
})

test.each([
  { changed: false, supplyFirst: false },
  { changed: true, supplyFirst: false },
  { changed: false, supplyFirst: true },
  { delayed: true },
  { duringExecution: 'reply' },
  { duringExecution: 'draft' },
].map(value => ({ changed: false, supplyFirst: false, delayed: false, duringExecution: '', ...value })))('linked offer handles signed payment once, changed: $changed, supply first: $supplyFirst, delayed: $delayed, concurrent: $duringExecution', async ({ changed, supplyFirst, delayed, duringExecution }) => {
  const { default: Stripe } = await import('stripe')
  const { makeDeps, WEBHOOK_SECRET } = await import('../events/testFakes')
  const { approve } = await import('../events/service')
  const { handleStripeWebhook } = await import('../payments/webhook')
  const { scriptedAgentHooks } = await import('../execution/scripted-agent')
  const { configureStore, getExecutionDeps } = await import('../runtime')
  const { setDepsForTests } = await import('../events/deps')
  const selectedOffer = structuredClone(offer)
  if (supplyFirst) {
    const supply = { ...venue, id: 'plates', kind: 'supply' as const, name: 'Controlled plates', url: 'https://example.com/plates' }
    selectedOffer.lines.unshift({ ...selectedOffer.lines[0], option: supply, unitAmount: 347,
      quantityDescription: 'One pack of 24 plates', deposit: { amount: 0, treatment: 'included' } })
    const before = (await db.repository.getById('conversation'))!
    await db.repository.compareAndSet(before, { ...before, view: { ...before.view, selections: [supply, venue], version: before.view.version + 1 } })
  }
  const version = (await db.repository.getById('conversation'))!.view.version
  await db.offers.save('customer', 'conversation', version, selectedOffer)
  const total = supplyFirst ? 20347 : 20000
  const link = await db.offers.prepare('customer', 'conversation', 'offer', 1, now)
  let processingTime = now
  const hooks = { ...scriptedAgentHooks, async onPaymentConfirmed(input: Parameters<typeof scriptedAgentHooks.onPaymentConfirmed>[0]) {
    if (duringExecution) {
      const before = (await db.repository.getById('conversation'))!
      const inquiry = before.view.inquiry!
      const update = duringExecution === 'reply'
        ? { inquiry: { ...inquiry, replies: [...inquiry.replies!, { ...inquiry.replies![0], id: 'thanks',
            message: { ...inquiry.replies![0].message, messageId: 'thanks', text: 'Thank you.' },
            interpretation: { kind: 'other' as const, summary: 'Thank you.', nextAction: 'None.', facts: [], missing: [] } }] } }
        : { selections: [], messages: [...before.view.messages, { id: 'follow-up', role: 'user' as const, text: 'Another question.', createdAt: now.toISOString() }] }
      await db.repository.compareAndSet(before, { ...before, view: { ...before.view, ...update, version: before.view.version + 1 } })
    }
    return scriptedAgentHooks.onPaymentConfirmed(input)
  } }
  const { deps, stripe } = makeDeps({ store: db.store, requireCustomerId: async () => 'customer', now: () => processingTime, hooks })
  configureStore(db.store)
  setDepsForTests(deps)
  try {
    expect(getExecutionDeps().now?.()).toEqual(now)
    const { notifyPlanningPayment } = await import('./payment-notification')
    const customerRecord = (await db.repository.getById('conversation'))!
    await db.repository.compareAndSet(customerRecord, { ...customerRecord, view: { ...customerRecord.view,
      offerApproval: { offerId: 'offer', offerRevision: 1, approvedAt: now.toISOString(), confirmedReplyId: 'reply' },
      inquiry: { ...customerRecord.view.inquiry!, replies: customerRecord.view.inquiry!.replies!.map(reply => ({ ...reply, interpretation: { ...reply.interpretation!, kind: 'confirmation' as const } })) },
      arrangement: { id: 'arrangement', inquiryId: 'inquiry', requestedAt: now.toISOString(), status: 'offer_ready',
        selections: customerRecord.view.selections, detail: 'Ready', customerEmail: 'customer@example.com', controlled: true } } })
    const sent: Array<{ to: string; subject: string; text: string }> = []
    const provider = { inboxId: 'arrange', send: async (mail: typeof sent[number]) => { sent.push(mail); return { messageId: 'receipt-mail' } },
      getMessage: async () => { throw Error('Not used') } }
    const first = await approve(deps, link.eventId, link.planId, 1)
    await notifyPlanningPayment(db.store, db.repository, provider, first.payment.checkoutSessionId, 'http://localhost:3000')
    expect(sent).toHaveLength(0)
    const repeated = await approve(deps, link.eventId, link.planId, 1)
    expect(repeated.payment.paymentId).toBe(first.payment.paymentId)
    expect(stripe.createCalls).toHaveLength(1)
    expect(stripe.createCalls[0].params.line_items![0].price_data!.unit_amount).toBe(total)
    if (changed) {
      const before = (await db.repository.getById('conversation'))!
      await db.repository.compareAndSet(before, { ...before, view: { ...before.view, selections: [], version: before.view.version + 1 } })
    }
    if (delayed) processingTime = new Date('2026-12-02T00:00:00Z')
    const payload = JSON.stringify({ id: 'controlled-payment', object: 'event', type: 'checkout.session.completed',
      created: Math.floor(now.getTime() / 1000), data: { object: { id: first.payment.checkoutSessionId,
        payment_status: 'paid', payment_intent: 'pi_controlled', currency: 'usd', amount_total: total,
        metadata: { approvalId: first.approval.approvalId, eventId: link.eventId, planRevision: '1' } } } })
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
    expect((await handleStripeWebhook(deps, payload, signature)).outcome).toBe(changed ? 'refunded_late_or_revoked' : 'paid')
    expect((await handleStripeWebhook(deps, payload, signature)).outcome).toBe('duplicate')
    const restored = await db.store.getEventView(link.eventId)
    expect(restored?.payment).toMatchObject({ state: 'paid', amount: total, mode: 'test', paidAt: now.toISOString() })
    await notifyPlanningPayment(db.store, db.repository, provider, first.payment.checkoutSessionId, 'http://localhost:3000')
    await notifyPlanningPayment(db.store, db.repository, provider, first.payment.checkoutSessionId, 'http://localhost:3000')
    expect(sent).toHaveLength(changed ? 0 : 1)
    if (!changed) {
      expect(sent[0].text).toContain('Stripe sandbox payment received')
      expect(sent[0].text).toContain(first.payment.paymentId)
      expect(sent[0].text).toContain('Controlled room')
    }
    expect(restored?.attempts).toHaveLength(changed ? 0 : supplyFirst ? 2 : 1)
    if (changed) {
      expect(stripe.refundCalls).toHaveLength(1)
      expect(restored?.payment?.refundState).toBe('pending')
      expect(restored?.event.status).toBe('canceled')
    } else {
      expect(restored?.attempts[0]).toMatchObject({ state: 'succeeded', mode: 'simulated', actualAmount: 20000 })
      if (supplyFirst) expect(restored?.attempts[1]).toMatchObject({ state: 'succeeded', mode: 'simulated', actualAmount: 347 })
      expect(restored?.event.status).toBe('booked')
    }
    expect((await db.repository.getById('conversation'))?.view.paymentLink).toEqual(link)
  } finally {
    setDepsForTests(null)
    configureStore(null)
  }
})
