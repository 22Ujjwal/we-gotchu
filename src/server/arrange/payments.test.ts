import { createHmac } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { openPgliteDb } from '../db/client'
import { createApp } from './app'
import { createFakeMail, createFakeNaive, agentMailReply, signAgentMailRequest } from './fakes'
import { createLocalStripe } from './payments'

const stripeSecret = 'local-stripe-webhook-secret'
const mailSecret = `whsec_${Buffer.from('local-mail-webhook-secret').toString('base64')}`
const closers: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of closers.splice(0)) await close() })

async function prepared() {
  const pg = await openPgliteDb(); closers.push(pg.close)
  const naive = createFakeNaive()
  const mail = createFakeMail()
  const stripe = createLocalStripe()
  const notices: string[] = []
  const app = createApp({ db: pg.db, mail: mail.provider, naive: naive.naive, stripe,
    notify: async input => { notices.push(input.id); return { messageId: `notice-${notices.length}` } },
    config: { seedContacts: [{ name: 'Venue', email: 'venue@example.test', kind: 'venue' }], agentMailWebhookSecret: mailSecret, stripeWebhookSecret: stripeSecret, appUrl: 'http://localhost:3100', evidenceMode: 'fixture' } })
  const { eventId } = await app.createEventForCustomer('maya', { occasion: 'Dinner', guests: 2, city: 'Berlin', date: '2026-11-20', time: '19:00', budget: { amountMinor: 20000, currency: 'EUR' } }, true)
  const contactId = (await app.ledger.readEvent(eventId)).contacts[0].id
  await app.ledger.publishOptions(eventId, 'options', [{ id: 'venue', name: 'Venue', reason: 'Fits the brief', sourceUrl: 'https://example.test', knownTerms: [], unknownTerms: ['Price'], contactIds: [contactId] }])
  naive.failNextDeliveries(1)
  await expect(app.chooseOption('maya', eventId, 'venue')).rejects.toThrow()
  await app.chooseOption('maya', eventId, 'venue')
  expect(naive.deliveries.filter(d => d.idempotencyKey.startsWith('choice:'))).toHaveLength(1)
  await app.sendSupplierEmail({ eventId, contactId, subject: 'Quote', body: 'Please quote', operationKey: 'quote' })
  const sent = mail.sent[0]
  const body = agentMailReply({ inboxId: mail.provider.inboxId, messageId: '<quote@example.test>', inReplyTo: sent.messageId, threadId: sent.threadId, from: 'venue@example.test', text: '80 EUR each. No deposit. Cancel free before November 13.' })
  await app.handleAgentMailWebhook(signAgentMailRequest('http://localhost/mail', body, mailSecret))
  await app.ledger.recordSupplierTerms(eventId, '<quote@example.test>', [
    { term: 'price', amountMinor: 8000, currency: 'EUR', excerpt: '80 EUR each.' },
    { term: 'deposit', excerpt: 'No deposit.' },
    { term: 'cancellation', excerpt: 'Cancel free before November 13.' },
  ])
  const terms = (await app.ledger.readEvent(eventId)).terms
  const offer = await app.proposeOffer(eventId, 'offer', [{ description: 'Dinner', quantity: 2, priceTermId: terms[0].id, depositTermId: terms[1].id, cancellationTermId: terms[2].id }])
  await app.proposeOffer(eventId, 'offer', offer.lines)
  expect(notices).toHaveLength(1)
  await app.ledger.approveOffer('maya', eventId, offer.id, false)
  return { app, stripe, eventId, offer, naive }
}
function paymentRequest(session: unknown, signature = true, live = false) {
  const body = JSON.stringify({ id: 'evt_local_paid', type: 'checkout.session.completed', livemode: live, created: Math.floor(Date.now() / 1000), data: { object: session } })
  const timestamp = Math.floor(Date.now() / 1000)
  const hash = createHmac('sha256', stripeSecret).update(`${timestamp}.${body}`).digest('hex')
  return new Request('http://localhost/api/arrange/stripe/webhook', { method: 'POST', body, headers: signature ? { 'stripe-signature': `t=${timestamp},v1=${hash}` } : {} })
}

it('uses one approved checkout and rejects unsigned, live, or mismatched payment before resuming the same session', async () => {
  const { app, stripe, eventId, offer, naive } = await prepared()
  const checkout = await app.createCheckout('maya', eventId, offer.id)
  expect(await app.createCheckout('maya', eventId, offer.id)).toEqual(checkout)
  const session = await stripe.checkout.sessions.retrieve(checkout.sessionId!)
  expect(session.amount_total).toBe(16000)
  expect((await app.handleStripeWebhook(paymentRequest(session, false))).status).toBe(400)
  expect((await app.handleStripeWebhook(paymentRequest({ ...session, payment_status: 'paid', payment_intent: 'pi_local' }, true, true))).status).toBe(400)
  expect((await app.handleStripeWebhook(paymentRequest({ ...session, payment_status: 'paid', payment_intent: 'pi_local', amount_total: 1 }))).status).toBe(422)
  expect((await app.ledger.readEvent(eventId)).commerce.payment).toBeUndefined()
  const paid = { ...session, payment_status: 'paid', payment_intent: 'pi_local' }
  naive.failNextDeliveries(1)
  expect((await app.handleStripeWebhook(paymentRequest(paid))).status).toBe(503)
  expect((await app.handleStripeWebhook(paymentRequest(paid))).status).toBe(200)
  expect((await app.handleStripeWebhook(paymentRequest(paid))).status).toBe(200)
  const deliveries = naive.deliveries.filter(d => d.idempotencyKey.startsWith('payment:'))
  expect(deliveries).toHaveLength(1)
  expect(deliveries[0].sessionId).toBe((await app.ledger.readEvent(eventId)).sessionId)
  expect((await app.ledger.readEvent(eventId)).stage).toBe('paid')
})
