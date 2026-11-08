import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openPgliteDb } from '../db/client'
import { createApp } from './app'
import { agentMailReply, createFakeMail, createFakeNaive, signAgentMailRequest } from './fakes'

const SECRET = `whsec_${Buffer.from('local-commerce-signing-key').toString('base64')}`
const brief = { occasion: 'Dinner', guests: 25, city: 'Berlin', date: '2026-11-20', time: '19:00', budget: { amountMinor: 250000, currency: 'EUR' } }
let close: () => Promise<void>
let app: ReturnType<typeof createApp>
let eventId: string
let contactId: string
let replyNumber = 0

beforeEach(async () => {
  const pg = await openPgliteDb()
  close = pg.close
  app = createApp({ db: pg.db, mail: createFakeMail().provider, naive: createFakeNaive().naive, config: {
    seedContacts: [{ name: 'Cafe Botanico', email: 'venue@example.test', kind: 'venue' }],
    agentMailWebhookSecret: SECRET, evidenceMode: 'fixture',
  } })
  eventId = (await app.createEventForCustomer('maya', brief, true)).eventId
  contactId = (await app.ledger.readEvent(eventId)).contacts[0].id
  replyNumber = 0
})
afterEach(async () => { await close() })

async function reply(text: string) {
  const sent = (await app.ledger.readEvent(eventId)).sent.at(-1)!
  const messageId = `<reply-${++replyNumber}@example.test>`
  const body = agentMailReply({ inboxId: 'arrange@agentmail.test', messageId, inReplyTo: sent.messageId!, threadId: sent.threadId ?? 'thread-1', from: 'venue@example.test', text })
  const response = await app.handleAgentMailWebhook(signAgentMailRequest('http://localhost/webhook', body, SECRET))
  expect(response.status).toBe(200)
  return messageId
}
async function choose() {
  const options = [{ id: 'botanico', name: 'Cafe Botanico', reason: 'Space for the team', sourceUrl: 'https://example.test/venue', imageUrl: 'https://example.test/venue.jpg', knownTerms: ['Private room'], unknownTerms: ['Price and availability'], contactIds: [contactId] }]
  await app.ledger.publishOptions(eventId, 'research-1', options)
  await app.ledger.chooseOption('maya', eventId, 'botanico')
}
async function offer(amountMinor = 9200) {
  await choose()
  await app.sendSupplierEmail({ eventId, contactId, subject: 'Dinner', body: 'Please quote', operationKey: 'inquiry' })
  const text = `${amountMinor} cents per person. Deposit is 30 percent. Free cancellation before 13 November.`
  const messageId = await reply(text)
  await app.ledger.recordSupplierTerms(eventId, messageId, [
    { term: 'price', amountMinor, currency: 'EUR', excerpt: `${amountMinor} cents per person.` },
    { term: 'deposit', note: '30 percent', excerpt: 'Deposit is 30 percent.' },
    { term: 'cancellation', note: 'Free before 13 November', excerpt: 'Free cancellation before 13 November.' },
  ])
  const terms = (await app.ledger.readEvent(eventId)).terms
  return app.ledger.proposeOffer(eventId, 'offer-1', [{ description: 'Dinner for the team', quantity: 25, priceTermId: terms[0].id, depositTermId: terms[1].id, cancellationTermId: terms[2].id }])
}

describe('the complete event ledger', () => {
  it('only accepts sourced options and an owned, stable customer choice', async () => {
    await expect(app.ledger.publishOptions(eventId, 'bad', [{ id: 'bad', name: 'Unverified' }])).rejects.toMatchObject({ code: 'invalid_options' })
    await choose()
    await expect(app.ledger.chooseOption('tom', eventId, 'botanico')).rejects.toMatchObject({ code: 'not_found' })
    await expect(app.ledger.chooseOption('maya', eventId, 'missing')).rejects.toMatchObject({ code: 'unknown_option' })
    await app.ledger.chooseOption('maya', eventId, 'botanico')
    expect((await app.ledger.readEvent(eventId)).commerce.deliveries).toHaveLength(1)
  })

  it('computes offers from evidence and requires explicit approval of the current version', async () => {
    const proposed = await offer()
    expect(proposed.totalMinor).toBe(230000)
    await expect(app.ledger.authorizeCheckout('maya', eventId, proposed.id)).rejects.toMatchObject({ code: 'offer_not_approved' })
    await expect(app.ledger.approveOffer('tom', eventId, proposed.id, false)).rejects.toMatchObject({ code: 'not_found' })
    await app.ledger.approveOffer('maya', eventId, proposed.id, false)
    const checkout = await app.ledger.authorizeCheckout('maya', eventId, proposed.id)
    expect(checkout.amountMinor).toBe(230000)
    expect(await app.ledger.authorizeCheckout('maya', eventId, proposed.id)).toEqual(checkout)
    await expect(app.ledger.proposeOffer(eventId, 'replacement', proposed.lines)).rejects.toMatchObject({ code: 'checkout_locked' })
  })

  it('rejects incomplete evidence and requires a separate decision for an over-budget offer', async () => {
    const proposed = await offer(11000)
    expect(proposed.overBudgetMinor).toBe(25000)
    await expect(app.ledger.approveOffer('maya', eventId, proposed.id, false)).rejects.toMatchObject({ code: 'over_budget' })
    await expect(app.ledger.proposeOffer(eventId, 'bad', [{ description: 'No evidence', quantity: 1 }])).rejects.toMatchObject({ code: 'invalid_offer' })
    await app.ledger.approveOffer('maya', eventId, proposed.id, true)
    expect((await app.ledger.authorizeCheckout('maya', eventId, proposed.id)).amountMinor).toBe(275000)
  })

  it('records matching payment once and confirms suppliers only from a new reply after payment', async () => {
    const proposed = await offer()
    const oldMessage = (await app.ledger.readEvent(eventId)).received[0].messageId
    await expect(app.ledger.recordConfirmation(eventId, contactId, oldMessage, 'Deposit is 30 percent.')).rejects.toMatchObject({ code: 'not_paid' })
    await app.ledger.approveOffer('maya', eventId, proposed.id, false)
    const checkout = await app.ledger.authorizeCheckout('maya', eventId, proposed.id)
    await app.ledger.recordCheckout(eventId, checkout.id, 'cs_test_one', 'https://checkout.stripe.com/test', Date.now() + 3600000)
    const payment = { providerEventId: 'evt_payment', checkoutId: 'cs_test_one', operationId: checkout.id, amountMinor: 230000, currency: 'EUR', paymentIntentId: 'pi_test_one' }
    await expect(app.ledger.recordPayment(eventId, { ...payment, amountMinor: 1 })).rejects.toMatchObject({ code: 'payment_mismatch' })
    await app.ledger.recordPayment(eventId, payment)
    await app.ledger.recordPayment(eventId, payment)
    expect((await app.ledger.readEvent(eventId)).commerce.deliveries.filter(d => d.kind === 'payment')).toHaveLength(1)
    await expect(app.ledger.recordConfirmation(eventId, contactId, oldMessage, 'Deposit is 30 percent.')).rejects.toMatchObject({ code: 'confirmation_not_after_payment' })
    await app.sendSupplierEmail({ eventId, contactId, subject: 'Please confirm', body: 'Payment received. Please confirm.', operationKey: 'confirm' })
    const messageId = await reply('We confirm dinner for 25 on 20 November at 19:00.')
    await app.ledger.recordConfirmation(eventId, contactId, messageId, 'We confirm dinner for 25 on 20 November at 19:00.')
    await app.ledger.recordConfirmation(eventId, contactId, messageId, 'We confirm dinner for 25 on 20 November at 19:00.')
    const final = await app.ledger.readEvent(eventId)
    expect(final.stage).toBe('confirmed')
    expect(final.commerce.confirmations).toHaveLength(1)
    expect(final.commerce.notifications.filter(n => n.kind === 'confirmed')).toHaveLength(1)
  })
})
