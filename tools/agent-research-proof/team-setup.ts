import { isDeepStrictEqual } from 'node:util'
import { createClient } from '@usenaive-sdk/managed-agents'
import { readFile, writeFile } from 'node:fs/promises'
import { coordinatorDefinition, specialistDefinition, teamNames } from '../../src/agent/planning/team'
import { createPlanningFetch } from '../../src/agent/planning/transport'

type Member = { id: string; version: number; credentialId?: string }
type Setup = { members: Partial<Record<'venue' | 'supply', Member>>; pending?: string; leadVersion?: number; configured?: boolean }
const path = new URL('./output/team-setup.json', import.meta.url)
const connection = JSON.parse(await readFile(new URL('./output/connection-3f382d84-e7b7-4cab-a2d1-1c49143be8c7/result.json', import.meta.url), 'utf8'))
const model = process.env.NAIVE_MODEL
if (!model) throw new Error('NAIVE_MODEL is required')
if (process.env.RESEARCH_LIVE_SMOKE !== '1') {
  console.log(JSON.stringify({ mode: 'dry-run', lead: { name: teamNames.lead, reuseId: connection.agentId }, members: [teamNames.venue, teamNames.supply], vaultId: connection.vaultId, model, startsSessions: false }))
  process.exit(0)
}
if (!process.env.NAIVE_API_KEY) throw new Error('NAIVE_API_KEY is required')
let state: Setup
try { state = JSON.parse(await readFile(path, 'utf8')) }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; state = { members: {} } }
if (state.pending) throw new Error(`Inspect the uncertain setup operation before resuming: ${state.pending}`)
const save = () => writeFile(path, JSON.stringify(state, null, 2), { mode: 0o600 })
const client = createClient({ apiKey: process.env.NAIVE_API_KEY, baseUrl: 'https://api.vetta.sh', fetch: createPlanningFetch() })
async function mutate<T>(name: string, action: () => Promise<T>, accept: (value: T) => void) {
  state.pending = name
  await save()
  try {
    const value = await action()
    accept(value)
    delete state.pending
    await save()
  } catch (error) {
    // A received capacity rejection is known not to have performed this operation.
    if ((error as { status?: number }).status === 429) { delete state.pending; await save() }
    throw error
  }
}
try {
  for (const role of ['venue', 'supply'] as const) {
    if (!state.members[role]) {
      const definition = specialistDefinition(role, model)
      await mutate(`create-${role}`, () => client.agents.create({ ...definition, name: teamNames[role], model, budget: definition.budget!, metadata: { application: 'arrange', role, setup: 'planning-team-v1' } }),
        agent => { state.members[role] = { id: agent.id, version: agent.current_version } })
    }
    const member = state.members[role]!
    // Preserve the existing Monid credential for a later supported integration.
    const desired = specialistDefinition(role, model)
    const current = await client.agents.get(member.id)
    if (current.system !== desired.system || !isDeepStrictEqual(current.tools, desired.tools)
      || !isDeepStrictEqual(current.mcp_servers, desired.mcp_servers)) {
      await mutate(`configure-${role}`, () => client.agents.update(member.id, { ...desired, expected_version: current.current_version }),
        agent => { member.version = agent.current_version })
    } else member.version = current.current_version
    const verified = await client.agents.get(member.id)
    if (verified.system !== desired.system || !isDeepStrictEqual(verified.tools, desired.tools)
      || !isDeepStrictEqual(verified.mcp_servers, desired.mcp_servers)) throw new Error(`Research configuration mismatch: ${role}`)
    await save()
    console.log(JSON.stringify({ role, agentId: member.id, version: member.version, credentialConfigured: !!member.credentialId }))
  }
  const members = [state.members.venue!, state.members.supply!].map(({ id, version }) => ({ id, version }))
  const desired = coordinatorDefinition(model, members)
  const current = await client.agents.get(connection.agentId)
  if (current.system !== desired.system || !isDeepStrictEqual(current.multiagent, desired.multiagent)) {
    await mutate('configure-lead', () => client.agents.update(connection.agentId, { ...desired, expected_version: current.current_version }),
      agent => { state.leadVersion = agent.current_version })
  } else state.leadVersion = current.current_version
  const verified = await client.agents.get(connection.agentId)
  state.configured = verified.name === teamNames.lead && verified.handoffs === 'team' && verified.system === desired.system
    && isDeepStrictEqual(verified.multiagent, desired.multiagent)
  await save()
  console.log(JSON.stringify({ configured: state.configured, leadId: connection.agentId, version: state.leadVersion, startsSessions: false }))
  if (!state.configured) process.exitCode = 1
} catch (error) {
  const failure = error as { status?: number; code?: string | number }
  console.log(JSON.stringify({ configured: false, status: failure.status, code: failure.code, pending: state.pending ?? null }))
  process.exitCode = 1
}
