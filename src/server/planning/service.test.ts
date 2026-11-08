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
  deps = { repository: db.repository, agent: () => agent, requireCustomerId: async () => 'alice', timeoutMs: 100, allowResearchReview: true }
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

  it('shows a terminal provider failure even without a newer event sequence', async () => {
    const initial = await create()
    vi.mocked(agent.read).mockResolvedValue({ status: 'failed', sequence: 1, proposal: null, progress: null, error: 'Research stopped.' })
    const failed = await getPlanning(deps, initial.id)
    expect(failed.status).toBe('failed')
    expect(failed.error).toBe('Research stopped.')
  })

  it('records an identical proposal once when it answers a new customer turn', async () => {
    const view = await ready()
    await commandPlanning(deps, view.id, { kind: 'message', requestId: 'repeat', message: 'Please repeat those choices', expectedVersion: view.version })
    sequence = 4
    const answer = await getPlanning(deps, view.id)
    expect(answer.messages.map(message => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect((await getPlanning(deps, view.id)).messages).toEqual(answer.messages)
  })

  it('does not duplicate messages or versions on identical working snapshots', async () => {
    const initial = await create()
    vi.mocked(agent.read).mockResolvedValue({ status: 'working', sequence: 8, proposal, progress: 'Checking sources', error: null })
    const first = await getPlanning(deps, initial.id)
    const second = await getPlanning(deps, initial.id)
    expect(second).toEqual(first)
  })

  it('uses a 55 second deadline and retains a 90 second pending lease', async () => {
    const clock = 1_800_000_000_000
    vi.mocked(agent.start).mockRejectedValue(new Error('Ambiguous transport failure'))
    const timer = vi.spyOn(globalThis, 'setTimeout')
    try {
      const view = await createPlanning({ ...deps, timeoutMs: undefined, now: () => clock }, { requestId: 'timing', message: 'Party' })
      expect(timer).toHaveBeenCalledWith(expect.any(Function), 55_000)
      const saved = await db.repository.get('alice', view.id)
      expect(saved?.pending?.expiresAt).toBe(clock + 90_000)
      expect(saved?.pending?.message).toBe('Party')
      expect(view.status).toBe('uncertain')
    } finally {
      timer.mockRestore()
    }
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

  it('does not let a delayed provider read overwrite a newer selection', async () => {
    const view = await ready()
    let finish!: (result: Awaited<ReturnType<PlanningAgent['read']>>) => void
    let started!: () => void
    const reading = new Promise<void>(resolve => { started = resolve })
    vi.mocked(agent.read).mockImplementationOnce(() => {
      started()
      return new Promise(resolve => { finish = resolve })
    })
    const pendingRead = getPlanning(deps, view.id)
    await reading
    const selected = await commandPlanning(deps, view.id, { kind: 'select', requestId: 'cups', optionId: 'cups', expectedVersion: view.version })
    finish({ status: 'ready', sequence: 9, proposal: { ...proposal, options: [] }, progress: null, error: null })
    expect(await pendingRead).toEqual(selected)
    expect((await db.repository.get('alice', view.id))?.view.selections.map(option => option.id)).toEqual(['cups'])
  })

  it('sends only one of two messages that race for the same version', async () => {
    const view = await ready()
    const results = await Promise.allSettled(['first', 'second'].map(requestId => commandPlanning(deps, view.id, {
      kind: 'message', requestId, message: requestId, expectedVersion: view.version,
    })))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(agent.send).toHaveBeenCalledTimes(1)
  })

  it('expires an abandoned write into uncertainty without starting another session', async () => {
    const view = await create()
    const saved = (await db.repository.get('alice', view.id))!
    await db.repository.compareAndSet(saved, {
      ...saved, sessionId: null,
      pending: { kind: 'create', requestId: 'create', message: 'Plan my party', selections: [], expiresAt: 100 },
    })
    expect((await getPlanning({ ...deps, now: () => 99 }, view.id)).status).toBe('working')
    expect((await getPlanning({ ...deps, now: () => 101 }, view.id)).status).toBe('uncertain')
    expect((await create()).status).toBe('uncertain')
    expect(agent.start).toHaveBeenCalledTimes(1)
    expect(agent.read).not.toHaveBeenCalled()
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
    agent.recoverStart = vi.fn(async () => { throw Object.assign(new Error('conflict'), { status: 409, code: 'idempotency_conflict' }) })
    const expired = { ...deps, now: () => Date.now() + 120_000 }
    expect((await getPlanning(expired, view.id)).status).toBe('failed')
    expect((await getPlanning(expired, view.id)).status).toBe('failed')
    expect(agent.recoverStart).toHaveBeenCalledTimes(1)
    expect((await db.repository.get('alice', view.id))?.pending).toBeNull()
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

it('persists blocked research and confirms only the displayed call after an explicit command', async () => {
  let view = await create()
  const approvals = [{ id: 'approval-1', tool: 'monid.monid_inspect', arguments: { provider: 'channel3', endpoint: '/v1/search' } }]
  vi.mocked(agent.read).mockResolvedValue({ status: 'blocked', sequence: 9, proposal: null, progress: null, error: 'Research paused.', approvals })
  view = await getPlanning(deps, view.id)
  expect(view.status).toBe('blocked')
  expect(view.approvals).toEqual(approvals)
  agent.confirm = vi.fn(async () => {})
  await expect(commandPlanning(deps, view.id, { kind: 'message', requestId: 'new-message', expectedVersion: view.version, message: 'Try again' })).rejects.toMatchObject({ status: 409 })
  const command = { kind: 'confirm', requestId: 'confirm-1', expectedVersion: view.version, approvalId: 'approval-1', decision: 'allow' }
  const sent = await commandPlanning(deps, view.id, command)
  expect(sent.status).toBe('working')
  await commandPlanning(deps, view.id, command)
  expect(agent.confirm).toHaveBeenCalledExactlyOnceWith({ sessionId: 'session-1', approvalId: 'approval-1', decision: 'allow' })
  expect(agent.send).not.toHaveBeenCalled()
  // A child's approval does not increment the parent's event sequence.
  vi.mocked(agent.read).mockResolvedValue({ status: 'working', sequence: 9, proposal: null, progress: 'Research resumed.', error: null })
  expect((await getPlanning(deps, view.id)).status).toBe('working')
})

it('does not resend an uncertain confirmation or allow a forged approval ID', async () => {
  let view = await create()
  vi.mocked(agent.read).mockResolvedValue({ status: 'blocked', sequence: 9, proposal: null, progress: null, error: null, approvals: [{ id: 'a1', tool: 'monid.monid_discover', arguments: {} }] })
  view = await getPlanning(deps, view.id)
  agent.confirm = vi.fn(async () => { throw new Error('Lost acknowledgement') })
  await expect(commandPlanning(deps, view.id, { kind: 'confirm', requestId: 'forged', expectedVersion: view.version, approvalId: 'other', decision: 'allow' })).rejects.toMatchObject({ status: 409 })
  const command = { kind: 'confirm', requestId: 'once', expectedVersion: view.version, approvalId: 'a1', decision: 'deny' }
  expect((await commandPlanning(deps, view.id, command)).status).toBe('uncertain')
  expect((await commandPlanning(deps, view.id, command)).status).toBe('uncertain')
  expect(agent.confirm).toHaveBeenCalledTimes(1)
})

it('reconciles a closed confirmation without replaying it and exposes the current team pause', async () => {
  let view = await create()
  const approvals = [{ id: 'old', tool: 'monid.monid_inspect', arguments: {} }]
  vi.mocked(agent.read).mockResolvedValue({ status: 'blocked', sequence: 9, proposal: null, progress: null, error: null, approvals })
  view = await getPlanning(deps, view.id)
  agent.confirm = vi.fn(async () => { throw new Error('Lost acknowledgement') })
  const command = { kind: 'confirm', requestId: 'one-decision', expectedVersion: view.version, approvalId: 'old', decision: 'allow' }
  view = await commandPlanning(deps, view.id, command)
  expect(view.status).toBe('uncertain')
  vi.mocked(agent.read).mockResolvedValue({ status: 'blocked', sequence: 9, proposal: null, progress: null, error: null,
    approvals: [{ ...approvals[0], id: 'next' }], confirmation: { id: 'old', state: 'closed' },
    activity: [{ name: 'Supplies research', status: 'blocked', detail: 'Waiting for our team to review a research request.' }] })
  view = await getPlanning(deps, view.id)
  expect(agent.read).toHaveBeenLastCalledWith({ sessionId: 'session-1', afterSequence: 1, approvalId: 'old' })
  expect(view.status).toBe('blocked')
  expect(view.approvals?.[0].id).toBe('next')
  expect(view.activity?.[0].status).toBe('blocked')
  expect(agent.confirm).toHaveBeenCalledTimes(1)
  expect((await db.repository.get('alice', view.id))?.pending).toBeNull()
})

it('rejects customer tool confirmation without calling the provider or recording a command', async () => {
  const initial = await create()
  agent.confirm = vi.fn(async () => {})
  vi.mocked(agent.read).mockResolvedValue({ status: 'blocked', sequence: 2, proposal: null, progress: null, error: null,
    approvals: [{ id: 'approval', tool: 'monid.monid_inspect', arguments: {} }] })
  const paused = await getPlanning(deps, initial.id)
  deps.allowResearchReview = false
  await expect(commandPlanning(deps, initial.id, { kind: 'confirm', requestId: 'forbidden', expectedVersion: paused.version,
    approvalId: 'approval', decision: 'allow' })).rejects.toMatchObject({ status: 403 })
  expect(agent.confirm).not.toHaveBeenCalled()
  const record = await deps.repository.get('alice', initial.id)
  expect(record?.pending).toBeNull()
  expect(record?.requests).not.toHaveProperty('forbidden')
})

it('repairs a saved stale answer at the same completed sequence without sending again', async () => {
  const before = await ready()
  const latest = { ...proposal, summary: 'Corrected supplier comparison' }
  vi.mocked(agent.read).mockResolvedValue({ status: 'ready', sequence, proposal: latest, progress: null, error: null })
  const repaired = await getPlanning(deps, before.id)
  expect(repaired.proposal).toEqual(latest)
  expect(repaired.messages).toHaveLength(2)
  expect(repaired.messages[1].text).toContain(latest.summary)
  expect(repaired.messages[1].id).toBe(before.messages[1].id)
  expect((await getPlanning(deps, before.id)).version).toBe(repaired.version)
  expect(agent.send).not.toHaveBeenCalled()
})

it('restores saved work without requiring the hosted research provider', async () => {
  const saved = await ready()
  vi.mocked(agent.read).mockClear()
  vi.mocked(agent.read).mockRejectedValue(new Error('Provider unavailable'))
  expect(await getPlanning(deps, saved.id, { savedOnly: true })).toEqual(saved)
  expect(agent.read).not.toHaveBeenCalled()
  await expect(getPlanning(deps, saved.id)).rejects.toMatchObject({ status: 503 })
})
