import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTestPlanningRepository } from '../db/client'
import { createAgentGateway } from './gateway'
import { createPlanningBridge } from './planning-bridge'
import type { AgentGrant } from './types'
import type { PlanningAgent } from '../../agent/planning/contract'

let db: Awaited<ReturnType<typeof createTestPlanningRepository>>
let agent: PlanningAgent
let gateway: ReturnType<typeof createAgentGateway>
const audience = 'https://arrange.example/api/agent-connect/mcp'
const grant: AgentGrant = { grantId: 'grant-a', clientId: 'client-a', customerId: 'alice', audience,
  expiresAt: Date.now() + 600_000, revoked: false, scopes: ['arrange:read', 'arrange:plan', 'arrange:select'], conversationIds: null }
beforeEach(async () => {
  db = await createTestPlanningRepository()
  agent = {
    start: vi.fn(async () => ({ sessionId: 'session-1', sequence: 1 })),
    send: vi.fn(async () => ({ sequence: 3 })),
    read: vi.fn(async () => ({ status: 'ready' as const, sequence: 2, progress: null, error: null,
      proposal: { summary: 'Fixture research, no booking', nextQuestion: null,
        options: [{ id: 'venue-1', kind: 'venue' as const, name: 'Test venue', url: 'https://venue.example', why: 'Example', facts: [], unknowns: ['Price and availability'] }] } })),
  }
  gateway = createAgentGateway({ audience, appOrigin: 'https://arrange.example', admit: async () => {},
    backend: createPlanningBridge({ repository: db.repository, agent: () => agent, timeoutMs: 100 }) })
})
afterEach(async () => { await db.close() })

async function ready() {
  const created = await gateway.call(grant, 'arrange_start_event', { requestId: 'start', message: 'Birthday for 20 in San Francisco' })
  return gateway.call(grant, 'arrange_get_event', { conversationId: created.conversationId })
}

it('creates, polls and reloads a persisted conversation without another research start', async () => {
  const result = await ready()
  expect(result.researchStatus).toBe('ready')
  expect(result.fulfillment).toBe('not_verified')
  expect(await db.repository.get('alice', String(result.conversationId))).not.toBeNull()
  expect(await db.repository.get('bob', String(result.conversationId))).toBeNull()
  const reloaded = await gateway.call(grant, 'arrange_get_event', { conversationId: result.conversationId })
  expect(reloaded.selections).toEqual(result.selections)
  expect(agent.start).toHaveBeenCalledTimes(1)
})

it('replays create and toggle exactly once and refuses changed content for the same request', async () => {
  const current = await ready()
  const createInput = { requestId: 'start', message: 'Birthday for 20 in San Francisco' }
  expect((await gateway.call(grant, 'arrange_start_event', createInput)).conversationId).toBe(current.conversationId)
  await expect(gateway.call(grant, 'arrange_start_event', { ...createInput, message: 'Changed brief' })).rejects.toMatchObject({ code: 'idempotency_conflict' })
  const input = { conversationId: current.conversationId, requestId: 'select-1', expectedVersion: current.version, optionId: 'venue-1' }
  const selected = await gateway.call(grant, 'arrange_toggle_selection', input)
  const replay = await gateway.call(grant, 'arrange_toggle_selection', input)
  expect(selected.selections).toHaveLength(1)
  expect(replay.selections).toEqual(selected.selections)
  expect(replay.version).toBe(selected.version)
  expect(agent.start).toHaveBeenCalledTimes(1)
})

it('checks ownership even when an unrestricted grant knows another customer conversation ID', async () => {
  const current = await ready()
  const bob = { ...grant, grantId: 'grant-b', customerId: 'bob' }
  await expect(gateway.call(bob, 'arrange_get_event', { conversationId: current.conversationId })).rejects.toMatchObject({ code: 'not_found' })
  await expect(gateway.call(bob, 'arrange_refine_event', { conversationId: current.conversationId, requestId: 'steal', expectedVersion: current.version, message: 'Change this' })).rejects.toMatchObject({ code: 'not_found' })
  expect(agent.send).not.toHaveBeenCalled()
})

it('rejects stale selections and keeps selected venue during a brief refinement', async () => {
  const current = await ready()
  const selected = await gateway.call(grant, 'arrange_toggle_selection', { conversationId: current.conversationId, requestId: 's', expectedVersion: current.version, optionId: 'venue-1' })
  await expect(gateway.call(grant, 'arrange_refine_event', { conversationId: current.conversationId, requestId: 'stale', expectedVersion: current.version, message: 'Oakland, 30 guests' })).rejects.toMatchObject({ code: 'stale_version' })
  const input = { conversationId: current.conversationId, requestId: 'revision', expectedVersion: selected.version, message: 'Oakland, 30 guests' }
  const updated = await gateway.call(grant, 'arrange_refine_event', input)
  await gateway.call(grant, 'arrange_refine_event', input)
  expect(updated.researchStatus).toBe('working')
  expect(updated.selections).toEqual(selected.selections)
  expect(agent.send).toHaveBeenCalledTimes(1)
  expect(agent.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'Oakland, 30 guests', selections: expect.arrayContaining([expect.objectContaining({ id: 'venue-1' })]) }))
})

it('preserves an uncertain provider start without automatically resending on replay', async () => {
  vi.mocked(agent.start).mockRejectedValue(new Error('response lost'))
  const input = { requestId: 'uncertain', message: 'Party' }
  const first = await gateway.call(grant, 'arrange_start_event', input)
  const second = await gateway.call(grant, 'arrange_start_event', input)
  expect(first.researchStatus).toBe('uncertain')
  expect(first.nextAction).toBe('check_saved_status_no_resend')
  expect(second.conversationId).toBe(first.conversationId)
  expect(agent.start).toHaveBeenCalledTimes(1)
})
