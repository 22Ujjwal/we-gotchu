// Exercises the running local app. Provider decisions and supplier replies are fixtures.
// Never use this script against a public server or real providers.
import { createHmac, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:3100'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('This gate only runs on localhost')
const bearer = process.env.ARRANGE_MCP_BEARER
const mailSecret = process.env.ARRANGE_AGENTMAIL_WEBHOOK_SECRET
const stripeSecret = process.env.ARRANGE_STRIPE_WEBHOOK_SECRET
if (!bearer || !mailSecret || !stripeSecret) throw new Error('Set the three local gate secrets to match the local server')
const run = randomUUID()
let checks = 0
let rpcId = 0
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log(`ok ${checks}: ${message}`) }
async function post(path, body, headers = {}) {
  return fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
async function tool(name, args) {
  const response = await post('/api/arrange/mcp', { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }, { authorization: `Bearer ${bearer}` })
  const body = await response.json()
  if (!response.ok || body.error || body.result?.isError) throw new Error(`${name}: ${JSON.stringify(body)}`)
  return JSON.parse(body.result.content[0].text)
}
const preflight = await fetch(`${base}/api/arrange/local`)
if (!preflight.ok || (await preflight.json()).providers !== 'local-fakes') throw new Error('The target is not an isolated local fake-provider server; no event created')
const brief = { occasion: 'Team dinner', guests: 25, city: 'Berlin', date: '2026-11-20', time: '19:00', budget: { amountMinor: 250000, currency: 'EUR' } }
ok((await post('/api/arrange/mcp', {})).status === 401, 'MCP rejects missing bearer')
ok((await post('/api/arrange/events', { brief, contactConsent: true }, { 'x-forwarded-for': '203.0.113.2' })).status === 401, 'public forwarding cannot use local customer identity')
const created = await post('/api/arrange/events', { brief, contactConsent: true })
ok(created.status === 201, 'customer creates event')
const { eventId } = await created.json()
const read = () => tool('get_event', { eventId })
const event = await read()
ok(event.sessionId?.startsWith('ses_fake_'), 'local fake session is attached; no real provider session was started')
const sessionId = event.sessionId
const contactId = event.contacts[0].id
const supplyContactId = event.contacts[1]?.id
if (!supplyContactId) throw new Error('Configure the local supplies inbox as well as the venue')
const action = input => post(`/api/arrange/events/${eventId}`, input)
await tool('publish_options', { eventId, operationKey: 'research', options: [{ id: 'garden', name: 'Garden dinner', reason: 'A private room with space for 25', sourceUrl: 'https://example.test/venue', imageUrl: 'https://example.test/photo.jpg', knownTerms: ['Private dining room'], unknownTerms: ['Availability, final price, deposit and cancellation'], contactIds: [contactId, supplyContactId] }] })
ok((await read()).stage === 'choosing', 'sourced options are waiting for the customer')
ok((await action({ action: 'choose', optionId: 'garden' })).status === 200, 'customer chooses option')
ok((await action({ action: 'choose', optionId: 'garden' })).status === 200, 'repeated choice is safe')
ok((await read()).commerce.deliveries.filter(d => d.kind === 'choice').length === 1, 'one choice delivery is stored')
const inquiry = { eventId, contactId, operationKey: 'quote', subject: 'Dinner for 25', body: 'Please confirm price, deposit and cancellation terms for 20 November at 19:00.' }
const sent = await tool('send_supplier_email', inquiry)
ok((await tool('send_supplier_email', inquiry)).operationId === sent.operationId, 'supplier send retries reuse the recorded operation')

async function supplierReply(text, label, supplierId = contactId) {
  const outbound = (await read()).sent.filter(item => item.contactId === supplierId).at(-1)
  const contactEmail = event.contacts.find(contact => contact.id === supplierId).email
  const messageId = `<${label}-${run}@supplier.test>`
  const payload = { type: 'event', event_type: 'message.received', event_id: `evt_${label}_${run}`, message: { inbox_id: 'arrange@agentmail.test', message_id: messageId, thread_id: outbound.threadId, from: contactEmail, to: ['arrange@agentmail.test'], subject: 'Re: Dinner for 25', text, timestamp: new Date().toISOString(), in_reply_to: outbound.messageId, references: [outbound.messageId] } }
  const deliver = async () => {
    const body = JSON.stringify(payload)
    const id = `msg_${randomUUID()}`
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = createHmac('sha256', Buffer.from(mailSecret.slice(6), 'base64')).update(`${id}.${timestamp}.${body}`).digest('base64')
    return fetch(`${base}/api/arrange/agentmail/webhook`, { method: 'POST', body, headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` } })
  }
  const response = await deliver()
  ok(response.status === 200 && (await response.json()).status === 'processed', `${label} reply is processed through a signed webhook`)
  ok((await (await deliver()).json()).status === 'duplicate', `${label} reply redelivery is a no-op`)
  return messageId
}
const messageId = await supplierReply('92 EUR per person. Deposit is 30 percent. Cancel free before 13 November.', 'quote')
await tool('record_supplier_terms', { eventId, messageId, terms: [{ term: 'price', amountMinor: 9200, currency: 'EUR', excerpt: '92 EUR per person.' }, { term: 'deposit', excerpt: 'Deposit is 30 percent.' }, { term: 'cancellation', excerpt: 'Cancel free before 13 November.' }] })
await tool('send_supplier_email', { eventId, contactId: supplyContactId, operationKey: 'supplies-quote', subject: 'Table supplies', body: 'Please quote table supplies for 25, including delivery, deposit and cancellation.' })
const supplyMessageId = await supplierReply('150 EUR total including delivery. No deposit. Cancel free before 13 November.', 'supplies-quote', supplyContactId)
await tool('record_supplier_terms', { eventId, messageId: supplyMessageId, terms: [{ term: 'price', amountMinor: 15000, currency: 'EUR', excerpt: '150 EUR total including delivery.' }, { term: 'deposit', excerpt: 'No deposit.' }, { term: 'cancellation', excerpt: 'Cancel free before 13 November.' }] })
const allTerms = (await read()).terms
const terms = allTerms.filter(term => term.contactId === contactId)
const suppliesTerms = allTerms.filter(term => term.contactId === supplyContactId)
const offer = await tool('propose_offer', { eventId, operationKey: 'offer', lines: [{ description: 'Dinner for 25', quantity: 25, priceTermId: terms[0].id, depositTermId: terms[1].id, cancellationTermId: terms[2].id }, { description: 'Table supplies and delivery', quantity: 1, priceTermId: suppliesTerms[0].id, depositTermId: suppliesTerms[1].id, cancellationTermId: suppliesTerms[2].id }] })
ok(offer.totalMinor === 245000, 'offer total is calculated from quantity and recorded supplier price')
ok((await read()).commerce.notifications[0]?.state === 'sent', 'offer-ready notification passes through the local fake sender')
ok((await action({ action: 'checkout', offerId: offer.id })).status === 422, 'checkout refuses an unapproved offer')
ok((await action({ action: 'approve', offerId: offer.id, acceptOverage: false })).status === 200, 'customer approves the exact offer version')
const checkoutResponse = await action({ action: 'checkout', offerId: offer.id })
ok(checkoutResponse.status === 200, 'checkout is created from the approval')
const checkout = await checkoutResponse.json()
ok(checkout.amountMinor === offer.totalMinor, 'checkout amount matches the approved offer')
ok((await (await action({ action: 'checkout', offerId: offer.id })).json()).sessionId === checkout.sessionId, 'checkout retry returns the same session')
ok((await read()).stage === 'awaiting_payment', 'checkout creation does not mark the event paid')
const payment = { id: `evt_paid_${run}`, type: 'checkout.session.completed', livemode: false, created: Math.floor(Date.now() / 1000), data: { object: { id: checkout.sessionId, url: checkout.url, expires_at: Math.floor(checkout.expiresAt / 1000), amount_total: checkout.amountMinor, currency: checkout.currency.toLowerCase(), payment_status: 'paid', payment_intent: `pi_${run}`, metadata: { eventId, offerId: offer.id, operationId: checkout.id, approvalId: checkout.approvalId } } } }
ok((await post('/api/arrange/stripe/webhook', payment)).status === 400, 'unsigned payment cannot change the event')
async function pay() {
  const body = JSON.stringify(payment)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', stripeSecret).update(`${timestamp}.${body}`).digest('hex')
  return fetch(`${base}/api/arrange/stripe/webhook`, { method: 'POST', body, headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` } })
}
ok((await pay()).status === 200, 'signed payment is recorded and delivered')
ok((await pay()).status === 200, 'duplicate signed payment is safe')
ok((await read()).stage === 'paid', 'payment waits for supplier confirmation')
await tool('send_supplier_email', { eventId, contactId, operationKey: 'confirmation', subject: 'Please confirm the dinner', body: 'Payment received. Please confirm the agreed dinner for 25 on 20 November at 19:00.' })
const confirmation = 'We confirm dinner for 25 on 20 November at 19:00 at the agreed price and terms.'
const confirmationMessageId = await supplierReply(confirmation, 'confirmation')
await tool('record_supplier_confirmation', { eventId, contactId, messageId: confirmationMessageId, excerpt: confirmation })
ok((await read()).stage === 'paid', 'one supplier confirmation does not complete a two-supplier event')
await tool('send_supplier_email', { eventId, contactId: supplyContactId, operationKey: 'supplies-confirmation', subject: 'Please confirm supplies', body: 'Payment received. Please confirm delivery of the agreed table supplies.' })
const supplyConfirmation = 'We confirm delivery of the agreed table supplies on 20 November at 18:00.'
const supplyConfirmationId = await supplierReply(supplyConfirmation, 'supplies-confirmation', supplyContactId)
await tool('record_supplier_confirmation', { eventId, contactId: supplyContactId, messageId: supplyConfirmationId, excerpt: supplyConfirmation })
await tool('post_update', { eventId, kind: 'progress', text: 'Your supplier confirmed the details by email. You can read their confirmation below.' })
const final = await read()
ok(final.sessionId === sessionId, 'the same event session is used throughout')
ok(final.commerce.deliveries.filter(d => d.kind === 'payment').length === 1, 'one payment delivery is recorded')
ok(final.commerce.notifications.every(n => n.state === 'sent'), 'both customer notifications are recorded by the local fake sender')
ok(final.stage === 'confirmed', 'supplier confirmation completes the event facts')
const view = await (await fetch(`${base}/api/arrange/events/${eventId}`)).json()
ok(view.stage === 'confirmed' && view.payment.amountMinor === 245000 && view.confirmations.length === 2, 'customer view shows payment and sourced confirmation separately')
ok((await fetch(`${base}/arrange/events/${eventId}`)).status === 200, 'customer event page renders over HTTP')
const evidence = { testedAt: new Date().toISOString(), eventId, sessionId, checks, view, providerMode: 'fixtures; scripted tool calls; real signature verification; no remote provider actions' }
if (process.env.ARRANGE_GATE_EVIDENCE) writeFileSync(process.env.ARRANGE_GATE_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n')
console.log(`Complete local flow passed. Event: ${base}/arrange/events/${eventId}`)
