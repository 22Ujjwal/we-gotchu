import { createClient } from '@usenaive-sdk/managed-agents'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { singlePlannerDefinition } from '../../src/agent/planning/single'
import { createPlanningFetch } from '../../src/agent/planning/transport'

const model = process.env.NAIVE_MODEL
if (!model) throw new Error('NAIVE_MODEL is required')
const desired = singlePlannerDefinition(model)
if (process.env.RESEARCH_LIVE_SMOKE !== '1') {
  console.log(JSON.stringify({ mode: 'dry-run', name: desired.name, model, startsSessions: false, changesTeam: false }))
  process.exit(0)
}
if (!process.env.NAIVE_API_KEY) throw new Error('NAIVE_API_KEY is required')
const directory = new URL('./output/', import.meta.url)
await mkdir(directory, { recursive: true, mode: 0o700 })
const path = new URL('single-setup.json', directory)
let state: { agentId?: string; version?: number; pending?: boolean; configured?: boolean } = {}
try { state = JSON.parse(await readFile(path, 'utf8')) }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
if (state.pending) throw new Error('Inspect the uncertain single-planner configuration before retrying.')
const save = () => writeFile(path, JSON.stringify(state, null, 2), { mode: 0o600 })
const client = createClient({ apiKey: process.env.NAIVE_API_KEY, baseUrl: 'https://api.vetta.sh', fetch: createPlanningFetch() })
const matches = (current: typeof desired) => ['name', 'model', 'system', 'tools', 'mcp_servers', 'multiagent', 'handoffs', 'output_schema', 'structured_output_required']
  .every(key => isDeepStrictEqual(current[key as keyof typeof desired], desired[key as keyof typeof desired]))
try {
  const current = state.agentId ? await client.agents.get(state.agentId) : null
  if (!current || !matches(current)) {
    state.pending = true; state.configured = false; await save()
    const agent = current
      ? await client.agents.update(current.id, { ...desired, expected_version: current.current_version })
      : await client.agents.create({ ...desired, name: desired.name!, model, budget: desired.budget!, metadata: { application: 'arrange', purpose: 'single-planner' } })
    state.agentId = agent.id; state.version = agent.current_version
    delete state.pending; await save()
  }
  const verified = await client.agents.get(state.agentId!)
  state.configured = matches(verified); state.version = verified.current_version; await save()
  console.log(JSON.stringify(state))
  if (!state.configured) process.exitCode = 1
} catch (error) {
  const failure = error as { status?: number; code?: string }
  if (failure.status === 429) { delete state.pending; await save() }
  console.log(JSON.stringify({ configured: false, status: failure.status, code: failure.code, pending: !!state.pending }))
  process.exitCode = 1
}
