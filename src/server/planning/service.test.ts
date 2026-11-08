import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanningAgent, PlanningOption, PlanningProposal } from '../../agent/planning/contract'
import { createTestPlanningRepository } from '../db/client'
import { createPlanning, getPlanning, commandPlanning, type PlanningDeps } from './service'

const option = (id: string, kind: PlanningOption['kind'] = 'supply'): PlanningOption => ({
  id, kind, name: id, url: 'https://example.com/item', why: 'Fits the party', facts: [], unknowns: ['Availability'],
})
const proposal: PlanningProposal = { summary: 'Some choices', nextQuestion: 'Which do you prefer?', options: [option('venue', 'venue'), option('venue2', 'venue'), option('cups'), option('plates')] }
let db: Awaited<ReturnType<typeof createTestPlanningRepository>>
let deps: PlanningDeps
let agent: PlanningAgent
let sequence: number
beforeEach(async () => {
  db = await createTestPlanningRepository()
  sequence = 2
  agent = {
    start: vi.fn(async () => ({ sessionId: 'session-1', sequence: 1 })),
    send: vi.fn(async () => ({ sequence: sequence + 1 })),
    read: vi.fn(async () => ({ status: 'ready' as const, sequence, proposal, progress: null, error: null })),
  }
  deps = { repository: db.repository, agent: () => agent, requireCustomerId: async () => 'alice', timeoutMs: 100 }
})
afterEach(async () => { await db.close() })
const create = () => createPlanning(deps, { requestId: 'create', message: 'Plan my party' })
async function ready() { const view = await create(); return getPlanning(deps, view.id) }

describe('planning service', () => {
  it('continues one hosted session with saved snapshots and deduplicated messages', async () => {
    let view = await ready()
    expect(view.messages.map(m => m.role)).toEqual(['user', 'assistant'])
    for (const optionId of ['venue', 'cups', 'plates']) {
      view = await commandPlanning(deps, view.id, { kind: 'select', requestId: optionId, expectedVersion: view.version, optionId })
    }
    expect(agent.send).not.toHaveBeenCalled()
    const selected = view.selections
    const command = { kind: 'message', requestId: 'cheaper', expectedVersion: view.version, message: 'Make supplies cheaper' }
    view = await commandPlanning(deps, view.id, command)
    expect(agent.send).toHaveBeenCalledWith({ sessionId: 'session-1', requestId: 'cheaper', message: command.message, selections: selected })
    expect((await commandPlanning(deps, view.id, command)).messages).toEqual(view.messages)
    expect(agent.send).toHaveBeenCalledTimes(1)
    sequence = 3
    expect((await getPlanning(deps, view.id)).status).toBe('working')
    sequence = 4
    vi.mocked(agent.read).mockResolvedValue({ status: 'ready', sequence, proposal: { ...proposal, summary: 'Cheaper choices', options: [] }, progress: null, error: null })
    view = await getPlanning(deps, view.id)
    expect(view.selections).toEqual(selected)
    expect(view.messages).toHaveLength(4)
    expect((await getPlanning(deps, view.id)).messages).toHaveLength(4)
    expect(agent.start).toHaveBeenCalledTimes(1)
  })

  it('accepts completion at the same sequence as the last working snapshot', async () => {
    const initial = await create()
    vi.mocked(agent.read).mockResolvedValueOnce({ status: 'working', sequence: 8, proposal: null, progress: 'Checking options', error: null })
    const working = await getPlanning(deps, initial.id)
    expect(working.status).toBe('working')
    vi.mocked(agent.read).mockResolvedValueOnce({ status: 'ready', sequence: 8, proposal, progress: null, error: null })
    const completed = await getPlanning(deps, initial.id)
    expect(completed.status).toBe('ready')
    expect(completed.proposal).toEqual(proposal)
    expect(agent.read).toHaveBeenLastCalledWith({ sessionId: 'session-1', afterSequence: 1 })
  })

  it('toggles snapshots, replaces only the venue, and checks exact versions', async () => {
    let view = await ready()
    for (const optionId of ['venue', 'cups', 'venue2', 'plates', 'cups']) {
      view = await commandPlanning(deps, view.id, { kind: 'select', requestId: `${optionId}-${view.version}`, expectedVersion: view.version, optionId })
    }
    expect(view.selections.map(o => o.id)).toEqual(['venue2', 'plates'])
    await expect(commandPlanning(deps, view.id, { kind: 'message', requestId: 'stale', expectedVersion: 0, message: 'Hello' })).rejects.toMatchObject({ status: 409, errorCode: 'stale_version' })
    await expect(commandPlanning(deps, view.id, { kind: 'select', requestId: 'missing', expectedVersion: view.version, optionId: 'absent' })).rejects.toMatchObject({ status: 422 })
  })

  it('deduplicates create and rejects reused request IDs with different input', async () => {
    const [a, b] = await Promise.all([create(), create()])
    expect(a.id).toBe(b.id)
    expect(agent.start).toHaveBeenCalledTimes(1)
    await expect(createPlanning(deps, { requestId: 'create', message: 'Different' })).rejects.toMatchObject({ errorCode: 'idempotency_conflict' })
    const view = await ready()
    const command = { kind: 'select', requestId: 'select', expectedVersion: view.version, optionId: 'cups' }
    const selected = await commandPlanning(deps, view.id, command)
    expect((await commandPlanning(deps, view.id, command)).selections).toEqual(selected.selections)
    await expect(commandPlanning(deps, view.id, { ...command, optionId: 'plates' })).rejects.toMatchObject({ errorCode: 'idempotency_conflict' })
  })

  it('allows only one competing command and hides other customers', async () => {
    const view = await ready()
    const results = await Promise.allSettled(['cups', 'plates'].map(optionId => commandPlanning(deps, view.id, {
      kind: 'select', requestId: optionId, optionId, expectedVersion: view.version,
    })))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const other = { ...deps, requireCustomerId: async () => 'bob' }
    await expect(getPlanning(other, view.id)).rejects.toMatchObject({ status: 404 })
    await expect(commandPlanning(other, view.id, { kind: 'message', requestId: 'x', message: 'x', expectedVersion: 0 })).rejects.toMatchObject({ status: 404 })
    expect(agent.read).toHaveBeenCalledTimes(1)
  })

  it('records ambiguous creates without recreating on replay or GET', async () => {
    vi.mocked(agent.start).mockRejectedValue(new Error('secret provider detail'))
    const view = await create()
    expect(view.status).toBe('uncertain')
    expect(view.error).not.toContain('secret')
    expect((await create()).id).toBe(view.id)
    expect((await getPlanning(deps, view.id)).status).toBe('uncertain')
    expect(agent.start).toHaveBeenCalledTimes(1)
    expect(agent.read).not.toHaveBeenCalled()
  })

  it('bounds a hung send and never resends an uncertain request', async () => {
    const view = await ready()
    vi.mocked(agent.send).mockImplementation(() => new Promise(() => {}))
    const command = { kind: 'message', requestId: 'hung', message: 'Cheaper', expectedVersion: view.version }
    const result = await commandPlanning({ ...deps, timeoutMs: 5 }, view.id, command)
    expect(result.status).toBe('uncertain')
    expect((await commandPlanning(deps, view.id, command)).status).toBe('uncertain')
    expect(agent.send).toHaveBeenCalledTimes(1)
    await expect(commandPlanning(deps, view.id, { ...command, requestId: 'another', expectedVersion: result.version })).rejects.toMatchObject({ errorCode: 'busy' })
  })
})
