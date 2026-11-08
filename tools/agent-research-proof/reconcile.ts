import { createClient } from '@usenaive-sdk/managed-agents'
import { readFile, writeFile } from 'node:fs/promises'
import { createPlanningFetch } from '../../src/agent/planning/transport'

const id = process.argv[2]
if (!id || !/^[a-f0-9-]{36}$/.test(id) || !process.env.NAIVE_API_KEY) throw new Error('Supply the existing proof ID and configured key')
const path = new URL(`./output/planning-${id}/result.json`, import.meta.url)
const record = JSON.parse(await readFile(path, 'utf8'))
const client = createClient({ apiKey: process.env.NAIVE_API_KEY, baseUrl: 'https://api.vetta.sh', fetch: createPlanningFetch() })
try {
  let after: string | undefined
  const matches: { id: string; status: string; sequence: number }[] = []
  record.reconciliationComplete = false
  for (let page = 0; page < 10; page++) {
    const response = await client.sessions.list({ agent_id: record.agentId, limit: 100, after })
    for (const session of response.data) {
      if (session.metadata?.conversationId === id) matches.push({ id: session.id, status: session.status, sequence: session.last_seq })
    }
    if (!response.has_more) { record.reconciliationComplete = true; break }
    after = response.next_cursor ?? undefined
    if (!after) break
  }
  record.reconciliationMatches = matches
  delete record.reconciliationError
  console.log(JSON.stringify({ complete: record.reconciliationComplete, matches }))
} catch (error) {
  const failure = error as { status?: number; code?: string | number }
  record.reconciliationError = { status: failure.status, code: failure.code }
  console.log(JSON.stringify({ complete: false, error: record.reconciliationError }))
  process.exitCode = 1
} finally {
  await writeFile(path, JSON.stringify(record, null, 2), { mode: 0o600 })
}
