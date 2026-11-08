// Local integration gate for the ARRANGE first slice, run over real HTTP against
// `bun run dev` on localhost with fake providers (ARRANGE_FAKE_PROVIDERS=true).
//
// Start the server first, for example:
//   DATABASE_URL= ARRANGE_FAKE_PROVIDERS=true ARRANGE_LOCAL_DB_DIR=/tmp/arrange-gate-db \
//   ARRANGE_LOCAL_CUSTOMER_ID=maya ARRANGE_MCP_BEARER=local-test-bearer \
//   ARRANGE_AGENTMAIL_WEBHOOK_SECRET=whsec_... bun run dev
// Then: bun scripts/arrange-local-gate.mjs
// Env needed here: ARRANGE_MCP_BEARER and ARRANGE_AGENTMAIL_WEBHOOK_SECRET must
// match the server's; BASE_URL defaults to http://localhost:3000.

import { createHmac } from 'node:crypto'

const base = process.env.BASE_URL ?? 'http://localhost:3000'
const bearer = process.env.ARRANGE_MCP_BEARER
const secret = process.env.ARRANGE_AGENTMAIL_WEBHOOK_SECRET
if (!bearer || !secret) throw new Error('Set ARRANGE_MCP_BEARER and ARRANGE_AGENTMAIL_WEBHOOK_SECRET to the server values.')

let step = 0
function ok(condition, label) {
  step += 1
  if (!condition) throw new Error(`gate failed at step ${step}: ${label}`)
  console.log(`ok ${step} - ${label}`)
}

const brief = { occasion: 'Team dinner', guests: 25, city: 'Berlin', date: '2026-11-20', time: '19:00', budget: { amountMinor: 250000, currency: 'EUR' } }

let rpcId = 0
async function rpc(method, params) {
  const response = await fetch(`${base}/api/arrange/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params ? { params } : {}) }),
  })
  return { status: response.status, body: await response.json() }
}
async function callTool(name, args) {
  const { body } = await rpc('tools/call', { name, arguments: args })
  if (body.error) throw new Error(`${name} failed: ${JSON.stringify(body.error)}`)
  return JSON.parse(body.result.content[0].text)
}
function signedWebhook(payload) {
  const body = JSON.stringify(payload)
  const id = `msg_${Math.random().toString(36).slice(2)}`
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return fetch(`${base}/api/arrange/agentmail/webhook`, {
    method: 'POST', body,
    headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
  })
}

// 1. The customer creates the event.
const created = await fetch(`${base}/api/arrange/events`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ brief, contactConsent: true }),
})
ok(created.status === 201, `create event -> ${created.status}`)
const { eventId } = await created.json()

// 2. MCP handshake.
const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gate', version: '1' } })
ok(init.body.result?.serverInfo?.name === 'arrange', 'initialize names the arrange server')
const list = await rpc('tools/list')
const toolNames = list.body.result.tools.map(t => t.name)
ok(['get_event', 'send_supplier_email', 'record_supplier_terms', 'post_update'].every(t => toolNames.includes(t)), 'tools/list has the 4 tools')

// 3. The agent reads the event; the session was started at creation.
const event0 = await callTool('get_event', { eventId })
ok(event0.sessionId && event0.stage === 'getting_started' && event0.contacts.length === 1, 'get_event: session attached, seeded contact present')
const contactId = event0.contacts[0].id

// 4. The agent emails the venue; a retry with the same key does not send twice.
const draft = {
  subject: 'Team dinner for 25 on Friday 20 November',
  body: 'Hello Café Botanico! Could you host a team dinner for 25 on Friday 20 November at 7pm? What would the price per head, the deposit and the cancellation terms be?',
}
const sent = await callTool('send_supplier_email', { eventId, contactId, ...draft, operationKey: 'venue-first-inquiry' })
ok(sent.status === 'sent', 'send_supplier_email -> sent')
const resent = await callTool('send_supplier_email', { eventId, contactId, ...draft, operationKey: 'venue-first-inquiry' })
ok(resent.operationId === sent.operationId && resent.status === 'sent', 'retried send replays the same operation')

// 5. The supplier replies; AgentMail delivers a signed webhook.
// The fake provider's inbox id is its documented default (src/server/arrange/fakes.ts).
const inboxId = process.env.ARRANGE_FAKE_INBOX_ID ?? 'arrange@agentmail.test'
const event1 = await callTool('get_event', { eventId })
const outbound = event1.sent.at(-1)
const reply = {
  type: 'event', event_type: 'message.received', event_id: 'evt_gate_1',
  message: {
    inbox_id: inboxId, message_id: '<reply-1@botanico.test>',
    thread_id: outbound.threadId, from: 'Café Botanico <venue@botanico.test>', to: [inboxId],
    subject: 'Re: Team dinner for 25 on Friday 20 November',
    text: 'We can do the 20th. €92 per head for 25, 30% deposit, free cancellation until 13 Nov.',
    timestamp: new Date().toISOString(), in_reply_to: outbound.messageId, references: [outbound.messageId],
  },
}
const delivered = await signedWebhook(reply)
ok(delivered.status === 200 && (await delivered.json()).status === 'processed', 'signed reply webhook processed')
const duplicate = await signedWebhook({ ...reply, event_id: 'evt_gate_1_redelivery' })
ok((await duplicate.json()).status === 'duplicate', 'duplicate webhook delivery is a no-op')

// 6. The same session continues: record terms, follow up in the same thread, post an update.
const terms = await callTool('record_supplier_terms', {
  eventId, messageId: '<reply-1@botanico.test>',
  terms: [
    { term: 'price_per_head', amountMinor: 9200, currency: 'EUR', excerpt: '€92 per head' },
    { term: 'deposit', note: '30% of the total', excerpt: '30% deposit' },
    { term: 'cancellation', note: 'Free cancellation until 13 Nov', excerpt: 'free cancellation until 13 Nov' },
  ],
})
ok(terms.recorded === 3, 'record_supplier_terms -> 3 recorded')
const followUp = await callTool('send_supplier_email', {
  eventId, contactId, operationKey: 'venue-price-follow-up',
  subject: 'Re: Team dinner for 25 on Friday 20 November',
  body: 'Thank you! Would €85 per head be possible for our group of 25?',
})
ok(followUp.status === 'sent', 'follow-up sent')
const update = await callTool('post_update', { eventId, kind: 'progress', text: "Café Botanico can do the 20th at €92 per head. I've asked whether €85 is possible for your group." })
ok(update.updateId, 'post_update stored')

// 7. The customer view shows every fact and the derived stage.
const viewResponse = await fetch(`${base}/api/arrange/events/${eventId}`)
ok(viewResponse.status === 200, 'event view loads')
const view = await viewResponse.json()
ok(view.stage === 'negotiating', `stage is negotiating (got ${view.stage})`)
ok(view.contacts[0]?.emailsSent === 2 && view.contacts[0]?.replies === 1, 'contacts show 2 emails sent, 1 reply')
ok(view.terms.length === 3 && view.terms.every(t => t.supplier === 'Café Botanico'), '3 terms attributed to Café Botanico')
ok(view.activity.some(a => a.kind === 'progress' && a.text.includes('€92')), 'the agent update is on the timeline')
const threads = (await callTool('get_event', { eventId })).sent.map(s => s.threadId)
ok(new Set(threads).size === 1, 'both emails stayed in one thread')

console.log(`\nlocal gate passed: event ${eventId}, session ${event0.sessionId}`)
