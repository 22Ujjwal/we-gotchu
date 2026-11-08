import { createClient } from '@usenaive-sdk/managed-agents'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createPlanningFetch } from '../../src/agent/planning/transport'
import { createPlanningAgent } from '../../src/agent/planning/provider'
import type { PlanningProposal } from '../../src/agent/planning/contract'

if (process.env.RESEARCH_LIVE_SMOKE !== '1' || !process.env.NAIVE_API_KEY) throw new Error('Explicit live test and key required')
const connection = JSON.parse(await readFile(new URL('./output/connection-3f382d84-e7b7-4cab-a2d1-1c49143be8c7/result.json', import.meta.url), 'utf8'))
if (!connection.planningAgentVersion) throw new Error('Configure the existing agent before testing')
const client = createClient({ apiKey: process.env.NAIVE_API_KEY, baseUrl: 'https://api.vetta.sh', fetch: createPlanningFetch() })
const agent = createPlanningAgent({ client, agentId: connection.agentId })
const id = randomUUID()
const directory = new URL(`./output/planning-${id}/`, import.meta.url)
await mkdir(directory, { recursive: true, mode: 0o700 })
const record: Record<string, unknown> = { id, agentId: connection.agentId, agentVersion: connection.planningAgentVersion, turns: [] }
const save = () => writeFile(new URL('result.json', directory), JSON.stringify(record, null, 2).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')), { mode: 0o600 })
let sessionId: string | undefined
async function wait(baseline: number): Promise<PlanningProposal> {
  const until = Date.now() + 240_000
  while (Date.now() < until) {
    let result: Awaited<ReturnType<typeof agent.read>>
    try { result = await agent.read({ sessionId: sessionId!, afterSequence: baseline }) }
    catch (error) {
      const status = (error as { status?: number }).status
      if (status === 429 || status && status >= 500 || !status) {
        record.readFailures = Number(record.readFailures ?? 0) + 1
        await save()
        console.log(JSON.stringify({ readRetry: true, status: status ?? 'network' }))
        await new Promise(resolve => setTimeout(resolve, 10_000))
        continue
      }
      throw error
    }
    record.latest = result; await save()
    console.log(JSON.stringify({ status: result.status, sequence: result.sequence }))
    if (result.status === 'ready' && result.proposal) return result.proposal
    if (result.status !== 'working') throw new Error(result.error ?? result.status)
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  throw new Error('Hosted research did not finish within the test window')
}
try {
  const start = await agent.start({ conversationId: id, requestId: `${id}:start`, message: 'I am planning a birthday for 20 adults in San Francisco on December 12, 2026 from 6pm to 9pm America/Los_Angeles. Budget USD500 for venue and paper plates. Find a practical venue shortlist and suitable birthday paper plates. Published rates and listing prices are useful, even if availability needs checking. Do not contact or book anyone. Please research now rather than asking another question.' })
  sessionId = start.sessionId; record.sessionId = sessionId; await save()
  const first = await wait(start.sequence)
  ;(record.turns as unknown[]).push(first); await save()
  const selected = first.options.find(option => option.kind === 'venue')
  if (!selected) throw new Error('Research produced no venue to select')
  record.selected = selected
  const followup = await agent.send({ sessionId, requestId: `${id}:followup`, selections: [selected], message: 'Keep my selected venue. Can you find cheaper plain paper plates for 20 people? Keep known venue facts and explain the supply choice briefly.' })
  const second = await wait(followup.sequence)
  ;(record.turns as unknown[]).push(second)
  record.selectionRetained = second.options.some(option => option.id === selected.id)
  const snapshot = await client.sessions.get(sessionId)
  record.consumedMicroUsd = snapshot.consumed_micro_usd
  record.completed = true
} catch (error) {
  const failure = error as { status?: number; code?: string; message?: string }
  record.error = { status: failure.status, code: failure.code, message: failure.status ? 'Provider request rejected' : failure.message }
  process.exitCode = 1
} finally {
  if (sessionId) {
    try {
      const events = await client.sessions.events(sessionId, { after_seq: 0, limit: 1000 })
      record.toolEvents = events.data.filter(event => /tool|degraded/.test(event.type))
    } catch { record.eventsUnavailable = true }
    try { await client.sessions.cancel(sessionId); record.sessionStopped = true } catch { record.sessionStopped = false }
  }
  await save()
  console.log(JSON.stringify({ id, sessionId, completed: record.completed, selectionRetained: record.selectionRetained, consumedMicroUsd: record.consumedMicroUsd, error: record.error, sessionStopped: record.sessionStopped }))
}
