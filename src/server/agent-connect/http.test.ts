import { expect, it } from 'vitest'
import { createAgentJsonHandler, createAgentHttpBoundary } from './http'
import { createAgentGateway } from './gateway'
import type { AgentBackend, AgentGrant } from './types'
const endpoint = 'https://arrange.example/api/agent-connect/tools'
const audience = 'https://arrange.example/api/agent-connect/mcp'
const token = 'fixture-token-with-at-least-32-bytes-for-test'
const grant: AgentGrant = { customerId: 'alice', clientId: 'client-a', grantId: 'grant-a', audience, expiresAt: Date.now() + 60000, revoked: false, scopes: ['arrange:read'], conversationIds: ['p-1'] }
function setup() {
  let calls = 0
  const backend: AgentBackend = {
    async create() { throw new Error('unexpected create') }, async command() { throw new Error('unexpected command') },
    async read() { calls++; return { id: 'p-1', version: 1, status: 'working', proposal: null, selections: [], messages: [], progress: null, error: null } },
  }
  const gateway = createAgentGateway({ audience, appOrigin: 'https://arrange.example', admit: async () => {}, backend })
  const opts = { gateway, endpointUrl: endpoint, verifyToken: async (value: string) => value === token ? grant : null }
  return { handler: createAgentJsonHandler(opts), opts, calls: () => calls }
}
function req(body: unknown = { name: 'arrange_get_event', arguments: { conversationId: 'p-1' } }, headers: Record<string, string> = {}, url = endpoint) {
  return new Request(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
it('serves a scoped JSON command with private no-store responses', async () => {
  const s = setup(); const response = await s.handler(req())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ conversationId: 'p-1', fulfillment: 'not_verified' })
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(s.calls()).toBe(1)
})
it.each(['', 'Bearer wrong', 'Basic abc'])('rejects missing/invalid authorization before backend: %s', async authorization => {
  const s = setup()
  expect((await s.handler(req(undefined, { authorization }))).status).toBe(401)
  expect(s.calls()).toBe(0)
})
it('rechecks grant revocation on the next request', async () => {
  const s = setup()
  const handler = createAgentJsonHandler({ ...s.opts, verifyToken: async () => ({ ...grant, revoked: true }) })
  expect((await handler(req())).status).toBe(401)
  expect(s.calls()).toBe(0)
})
it('fails closed on verifier failure without leaking exception content', async () => {
  const s = setup()
  const handler = createAgentJsonHandler({ ...s.opts, verifyToken: async () => { throw new Error('private registry address') } })
  const response = await handler(req())
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private registry address')
})
it.each([
  [{ origin: 'https://attacker.example' }, endpoint],
  [{ host: 'attacker.example' }, endpoint],
  [{}, 'https://attacker.example/api/agent-connect/tools'],
  [{}, endpoint + '?access_token=not-allowed'],
])('rejects untrusted origin/host or query credentials', async (headers, url) => {
  const s = setup()
  expect((await s.handler(req(undefined, headers, url))).status).toBeGreaterThanOrEqual(400)
  expect(s.calls()).toBe(0)
})
it('limits bytes even when content-length is absent', async () => {
  const s = setup()
  expect((await s.handler(req({ text: 'x'.repeat(40000) }))).status).toBe(413)
  expect(s.calls()).toBe(0)
})
it('bounds body read time and sanitizes malformed JSON', async () => {
  const s = setup()
  const boundary = createAgentHttpBoundary({ ...s.opts, bodyTimeoutMs: 10 })
  const stalled = new Request(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: new ReadableStream({ start() {} }), duplex: 'half' } as RequestInit)
  expect((await boundary(stalled, async () => Response.json({ unexpected: true }))).status).toBe(408)
  const malformed = new Request(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{broken' })
  expect((await s.handler(malformed)).status).toBe(400)
})
it.each(['timeout', 'size'] as const)('returns a bounded %s rejection even when stream cleanup never settles', async reason => {
  const s = setup()
  const boundary = createAgentHttpBoundary({ ...s.opts, bodyTimeoutMs: 10 })
  let cleanupStarted = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (reason === 'size') controller.enqueue(new Uint8Array(40_000))
    },
    cancel() {
      cleanupStarted = true
      return new Promise<void>(() => {})
    },
  })
  const request = new Request(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body, duplex: 'half' } as RequestInit)
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      boundary(request, async () => { throw new Error('handler must not run') }).then(response => response.status),
      new Promise<string>(resolve => { deadline = setTimeout(() => resolve('still_waiting'), 100) }),
    ])
    expect(result).toBe(reason === 'timeout' ? 408 : 413)
    expect(cleanupStarted).toBe(true)
    expect(s.calls()).toBe(0)
  } finally {
    clearTimeout(deadline)
  }
})
it('denies unsupported envelope fields and unavailable financial tools', async () => {
  const s = setup()
  expect((await s.handler(req({ name: 'arrange_get_event', arguments: { conversationId: 'p-1' }, customerId: 'bob' }))).status).toBe(400)
  expect((await s.handler(req({ name: 'execute_action', arguments: {} }))).status).toBe(400)
  expect(s.calls()).toBe(0)
})
