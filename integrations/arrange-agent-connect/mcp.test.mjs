import { describe, expect, it } from 'bun:test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createAgentGateway } from '../../src/server/agent-connect/gateway.ts'
import { ApiError } from '../../src/server/events/errors.ts'
import { createArrangeMcpHandler } from './mcp.mjs'

const endpoint = 'https://arrange.example/api/agent-connect/mcp'
const token = customer => `fixture-${customer}-token-with-at-least-32-bytes-for-tests`
function fixture() {
  const records = new Map()
  const writes = []
  let revoked = false
  const grant = customer => ({ customerId: customer, clientId: `client-${customer}`, grantId: `grant-${customer}`, audience: endpoint,
    expiresAt: Date.now() + 600000, revoked, scopes: ['arrange:read', 'arrange:plan', 'arrange:select'], conversationIds: null })
  const gateway = createAgentGateway({ audience: endpoint, appOrigin: 'https://arrange.example', admit: async () => {}, backend: {
    async create(actor, input) {
      const key = actor.customerId + ':' + input.requestId
      if (!records.has(key)) {
        writes.push(key)
        records.set(key, { id: `planning-${actor.customerId}`, version: 1, status: 'working', messages: [], proposal: null, selections: [], progress: null, error: null })
      }
      return records.get(key)
    },
    async read(actor, id) {
      if (id !== `planning-${actor.customerId}`) throw new ApiError(404, 'not_found', 'PRIVATE missing record')
      return { id, version: 2, status: 'ready', messages: [], proposal: null, selections: [], progress: null, error: null }
    },
    async command() { throw new Error('PRIVATE provider error') },
  } })
  const handler = createArrangeMcpHandler({ gateway, endpointUrl: endpoint, verifyToken: async value => {
    for (const customer of ['alice', 'bob']) if (value === token(customer)) return grant(customer)
    return null
  } })
  async function connect(customer) {
    const client = new Client({ name: 'arrange-fixture-client', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } })
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${token(customer)}` } },
      fetch: (url, init) => handler(new Request(url, init)),
    })
    await client.connect(transport)
    return client
  }
  return { handler, connect, writes, revoke: () => { revoked = true } }
}

describe('official MCP client against Arrange handler — fixtures only', () => {
  it('discovers planning tools and receives structured results, without any payment/booking tools', async () => {
    const s = fixture(); const client = await s.connect('alice')
    try {
      const listed = await client.listTools()
      expect(listed.tools.map(t => t.name)).toEqual(['arrange_get_capabilities', 'arrange_start_event', 'arrange_get_event', 'arrange_refine_event', 'arrange_toggle_selection'])
      expect(listed.tools.find(t => t.name === 'arrange_get_event').annotations.readOnlyHint).toBe(false)
      const started = await client.callTool({ name: 'arrange_start_event', arguments: { requestId: 'one', message: 'TEST party' } })
      expect(started.structuredContent).toMatchObject({ conversationId: 'planning-alice', researchStatus: 'working', fulfillment: 'not_verified' })
      expect(started.content[0].text).toContain('planning-alice')
      const finished = await client.callTool({ name: 'arrange_get_event', arguments: { conversationId: 'planning-alice' } })
      expect(finished.structuredContent).toMatchObject({ researchStatus: 'ready', customerReviewUrl: 'https://arrange.example/planning/planning-alice', fulfillment: 'not_verified' })
      expect(s.writes).toHaveLength(1)
    } finally { await client.close() }
  })
  it('isolates simultaneous clients and preserves stable replay identity', async () => {
    const s = fixture(); const [alice, bob] = await Promise.all([s.connect('alice'), s.connect('bob')])
    try {
      const call = { name: 'arrange_start_event', arguments: { requestId: 'same-id', message: 'TEST party' } }
      const [a, b] = await Promise.all([alice.callTool(call), bob.callTool(call)])
      expect(a.structuredContent.conversationId).toBe('planning-alice')
      expect(b.structuredContent.conversationId).toBe('planning-bob')
      await alice.callTool(call)
      expect(s.writes).toHaveLength(2)
      const denied = await bob.callTool({ name: 'arrange_get_event', arguments: { conversationId: 'planning-alice' } })
      expect(denied.isError).toBe(true)
      expect(denied.structuredContent.error.code).toBe('not_found')
      expect(JSON.stringify(denied)).not.toContain('PRIVATE')
    } finally { await alice.close(); await bob.close() }
  })
  it('returns sanitized tool failures without retrying writes', async () => {
    const s = fixture(); const client = await s.connect('alice')
    try {
      const result = await client.callTool({ name: 'arrange_refine_event', arguments: { conversationId: 'planning-alice', requestId: 'change', expectedVersion: 1, message: 'New brief' } })
      expect(result.isError).toBe(true)
      expect(result.structuredContent.error.code).toBe('outcome_unknown')
      expect(JSON.stringify(result)).not.toContain('PRIVATE')
    } finally { await client.close() }
  })
  it('requires authorization on every HTTP request and fails closed after revocation', async () => {
    const s = fixture()
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    const request = auth => new Request(endpoint, { method: 'POST', body, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(auth ? { authorization: `Bearer ${token('alice')}` } : {}) } })
    expect((await s.handler(request(false))).status).toBe(401)
    s.revoke()
    expect((await s.handler(request(true))).status).toBe(401)
    expect(s.writes).toHaveLength(0)
  })
})
