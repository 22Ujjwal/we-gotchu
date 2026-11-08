import { AgentMailClient } from 'agentmail'
import { readEnv } from './arrange-live-env.mjs'

const env = readEnv(new URL('../.env.arrange-live', import.meta.url))
const id = env.ARRANGE_AGENTMAIL_WEBHOOK_ID
if (!id) throw new Error('No owned webhook ID was recorded; no remote resources changed.')
if (!process.env.AGENTMAIL_API_KEY) throw new Error('AGENTMAIL_API_KEY is not set')
const client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY })
const webhook = await client.webhooks.get(id)
if (webhook.url !== env.ARRANGE_MCP_URL?.replace('/api/arrange/mcp', '/api/arrange/agentmail/webhook')) {
  throw new Error('The recorded webhook URL has changed; no remote resources changed.')
}
if (webhook.enabled) await client.webhooks.update(id, { enabled: false })
const after = await client.webhooks.get(id)
if (after.enabled) throw new Error('Webhook is still enabled')
console.log('Disabled owned webhook', id)
