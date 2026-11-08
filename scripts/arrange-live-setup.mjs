// Idempotent AgentMail setup for the ARRANGE live gate. Team-controlled inboxes only.
//
//   bun scripts/arrange-live-setup.mjs inboxes           # create the two inboxes + send allowlist
//   bun scripts/arrange-live-setup.mjs webhook <tunnel-url>   # point message.received at the tunnel
//
// Requires AGENTMAIL_API_KEY (bun loads .env.local). Writes the values the app
// needs to .env.arrange-live (gitignored). Re-running is safe: inboxes and the
// webhook are keyed by clientId, and the allowlist entry is added only if absent.
// A webhook re-create rotates the secret; run the webhook phase once per tunnel.

import { AgentMailClient } from 'agentmail'
import { randomBytes } from 'node:crypto'
import { readEnv, updateEnv } from './arrange-live-env.mjs'

const phase = process.argv[2]
if (!['inboxes', 'webhook'].includes(phase)) throw new Error('usage: arrange-live-setup.mjs inboxes|webhook [tunnel-url]')
if (!process.env.AGENTMAIL_API_KEY) throw new Error('AGENTMAIL_API_KEY is not set')
const client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY })

const ENV_FILE = new URL('../.env.arrange-live', import.meta.url).pathname
const envSet = (key, value) => updateEnv(ENV_FILE, { [key]: value })
const envGet = key => readEnv(ENV_FILE)[key]

if (phase === 'inboxes') {
  const arrange = await client.inboxes.create({ username: 'arrange-events', displayName: 'ARRANGE', clientId: 'arrange-lead-v1' })
  const venue = await client.inboxes.create({ username: 'cafe-botanico', displayName: 'Cafe Botanico', clientId: 'arrange-venue-cafe-botanico-v1' })
  console.log('arrange inbox:', arrange.inboxId)
  console.log('venue inbox:  ', venue.inboxId)

  // Send allowlist: the ARRANGE account may only email the controlled venue inbox.
  // Note: a send allow list applies account-wide on AgentMail.
  const existing = await client.lists.list('send', 'allow')
  const entries = (existing.entries ?? existing).map(e => e.entry ?? e)
  if (!entries.includes(venue.inboxId)) {
    await client.lists.create('send', 'allow', { entry: venue.inboxId })
    console.log('allowlist: added', venue.inboxId)
  } else {
    console.log('allowlist: already contains', venue.inboxId)
  }

  envSet('ARRANGE_AGENTMAIL_INBOX_ID', arrange.inboxId)
  envSet('ARRANGE_VENUE_EMAIL', venue.inboxId)
  envSet('ARRANGE_MCP_BEARER', envGet('ARRANGE_MCP_BEARER') ?? randomBytes(24).toString('base64url'))
  console.log('wrote', ENV_FILE)
} else {
  const tunnelUrl = process.argv[3]
  if (!tunnelUrl?.startsWith('https://')) throw new Error('webhook phase needs the https tunnel URL')
  const inboxId = envGet('ARRANGE_AGENTMAIL_INBOX_ID')
  if (!inboxId) throw new Error('run the inboxes phase first')
  const url = `${tunnelUrl}/api/arrange/agentmail/webhook`
  const webhook = await client.webhooks.create({
    url, eventTypes: ['message.received'], inboxIds: [inboxId], clientId: 'arrange-inbound-v1',
  })
  console.log('webhook:', webhook.webhookId, webhook.url, 'enabled:', webhook.enabled)
  envSet('ARRANGE_AGENTMAIL_WEBHOOK_ID', webhook.webhookId)
  envSet('ARRANGE_AGENTMAIL_WEBHOOK_SECRET', webhook.secret)
  envSet('ARRANGE_MCP_URL', `${tunnelUrl}/api/arrange/mcp`)
  console.log('wrote', ENV_FILE)
}
