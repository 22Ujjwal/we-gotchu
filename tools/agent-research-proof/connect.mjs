import { createClient } from '@usenaive-sdk/managed-agents'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
if (process.env.RESEARCH_LIVE_SMOKE !== '1') throw new Error('Set RESEARCH_LIVE_SMOKE=1')
for (const key of ['NAIVE_API_KEY', 'MONID_API_KEY', 'NAIVE_MODEL']) if (!process.env[key]) throw new Error(`Missing ${key}`)
const id = process.env.RESUME_CONNECTION ?? randomUUID()
if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid connection record ID')
const directory = new URL(`./output/connection-${id}/`, import.meta.url)
await mkdir(directory, { recursive: true, mode: 0o700 })
const record = process.env.RESUME_CONNECTION
  ? JSON.parse(await readFile(new URL('result.json', directory), 'utf8'))
  : { id, tools: [], cleanup: {} }
if (record.sessionId) throw new Error('Existing session must be inspected before another run')
delete record.error
const save = () => writeFile(new URL('result.json', directory), JSON.stringify(record, null, 2), { mode: 0o600 })
const client = createClient({ baseUrl: 'https://api.vetta.sh', apiKey: process.env.NAIVE_API_KEY,
  fetch: async (url, init) => {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(45000) })
    console.log(JSON.stringify({ method: init?.method ?? 'GET', path: new URL(url).pathname, status: response.status, retryAfter: response.headers.get('retry-after') }))
    return response
  },
})
let session
try {
  const vault = record.vaultId ? await client.vaults.get(record.vaultId)
    : await client.vaults.create({ display_name: `Arrange research Monid ${id.slice(0, 8)}` })
  record.vaultId = vault.id; record.adminVerified = true; await save()
  console.log(JSON.stringify({ adminVerified: true, vaultId: vault.id }))
  const agent = record.agentId ? await client.agents.get(record.agentId) : await client.agents.create({ name: `arrange-research-${id.slice(0, 8)}`, model: process.env.NAIVE_MODEL,
    harness: 'pi', window: 'immediate', handoffs: false,
    budget: { cap_micro_usd: 500000, max_task_micro_usd: 500000, period: 'month' },
    mcp_servers: [{ type: 'url', name: 'monid', url: 'https://mcp.monid.ai/v1' }],
    tools: { default_config: { permission: 'deny' }, configs: {
      'monid.monid_discover': { permission: 'allow' }, 'monid.monid_inspect': { permission: 'allow' },
    } },
    system: 'You are the Arrange research connectivity test. Call monid.monid_inspect for provider channel3 endpoint /v1/search. Read the tool response and report its provider, endpoint, and query parameter names using submit_output. Do not guess from prior knowledge. Do not run a paid endpoint or contact anyone.',
  })
  record.agentId = agent.id; record.agentVersion = agent.current_version; await save()
  const credential = record.credentialId ? { id: record.credentialId } : await client.vaults.credentials.create(vault.id, { kind: 'static_bearer', key: 'Arrange Monid research',
    value: process.env.MONID_API_KEY, mcp_server_url: 'https://mcp.monid.ai/v1', agent_id: agent.id })
  record.credentialId = credential.id; await save()
  session = await client.sessions.create({ agent_id: agent.id, budget_micro_usd: 500000,
    message: 'Inspect the Monid channel3 product search endpoint now using its MCP tool and return what it supports.',
    output_schema: { type: 'object', required: ['provider', 'endpoint', 'parameters'], additionalProperties: false,
      properties: { provider: { type: 'string' }, endpoint: { type: 'string' }, parameters: { type: 'array', items: { type: 'string' } } } },
    structured_output_required: true, metadata: { proofId: id, purpose: 'monid-connectivity' },
  }, { idempotencyKey: `${id}:connectivity` })
  record.sessionId = session.id; await save()
  console.log(JSON.stringify({ agentId: agent.id, sessionId: session.id }))
  let after = 0
  const deadline = Date.now() + 240000
  while (Date.now() < deadline) {
    const events = await client.sessions.events(session.id, { after_seq: after, limit: 100 })
    for (const event of events.data) {
      after = Math.max(after, event.seq)
      if (/tool|degraded|error/.test(event.type)) record.tools.push(event)
    }
    const current = await client.sessions.get(session.id)
    record.status = current.status; record.stopReason = current.stop_reason
    if (current.status === 'idle' || ['failed', 'cancelled', 'completed'].includes(current.status)) {
      record.result = current.structured_output; record.consumedMicroUsd = current.consumed_micro_usd
      record.pendingActions = current.pending_actions
      await save(); break
    }
    await save()
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
} catch (error) {
  record.error = { name: error.name, status: error.status, code: error.code,
    message: String(error.message).replaceAll(process.env.NAIVE_API_KEY, '[redacted]').replaceAll(process.env.MONID_API_KEY, '[redacted]') }
  process.exitCode = 1
} finally {
  if (session) {
    try { await client.sessions.cancel(session.id); record.cleanup.sessionStopped = true }
    catch (error) { record.cleanup.sessionStopped = { status: error.status, code: error.code } }
  }
  record.retained = 'Research-only agent and agent-bound vault credential retained for reuse; no execution or cancellation tools enabled.'
  await save()
  console.log(JSON.stringify({ id, adminVerified: record.adminVerified, agentId: record.agentId, vaultId: record.vaultId,
    status: record.status, stopReason: record.stopReason, result: record.result, error: record.error, cleanup: record.cleanup }))
}
