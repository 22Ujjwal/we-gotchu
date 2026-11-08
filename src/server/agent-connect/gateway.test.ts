import { describe, expect, it } from 'vitest'
import { createAgentGateway } from './gateway'
import { createHashedTokenVerifier, tokenDigest } from './auth'
import { GatewayError } from './types'
import type { AgentBackend, AgentGrant } from './types'
import type { PlanningView } from '../../agent/planning/contract'

const now = 1794146400000
const audience = 'https://arrange.example/api/agent-connect/mcp'
const grant: AgentGrant = { grantId: 'grant-a', customerId: 'alice', clientId: 'client-a', audience,
  expiresAt: now + 60_000, revoked: false, scopes: ['arrange:read', 'arrange:plan', 'arrange:select'], conversationIds: null }
const view: PlanningView = { id: 'planning-1', version: 2, status: 'ready', messages: [],
  proposal: { summary: 'An option, not a reservation', nextQuestion: null, options: [{ id: 'venue-1', kind: 'venue', name: 'Test venue', url: 'https://venue.example', why: 'Fits the brief', facts: [], unknowns: ['Availability and price unconfirmed'] }] },
  selections: [], progress: null, error: null,
  approvals: [{ id: 'private-approval', tool: 'private-tool', arguments: { secret: 'never-return-this' } }], canReviewResearch: true }
function setup() {
  const calls: { method: string; customer: string; input: unknown }[] = []
  const admitted: unknown[] = []
  const backend: AgentBackend = {
    async create(actor, input) { calls.push({ method: 'create', customer: actor.customerId, input }); return structuredClone(view) },
    async read(actor, id) { calls.push({ method: 'read', customer: actor.customerId, input: id }); return structuredClone(view) },
    async command(actor, id, input) { calls.push({ method: 'command', customer: actor.customerId, input: { id, ...input } }); return structuredClone(view) },
  }
  const gateway = createAgentGateway({ backend, audience, appOrigin: 'https://arrange.example', now: () => now,
    admit: async input => { admitted.push(input) } })
  return { gateway, calls, admitted, backend }
}

describe('customer-scoped agent gateway', () => {
  it('starts planning as the verified customer, hides operator data, and never calls it booked', async () => {
    const s = setup()
    const result = await s.gateway.call(grant, 'arrange_start_event', { requestId: 'start-1', message: 'Birthday for 20' })
    expect(s.calls[0]).toMatchObject({ method: 'create', customer: 'alice', input: { message: 'Birthday for 20', requestId: expect.stringMatching(/^agent-[a-f0-9]{64}$/) } })
    expect(s.admitted).toHaveLength(1)
    expect(result).toMatchObject({ conversationId: 'planning-1', version: 2, researchStatus: 'ready', customerReviewUrl: 'https://arrange.example/planning/planning-1', fulfillment: 'not_verified', authority: { sendInquiries: false, pay: false, book: false } })
    expect(JSON.stringify(result)).not.toMatch(/never-return-this|private-approval|private-tool|canReviewResearch|customerId/)
    expect(result).toHaveProperty('proposal.options.0.unknowns', ['Availability and price unconfirmed'])
  })
  it('rejects customer spoofing, unknown tools and invalid input before admission/backend', async () => {
    const s = setup()
    for (const [tool, input] of [
      ['arrange_start_event', { requestId: 'r', message: 'party', customerId: 'bob' }],
      ['execute_action', { eventId: 'anything' }],
      ['arrange_start_event', { requestId: 'r', message: '' }],
      ['arrange_refine_event', { conversationId: 'planning-1', requestId: 'r', message: 'change', expectedVersion: -1 }],
    ] as const) await expect(s.gateway.call(grant, tool, input)).rejects.toBeInstanceOf(GatewayError)
    expect(s.calls).toHaveLength(0); expect(s.admitted).toHaveLength(0)
  })
  it.each([
    { expiresAt: now }, { revoked: true }, { audience: 'https://other.example/mcp' },
    { scopes: ['arrange:read'] }, { conversationIds: ['planning-1'] },
  ])('denies unauthorized create before any backend work: %j', async patch => {
    const s = setup()
    await expect(s.gateway.call({ ...grant, ...patch } as AgentGrant, 'arrange_start_event', { requestId: 'r', message: 'party' })).rejects.toBeInstanceOf(GatewayError)
    expect(s.calls).toHaveLength(0)
  })
  it('enforces conversation restrictions and advertises only permitted tools', async () => {
    const s = setup()
    const limited: AgentGrant = { ...grant, scopes: ['arrange:read'], conversationIds: ['planning-1'] }
    expect(s.gateway.listTools(limited).map(t => t.name)).toEqual(['arrange_get_capabilities', 'arrange_get_event'])
    await expect(s.gateway.call(limited, 'arrange_get_event', { conversationId: 'planning-other' })).rejects.toMatchObject({ code: 'not_found' })
    expect(s.calls).toHaveLength(0)
    await s.gateway.call(limited, 'arrange_get_event', { conversationId: 'planning-1' })
    expect(s.calls[0]).toMatchObject({ customer: 'alice', input: 'planning-1' })
  })
  it('namespaces retry IDs stably per grant without retrying a failed backend write', async () => {
    const s = setup()
    const input = { requestId: 'same', message: 'party' }
    await s.gateway.call(grant, 'arrange_start_event', input)
    await s.gateway.call(grant, 'arrange_start_event', input)
    await s.gateway.call({ ...grant, grantId: 'grant-b', clientId: 'client-b' }, 'arrange_start_event', input)
    expect(s.calls[0].input).toEqual(s.calls[1].input)
    expect(s.calls[2].input).not.toEqual(s.calls[0].input)
    let attempts = 0
    s.backend.create = async () => { attempts++; throw new Error('secret provider detail') }
    await expect(s.gateway.call(grant, 'arrange_start_event', input)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(attempts).toBe(1)
  })
  it('fails closed when admission denies a request', async () => {
    const s = setup()
    const gateway = createAgentGateway({ backend: s.backend, audience, appOrigin: 'https://arrange.example', now: () => now,
      admit: async () => { throw new GatewayError(429, 'rate_limited', 'Try later') } })
    await expect(gateway.call(grant, 'arrange_start_event', { requestId: 'r', message: 'party' })).rejects.toMatchObject({ status: 429 })
    expect(s.calls).toHaveLength(0)
  })
  it('never forwards provider exception text or failed research details', async () => {
    const s = setup()
    s.backend.read = async () => ({ ...view, status: 'failed', error: 'secret-provider-value' })
    expect(JSON.stringify(await s.gateway.call(grant, 'arrange_get_event', { conversationId: 'planning-1' }))).not.toContain('secret-provider-value')
    s.backend.read = async () => { throw new Error('secret-provider-value') }
    await expect(s.gateway.call(grant, 'arrange_get_event', { conversationId: 'planning-1' })).rejects.toMatchObject({ code: 'temporarily_unavailable', message: expect.not.stringContaining('secret-provider-value') })
  })
  it('denies a response whose conversation ID differs from the requested conversation', async () => {
    const s = setup()
    s.backend.read = async () => ({ ...view, id: 'someone-elses-plan' })
    await expect(s.gateway.call(grant, 'arrange_get_event', { conversationId: 'planning-1' })).rejects.toMatchObject({ code: 'invalid_backend_response' })
  })
  it('rejects unsafe handoff origins and fails oversized results instead of hiding unknown costs', async () => {
    const s = setup()
    expect(() => createAgentGateway({ backend: s.backend, audience, appOrigin: 'https://attacker@arrange.example', admit: async () => {} })).toThrow()
    s.backend.read = async () => ({ ...view, proposal: { summary: 'x'.repeat(200_000), nextQuestion: null, options: [] } })
    await expect(s.gateway.call(grant, 'arrange_get_event', { conversationId: 'planning-1' })).rejects.toMatchObject({ code: 'invalid_backend_response' })
  })
})

it('looks up only a token digest and rechecks revocation for every request', async () => {
  const raw = 'fixture-access-token-that-is-at-least-32-bytes-long'
  let revoked = false
  const seen: string[] = []
  const verify = createHashedTokenVerifier({ lookup: async digest => { seen.push(digest); return digest === tokenDigest(raw) ? { ...grant, revoked } : null } })
  expect(await verify(raw)).toMatchObject({ customerId: 'alice', revoked: false })
  revoked = true
  expect(await verify(raw)).toMatchObject({ revoked: true })
  expect(seen).toHaveLength(2)
  expect(seen.every(value => /^[a-f0-9]{64}$/.test(value) && !value.includes(raw))).toBe(true)
  expect(await verify('short')).toBeNull()
  expect(await verify('another-token-that-is-long-enough-to-be-checked')).toBeNull()
})
