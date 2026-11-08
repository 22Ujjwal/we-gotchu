import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openPgliteDb } from '../db/client'
import { createApp, type ArrangeApp } from './app'
import { agentMailReply, createFakeMail, createFakeNaive, signAgentMailRequest } from './fakes'
import { LedgerRefusal } from './ledger'

const SECRET = `whsec_${Buffer.from('local-webhook-signing-key-0001').toString('base64')}`
const VENUE = 'venue@botanico.test'
const brief = { occasion: 'Team dinner', guests: 25, city: 'Berlin', date: '2026-11-20', time: '19:00', budget: { amountMinor: 250_000, currency: 'EUR' } }
const draft = { subject: 'Team dinner on 20 November', body: 'Hello! Could you host 25 people on Friday 20 November at 7pm? What would the price per head, deposit and cancellation terms be?' }

let close: () => Promise<void>
let app: ArrangeApp
let mail: ReturnType<typeof createFakeMail>
let naive: ReturnType<typeof createFakeNaive>

beforeEach(async () => {
  const pg = await openPgliteDb()
  close = pg.close
  mail = createFakeMail()
  naive = createFakeNaive()
  app = createApp({
    db: pg.db, mail: mail.provider, naive: naive.naive,
    config: { seedContacts: [{ name: 'Café Botanico', email: VENUE, kind: 'venue' }], sendCap: 2, agentMailWebhookSecret: SECRET, evidenceMode: 'fixture' },
  })
})
afterEach(async () => { await close() })

async function newEvent(consent = true, customer = 'maya') {
  const { eventId } = await app.createEventForCustomer(customer, brief, consent)
  const event = await app.ledger.readEvent(eventId)
  return { eventId, contactId: event.contacts[0].id }
}
const refusal = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => (error instanceof LedgerRefusal ? error.code : error))
const send = (eventId: string, contactId: string, operationKey: string, d = draft) => app.sendSupplierEmail({ eventId, contactId, operationKey, ...d })

async function deliverReply(eventId: string, text: string, providerEventId?: string) {
  const sent = (await app.ledger.readEvent(eventId)).sent.at(-1)!
  const body = agentMailReply({ inboxId: mail.provider.inboxId, messageId: '<reply-1@botanico.test>', inReplyTo: sent.messageId!, threadId: sent.threadId!, from: `Café Botanico <${VENUE}>`, text, providerEventId })
  return app.handleAgentMailWebhook(signAgentMailRequest('http://localhost/api/arrange/agentmail/webhook', body, SECRET))
}

describe('supplier send authorization', () => {
  it('refuses without consent, to a contact not on the event, past the cap and on a reused key with a different draft', async () => {
    const noConsent = await newEvent(false)
    expect(await refusal(send(noConsent.eventId, noConsent.contactId, 'first'))).toBe('no_consent')

    const event = await newEvent()
    const other = await newEvent()
    expect(await refusal(send(event.eventId, other.contactId, 'first'))).toBe('contact_not_on_event')

    const first = await send(event.eventId, event.contactId, 'first')
    expect(first.status).toBe('sent')
    expect(await refusal(send(event.eventId, event.contactId, 'first', { ...draft, body: 'Something else' }))).toBe('key_conflict')
    expect(await send(event.eventId, event.contactId, 'first')).toEqual(first)

    await send(event.eventId, event.contactId, 'second', { ...draft, body: 'A follow-up' })
    expect(await refusal(send(event.eventId, event.contactId, 'third', { ...draft, body: 'One more' }))).toBe('send_cap_reached')
    expect(mail.sent.filter(m => m.to === VENUE)).toHaveLength(2)
    expect(mail.sent[1].replyToMessageId).toBe(mail.sent[0].messageId)
  })

  it('reconciles an unknown outcome and never sends it again', async () => {
    const { eventId, contactId } = await newEvent()
    mail.loseNextResponse()
    const lost = await send(eventId, contactId, 'first')
    expect(lost.status).toBe('unknown')
    expect((await send(eventId, contactId, 'first')).status).toBe('unknown')

    // Once a provider reference is on record, the retry reads the message instead of sending.
    await app.ledger.recordEmailOutcome(lost.operationId, { state: 'unknown', messageId: mail.sent[0].messageId })
    expect(await send(eventId, contactId, 'first')).toMatchObject({ status: 'sent', messageId: mail.sent[0].messageId })
    expect(mail.sent).toHaveLength(1)
  })
})

describe('inbound supplier email', () => {
  it('stores a duplicate webhook once and delivers it with the same idempotency key', async () => {
    const { eventId, contactId } = await newEvent()
    await send(eventId, contactId, 'first')
    naive.failNextDeliveries(1)

    expect((await deliverReply(eventId, 'We can do the 20th.')).status).toBe(503)
    expect((await deliverReply(eventId, 'We can do the 20th.')).status).toBe(200)
    const again = await deliverReply(eventId, 'We can do the 20th.', 'evt_redelivered')
    expect(await again.json()).toEqual({ status: 'duplicate' })

    const event = await app.ledger.readEvent(eventId)
    expect(event.received).toHaveLength(1)
    expect(event.received[0].deliveryState).toBe('delivered')
    expect(naive.deliverCalls).toEqual([
      { sessionId: event.sessionId, idempotencyKey: 'inbound:<reply-1@botanico.test>' },
      { sessionId: event.sessionId, idempotencyKey: 'inbound:<reply-1@botanico.test>' },
    ])
  })

  it('refuses terms whose excerpt is not in the supplier email', async () => {
    const { eventId, contactId } = await newEvent()
    await send(eventId, contactId, 'first')
    await deliverReply(eventId, 'We can do the 20th. €92 per head for 25, 30% deposit.')
    const messageId = '<reply-1@botanico.test>'
    expect(await refusal(app.ledger.recordSupplierTerms(eventId, messageId, [{ term: 'price_per_head', amountMinor: 8500, currency: 'EUR', excerpt: '€85 per head' }]))).toBe('excerpt_not_in_message')
    expect(await refusal(app.ledger.recordSupplierTerms(eventId, messageId, [{ term: 'price_per_head', amountMinor: 92.5, currency: 'EUR', excerpt: '€92 per head' }]))).toBe('money_not_minor_units')
    expect(await app.ledger.recordSupplierTerms(eventId, messageId, [{ term: 'price_per_head', amountMinor: 9200, currency: 'EUR', excerpt: '€92 per head' }])).toEqual({ recorded: 1 })
    expect((await app.ledger.readEvent(eventId)).terms).toHaveLength(1)
  })
})

describe('customer access', () => {
  it("does not let one customer read another customer's event", async () => {
    const { eventId } = await newEvent(true, 'maya')
    expect((await app.ledger.readEventView('maya', eventId)).id).toBe(eventId)
    expect(await refusal(app.ledger.readEventView('tom', eventId))).toBe('not_found')
  })
})
