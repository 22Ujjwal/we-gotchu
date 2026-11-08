import { createClient } from '@usenaive-sdk/managed-agents'
import { readFile, writeFile } from 'node:fs/promises'
import { planningDefinition } from '../../src/agent/planning/definition'

if (process.env.RESEARCH_LIVE_SMOKE !== '1') throw new Error('Set RESEARCH_LIVE_SMOKE=1 for hosted configuration')
const path = new URL('./output/connection-3f382d84-e7b7-4cab-a2d1-1c49143be8c7/result.json', import.meta.url)
const record = JSON.parse(await readFile(path, 'utf8'))
if (!record.agentId || !record.credentialId || !process.env.NAIVE_API_KEY || !process.env.NAIVE_MODEL) throw new Error('Existing connection and environment required')
const client = createClient({ apiKey: process.env.NAIVE_API_KEY, baseUrl: 'https://api.vetta.sh',
  fetch: async (url, init) => {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) })
    if (!response.ok) {
      const body = await response.clone().json().catch(() => ({}))
      const error = body.error ?? body
      const diagnostic = { method: init?.method ?? 'GET', path: new URL(url.toString()).pathname,
        status: response.status, code: error.code, type: error.type,
        message: typeof error.message === 'string' ? error.message.replaceAll(process.env.NAIVE_API_KEY!, '[redacted]') : null,
        requestId: response.headers.get('x-request-id'), retryAfter: response.headers.get('retry-after') }
      record.lastSetupError = diagnostic
      await writeFile(path, JSON.stringify(record, null, 2), { mode: 0o600 })
      console.log(JSON.stringify(diagnostic))
    }
    return response
  },
})
try {
  const desired = planningDefinition(process.env.NAIVE_MODEL)
  const current = await client.agents.get(record.agentId)
  const updated = current.system === desired.system && current.tools.configs['monid.monid_run']?.permission === 'allow'
    ? current : await client.agents.update(record.agentId, desired)
  record.planningAgentVersion = updated.current_version
  await writeFile(path, JSON.stringify(record, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ agentId: updated.id, version: updated.current_version, configured: true }))
} catch (error) {
  const failure = error as { status?: number; code?: string }
  console.log(JSON.stringify({ configured: false, status: failure.status, code: failure.code }))
  process.exitCode = 1
}
