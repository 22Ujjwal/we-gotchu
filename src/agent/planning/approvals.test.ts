import { expect, test, vi } from 'vitest'
import { createPlanningAgent } from './provider'

function setup() {
  const parent = { id: 'lead', status: 'idle', stop_reason: 'awaiting_delegation', last_seq: 44, structured_output: null, pending_actions: [] }
  const child = { ...parent, id: 'maya', parent_session_id: 'lead', stop_reason: 'awaiting_approval', pending_actions: [
    { kind: 'tool', tool_call_id: 'call-1', name: 'monid.monid_inspect', args: { provider: 'channel3', endpoint: '/v1/search' }, read_people: true },
  ] }
  const client = { sessions: {
    create: vi.fn(), send: vi.fn(), get: vi.fn(async () => parent), events: vi.fn(async () => ({ data: [] })),
    threads: vi.fn(async () => ({ data: [child], has_more: false, next_cursor: null })), confirmTool: vi.fn(async () => ({})),
  } }
  return { child, parent, client, agent: createPlanningAgent({ client, agentId: 'tom' }) }
}
test('a parked specialist exposes one reviewable call and a read never approves it', async () => {
  const { agent, client } = setup()
  const result = await agent.read({ sessionId: 'lead', afterSequence: 0 })
  expect(result.status).toBe('blocked')
  expect(result.approvals).toEqual([expect.objectContaining({ tool: 'monid.monid_inspect', arguments: { provider: 'channel3', endpoint: '/v1/search' } })])
  expect(client.sessions.confirmTool).not.toHaveBeenCalled()
  await agent.confirm!({ sessionId: 'lead', approvalId: result.approvals![0].id, decision: 'allow' })
  expect(client.sessions.confirmTool).toHaveBeenCalledExactlyOnceWith('maya', { tool_call_id: 'call-1', decision: 'allow', scope: 'call' })
})
test('changed arguments, unrelated sessions, and expired requests cannot reuse an approval', async () => {
  const { agent, child, client } = setup()
  const result = await agent.read({ sessionId: 'lead', afterSequence: 0 })
  const approvalId = result.approvals![0].id
  child.pending_actions[0].args.endpoint = '/v1/products/changed'
  await expect(agent.confirm!({ sessionId: 'lead', approvalId, decision: 'allow' })).rejects.toThrow()
  child.parent_session_id = 'someone-else'
  expect((await agent.read({ sessionId: 'lead', afterSequence: 0 })).approvals ?? []).toEqual([])
  expect(client.sessions.confirmTool).not.toHaveBeenCalled()
})
test('unrelated external writes and questions remain blocked without a research approve button', async () => {
  const { agent, child, client } = setup()
  child.pending_actions[0].name = 'email.send'
  const result = await agent.read({ sessionId: 'lead', afterSequence: 0 })
  expect(result.status).toBe('blocked')
  expect(result.approvals ?? []).toEqual([])
  expect(client.sessions.confirmTool).not.toHaveBeenCalled()
})

test('read-only reconciliation distinguishes a closed call from a still-pending call', async () => {
  const { agent, child, client } = setup()
  const first = await agent.read({ sessionId: 'lead', afterSequence: 0 })
  const approvalId = first.approvals![0].id
  expect((await agent.read({ sessionId: 'lead', afterSequence: 0, approvalId })).confirmation).toEqual({ id: approvalId, state: 'pending' })
  child.pending_actions = []
  child.stop_reason = 'end_turn'
  expect((await agent.read({ sessionId: 'lead', afterSequence: 0, approvalId })).confirmation).toEqual({ id: approvalId, state: 'closed' })
  expect(client.sessions.confirmTool).not.toHaveBeenCalled()
})
