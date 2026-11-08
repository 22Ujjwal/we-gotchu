import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openPgliteDb } from '../db/client'
import { createApp, type ArrangeApp } from './app'
import { agentMailReply, createFakeMail, createFakeNaive, signAgentMailRequest } from './fakes'

// Drives the real ARRANGE routes (MCP, AgentMail webhook, customer API) on PGlite
// with fake AgentMail and Naïve adapters.

let app: ArrangeApp
let customerId = 'maya'
vi.mock('./runtime', () => ({ getArrangeApp: async () => app, getArrangeCustomerId: async () => customerId }))
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => ({ options }) }))
const { Route: mcpRoute } = await import('../../routes/api/arrange.mcp')
const { Route: webhookRoute } = await import('../../routes/api/arrange.agentmail.webhook')
const { Route: eventsRoute } = await import('../../routes/api/arrange.events')
const { Route: eventRoute } = await import('../../routes/api/arrange.events.$eventId')

type Handler = (context: { request: Request; params: Record<string, string> }) => Promise<Response>
const handlers = (route: unknown) => (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers

const BEARER = 'local-test-bearer'
const SECRET = `whsec_${Buffer.from('local-webhook-signing-key-0001').toString('base64')}`
const VENUE = 'venue@botanico.test'
const brief = { occasion: 'Team dinner', guests: 25, city: 'Berlin', date: '2026-11-20', time: '19:00', budget: { amountMinor: 250_000, currency: 'EUR' } }

let close: () => Promise<void>
let mail: ReturnType<typeof createFakeMail>
let naive: ReturnType<typeof createFakeNaive>

beforeEach(async () => {
  const pg = await openPgliteDb()
  close = pg.close
  mail = createFakeMail()
  naive = createFakeNaive()
  customerId = 'maya'
  app = createApp({
    db: pg.db, mail: mail.provider, naive: naive.naive,
    config: { seedContacts: [{ name: 'Café Botanico', email: VENUE, kind: 'venue' }], mcpBearer: BEARER, agentMailWebhookSecret: SECRET, evidenceMode: 'fixture' },
  })
})
afterEach(async () => { await close() })

let rpcId = 0
async function rpc(method: string, params?: Record<string, unknown>, bearer = BEARER) {
  const response = await handlers(mcpRoute).POST({
    params: {},
    request: new Request('http://localhost/api/arrange/mcp', {
      method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params ? { params } : {}) }),
    }),
  })
  return { status: response.status, body: await response.json() as any }
}
async function callTool(name: string, args: Record<string, unknown>) {
  const { body } = await rpc('tools/call', { name, arguments: args })
  return { isError: !!body.result.isError, payload: JSON.parse(body.result.content[0].text) }
}
async function createEvent() {
  const response = await handlers(eventsRoute).POST({ params: {}, request: new Request('http://localhost/api/arrange/events', { method: 'POST', body: JSON.stringify({ brief, contactConsent: true }) }) })
  expect(response.status).toBe(201)
  return (await response.json() as { eventId: string }).eventId
}

describe('local spike: get_event over the MCP route', () => {
  it('answers initialize, lists tools and reads a seeded event', async () => {
    const eventId = await createEvent()

    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'naive', version: '1' } })
    expect(init.body.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'arrange' }, capabilities: { tools: {} } })

    const list = await rpc('tools/list')
    expect(list.body.result.tools.map((t: { name: string }) => t.name)).toContain('get_event')

    const { isError, payload } = await callTool('get_event', { eventId })
    expect(isError).toBe(false)
    expect(payload).toMatchObject({ id: eventId, brief, contactConsent: true, sessionId: 'ses_fake_1', stage: 'getting_started', contacts: [{ name: 'Café Botanico', email: VENUE }] })
    expect(payload.customerId).toBeUndefined()
  })

  it('refuses a request without the bearer', async () => {
    expect((await rpc('tools/list', undefined, 'wrong')).status).toBe(401)
  })
})

describe('local integration gate: one supplier exchange, same session', () => {
  it('sends once, delivers the reply to the same session, records terms and shows every fact', async () => {
    const eventId = await createEvent()

    // The agent reads the event and decides to email the venue.
    const before = (await callTool('get_event', { eventId })).payload
    const contactId = before.contacts[0].id
    const sent = await callTool('send_supplier_email', {
      eventId, contactId,
      subject: 'Team dinner for 25 on Friday 20 November',
      body: 'Hello Café Botanico! Could you host a team dinner for 25 on Friday 20 November at 7pm? What would the price per head, the deposit and the cancellation terms be?',
      operationKey: 'venue-first-inquiry',
    })
    expect(sent.isError).toBe(false)
    expect(sent.payload).toMatchObject({ status: 'sent' })
    expect(mail.sent).toHaveLength(1)

    // A retried call with the same key does not send again.
    const retry = await callTool('send_supplier_email', {
      eventId, contactId, operationKey: 'venue-first-inquiry',
      subject: 'Team dinner for 25 on Friday 20 November',
      body: 'Hello Café Botanico! Could you host a team dinner for 25 on Friday 20 November at 7pm? What would the price per head, the deposit and the cancellation terms be?',
    })
    expect(retry.payload).toEqual(sent.payload)
    expect(mail.sent).toHaveLength(1)

    // The supplier replies; AgentMail delivers a correctly signed webhook.
    const sentMessageId = mail.sent[0].messageId
    mail.registerInbound('<reply-1@botanico.test>', mail.sent[0].threadId)
    const replyBody = agentMailReply({
      inboxId: mail.provider.inboxId, messageId: '<reply-1@botanico.test>', inReplyTo: sentMessageId, threadId: mail.sent[0].threadId,
      from: `Café Botanico <${VENUE}>`,
      text: 'We can do the 20th. €92 per head for 25, 30% deposit, free cancellation until 13 Nov.',
    })
    const webhook = async (body: string, svixId?: string) => handlers(webhookRoute).POST({
      params: {}, request: signAgentMailRequest('http://localhost/api/arrange/agentmail/webhook', body, SECRET, svixId),
    })
    const delivered = await webhook(replyBody)
    expect(delivered.status).toBe(200)
    expect(await delivered.json()).toEqual({ status: 'processed' })

    // Delivered once, to the same stored session id.
    const event = await app.ledger.readEvent(eventId)
    expect(event.received).toHaveLength(1)
    expect(event.received[0].deliveryState).toBe('delivered')
    expect(naive.deliveries).toEqual([
      { sessionId: event.sessionId, idempotencyKey: 'inbound:<reply-1@botanico.test>', message: expect.stringContaining('€92 per head') },
    ])

    // A duplicate delivery of the same webhook changes nothing.
    const duplicate = await webhook(replyBody, 'evt_redelivered_by_agentmail')
    expect(await duplicate.json()).toEqual({ status: 'duplicate' })
    expect((await app.ledger.readEvent(eventId)).received).toHaveLength(1)
    expect(naive.deliveries).toHaveLength(1)

    // The same session continues: it records the terms and posts an update for the customer.
    const terms = await callTool('record_supplier_terms', {
      eventId, messageId: '<reply-1@botanico.test>',
      terms: [
        { term: 'price_per_head', amountMinor: 9200, currency: 'EUR', excerpt: '€92 per head' },
        { term: 'deposit', note: '30% of the total', excerpt: '30% deposit' },
        { term: 'cancellation', note: 'Free cancellation until 13 Nov', excerpt: 'free cancellation until 13 Nov' },
      ],
    })
    expect(terms.payload).toEqual({ recorded: 3 })

    // It decides the price needs a follow-up, stays in the same thread, and tells the customer.
    const followUp = await callTool('send_supplier_email', {
      eventId, contactId, operationKey: 'venue-price-follow-up',
      subject: 'Re: Team dinner for 25 on Friday 20 November',
      body: 'Thank you! Would €85 per head be possible for our group of 25?',
    })
    expect(followUp.payload).toMatchObject({ status: 'sent' })
    expect(mail.sent).toHaveLength(2)
    expect(mail.sent[1].threadId).toBe(mail.sent[0].threadId)
    const update = await callTool('post_update', {
      eventId, kind: 'progress',
      text: "Café Botanico can do the 20th at €92 per head. That's close to your budget, so I've asked whether €85 is possible.",
    })
    expect(update.isError).toBe(false)

    // The customer comes back and sees every fact and the derived stage.
    const view = await handlers(eventRoute).GET({ params: { eventId }, request: new Request(`http://localhost/api/arrange/events/${eventId}`) })
    expect(view.status).toBe(200)
    const customer = await view.json() as any
    expect(customer.stage).toBe('negotiating')
    expect(customer.headline).toContain('Café Botanico')
    expect(customer.contacts).toEqual([{ id: contactId, name: 'Café Botanico', kind: 'venue', emailsSent: 2, replies: 1 }])
    expect(customer.terms.map((t: any) => [t.term, t.amountMinor, t.supplier])).toEqual([
      ['price_per_head', 9200, 'Café Botanico'], ['deposit', null, 'Café Botanico'], ['cancellation', null, 'Café Botanico'],
    ])
    expect(customer.activity.map((a: any) => a.kind)).toEqual(
      expect.arrayContaining(['email_sent', 'reply_received', 'progress']),
    )
    expect(customer.activity.find((a: any) => a.kind === 'progress').text).toContain('€92')

    // Another customer gets a 404.
    customerId = 'tom'
    const denied = await handlers(eventRoute).GET({ params: { eventId }, request: new Request(`http://localhost/api/arrange/events/${eventId}`) })
    expect(denied.status).toBe(404)
  })
})

it('publishes sourced options through MCP and accepts only the owning customer choice', async () => {
  const eventId = await createEvent()
  const event = await app.ledger.readEvent(eventId)
  const result = await callTool('publish_options', { eventId, operationKey: 'options', options: [{ id: 'garden', name: 'Garden dinner', reason: 'A quiet space for the team', sourceUrl: 'https://example.test/garden', knownTerms: [], unknownTerms: ['Availability'], contactIds: [event.contacts[0].id] }] })
  expect(result.isError).toBe(false)
  const choose = () => handlers(eventRoute).POST({ params: { eventId }, request: new Request(`http://localhost/api/arrange/events/${eventId}`, { method: 'POST', body: JSON.stringify({ action: 'choose', optionId: 'garden' }) }) })
  customerId = 'tom'
  expect((await choose()).status).toBe(404)
  customerId = 'maya'
  expect((await choose()).status).toBe(200)
  expect((await choose()).status).toBe(200)
  expect(naive.deliveries.filter(d => d.idempotencyKey.startsWith('choice:'))).toHaveLength(1)
})
