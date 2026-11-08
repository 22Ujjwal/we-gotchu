import { describe, expect, it, vi } from 'vitest'
import { createPlanningAgent, type PlanningClient } from './provider'

const proposal = { summary: 'A published venue rate worth comparing.', options: [], nextQuestion: 'Which neighborhood do you prefer?' }
function setup() {
  const snapshot = { id: 'session-1', status: 'idle', stop_reason: 'end_turn', last_seq: 30, structured_output: proposal, pending_actions: [] }
  const client: PlanningClient = { sessions: {
    create: vi.fn(async () => ({ id: 'session-1', last_seq: 0 })),
    send: vi.fn(async () => ({ accepted_seq: 30 })),
    get: vi.fn(async () => snapshot),
    threads: vi.fn(async () => ({ data: [], has_more: false })),
    events: vi.fn(async () => ({ data: [] })),
  } }
  return { client, snapshot, agent: createPlanningAgent({ client, agentId: 'agent-1' }) }
}
describe('hosted planning adapter', () => {
  it('uses stable keys for creation and sends selected options into the same session', async () => {
    const { agent, client } = setup()
    expect(await agent.start({ conversationId: 'conversation-1', requestId: 'create-1', message: 'Birthday for 20 in SF.' })).toEqual({ sessionId: 'session-1', sequence: 0 })
    expect(client.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ agent_id: 'agent-1', structured_output_required: true }), { idempotencyKey: 'planning:conversation-1:create-1' })
    const selected = { id: 'venue-1', kind: 'venue' as const, name: 'Selected venue', url: 'https://example.com', why: 'Customer chose it', facts: [], unknowns: ['Availability'] }
    await agent.send({ sessionId: 'session-1', requestId: 'message-2', message: 'Cheaper supplies please.', selections: [selected] })
    expect(client.sessions.send).toHaveBeenCalledWith('session-1', expect.objectContaining({ message: expect.stringContaining('venue-1') }), { idempotencyKey: 'planning:session-1:message-2' })
    expect(client.sessions.create).toHaveBeenCalledTimes(1)
  })
  it('does not publish a previous turn as the result of a newly accepted message', async () => {
    const { agent } = setup()
    expect(await agent.read({ sessionId: 'session-1', afterSequence: 30 })).toMatchObject({ status: 'working', proposal: null })
    expect(await agent.read({ sessionId: 'session-1', afterSequence: 29 })).toMatchObject({ status: 'ready', proposal })
  })
  it('rejects malformed output without inventing a proposal or retrying a write', async () => {
    const { agent, snapshot, client } = setup()
    snapshot.structured_output = { ...proposal, nextQuestion: '' }
    expect(await agent.read({ sessionId: 'session-1', afterSequence: 0 })).toMatchObject({ status: 'failed', proposal: null })
    vi.mocked(client.sessions.create).mockRejectedValueOnce(new Error('lost response'))
    await expect(agent.start({ conversationId: 'c', requestId: 'r', message: 'Hello' })).rejects.toThrow('lost response')
    expect(client.sessions.create).toHaveBeenCalledTimes(1)
  })
  it('reports provider stops and turns tool activity into plain-language progress', async () => {
    const { agent, snapshot, client } = setup()
    snapshot.status = 'running'
    vi.mocked(client.sessions.events).mockResolvedValueOnce({ data: [{ seq: 20, type: 'tool.started', data: { name: 'monid.monid_run' } }] })
    expect(await agent.read({ sessionId: 'session-1', afterSequence: 0 })).toMatchObject({ status: 'working', progress: 'Checking sources for your event.' })
    snapshot.status = 'idle'; snapshot.stop_reason = 'budget_paused'
    expect(await agent.read({ sessionId: 'session-1', afterSequence: 0 })).toMatchObject({ status: 'failed', proposal: null })
  })
})

it('keeps a coordinator working while its teammates research', async () => {
  const { agent, snapshot } = setup()
  snapshot.status = 'idle'
  snapshot.stop_reason = 'awaiting_delegation'
  expect(await agent.read({ sessionId: 'session-1', afterSequence: 0 })).toMatchObject({ status: 'working', proposal: null, progress: 'Your research team is checking options.' })
})

it('uses the matching completion event instead of a stale session output', async () => {
  const { agent, snapshot, client } = setup()
  snapshot.last_seq = 182
  const latest = { ...proposal, summary: 'One pack is $4.49 less before delivery.' }
  vi.mocked(client.sessions.events).mockResolvedValue({ data: [{ seq: 182, type: 'session.idle', data: { structured_output: latest } }] })
  expect(await agent.read({ sessionId: 'session-1', afterSequence: 91 })).toMatchObject({ status: 'ready', sequence: 182, proposal: latest })
})
