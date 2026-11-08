import { describe, expect, it } from 'vitest'
import { bookedEvent } from '../../contracts'
import { SimulatedSupplierAdapter } from '../execution/simulated-adapter'
import { MemoryStore } from '../testing/memory-store'
import { isAuthorized } from './auth'
import { handleMcpRequest } from './http'
import { createTools } from './tools'

const TOKEN = 'test-token-not-a-secret'
const NOW = new Date('2026-11-08T01:10:00.000Z')

function makeStore() {
  const store = new MemoryStore()
  store.seed({
    event: { ...bookedEvent.event, status: 'awaiting_payment', progressSequence: 0 },
    plan: bookedEvent.plan!,
    approval: bookedEvent.approval!,
    payment: bookedEvent.payment!,
  })
  return store
}

function setup() {
  const store = makeStore()
  const tools = createTools(() => ({ store, adapterFor: () => new SimulatedSupplierAdapter(), now: () => NOW }))
  const post = async (body: unknown, token: string | null = TOKEN) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (token !== null) headers.authorization = `Bearer ${token}`
    const response = await handleMcpRequest(
      new Request('https://example.test/api/mcp', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }),
      tools,
      TOKEN,
    )
    const text = await response.text()
    return { status: response.status, json: text ? JSON.parse(text) : null, contentType: response.headers.get('content-type') }
  }
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const { json } = await post({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } })
    return { raw: json, result: json.result, payload: json.result ? JSON.parse(json.result.content[0].text) : null }
  }
  return { store, post, call }
}

describe('auth', () => {
  it('returns 401 without a token and with a wrong token', async () => {
    const { post } = setup()
    expect((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, null)).status).toBe(401)
    expect((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'wrong')).status).toBe(401)
  })

  it('refuses everything when MCP_BEARER_TOKEN is unset', () => {
    expect(isAuthorized(`Bearer ${TOKEN}`, undefined)).toBe(false)
    expect(isAuthorized(`Bearer ${TOKEN}`, '')).toBe(false)
    expect(isAuthorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true)
    expect(isAuthorized(TOKEN, TOKEN)).toBe(false)
  })
})

describe('JSON-RPC protocol', () => {
  it('answers initialize with protocol version, server info and tools capability', async () => {
    const { post } = setup()
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } })
    expect(res.status).toBe(200)
    expect(res.contentType).toBe('application/json')
    expect(res.json).toMatchObject({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-03-26', serverInfo: { name: 'we-gotchu' }, capabilities: { tools: {} } } })
  })

  it('accepts notifications/initialized with 202 and no body', async () => {
    const { post } = setup()
    const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(res.status).toBe(202)
    expect(res.json).toBeNull()
  })

  it('lists the tools with JSON input schemas', async () => {
    const { post } = setup()
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const tools = res.json.result.tools as { name: string; inputSchema: { type: string; required?: string[] } }[]
    expect(tools.map((t) => t.name)).toEqual(['ping', 'get_event', 'log_progress', 'execute_action', 'cancel_action', 'reconcile_action'])
    const execute = tools.find((t) => t.name === 'execute_action')!
    expect(execute.inputSchema).toMatchObject({ type: 'object', required: ['eventId', 'actionId', 'reason'] })
  })

  it('returns method not found for an unknown method', async () => {
    const { post } = setup()
    expect((await post({ jsonrpc: '2.0', id: 3, method: 'resources/list' })).json).toMatchObject({ id: 3, error: { code: -32601 } })
  })

  it('returns a parse error for bad JSON', async () => {
    const { post } = setup()
    const res = await post('{not json')
    expect(res.status).toBe(400)
    expect(res.json).toMatchObject({ id: null, error: { code: -32700 } })
  })

  it('returns invalid params for an unknown tool or bad arguments', async () => {
    const { post } = setup()
    expect((await post({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'buy_everything', arguments: {} } })).json.error.code).toBe(-32602)
    expect((await post({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'execute_action', arguments: { eventId: 'e' } } })).json.error.code).toBe(-32602)
    // The agent cannot supply its own execution key.
    expect(
      (await post({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'execute_action', arguments: { eventId: 'e', actionId: 'a', reason: 'r', executionKey: 'x' } } })).json.error.code,
    ).toBe(-32602)
  })
})

describe('tools over MCP', () => {
  it('ping works without a store', async () => {
    const tools = createTools(() => {
      throw new Error('no store')
    })
    const res = await handleMcpRequest(
      new Request('https://example.test/api/mcp', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ping', arguments: {} } }) }),
      tools,
      TOKEN,
    )
    const json = await res.json()
    expect(JSON.parse(json.result.content[0].text)).toMatchObject({ ok: true, pong: true })
    expect(json.result.isError).toBeUndefined()
  })

  it('execute_action refusal is a tool error, success and replay are results', async () => {
    const { call, store } = setup()
    const refused = await call('execute_action', { eventId: 'evt_sim_1', actionId: 'act_sim_item', reason: 'buy plates' })
    expect(refused.result.isError).toBe(true)
    expect(refused.payload).toMatchObject({ errorCode: 'not_allowed', reason: 'dependency_pending' })

    const booked = await call('execute_action', { eventId: 'evt_sim_1', actionId: 'act_sim_venue', reason: 'book venue' })
    expect(booked.payload).toMatchObject({ ok: true, replayed: false, attempt: { state: 'succeeded' } })
    const replay = await call('execute_action', { eventId: 'evt_sim_1', actionId: 'act_sim_venue', reason: 'book venue again' })
    expect(replay.payload).toMatchObject({ ok: true, replayed: true })

    const view = await call('get_event', { eventId: 'evt_sim_1' })
    expect(view.payload.actions).toEqual([
      { actionId: 'act_sim_venue', allowed: true, reason: null },
      { actionId: 'act_sim_item', allowed: true, reason: null },
    ])
    expect(view.payload.event.customerId).toBeUndefined()

    const logged = await call('log_progress', { eventId: 'evt_sim_1', message: 'Venue booked; plates next.' })
    expect(logged.payload).toMatchObject({ ok: true })
    expect(store.progress.at(-1)).toMatchObject({ actor: 'agent', message: 'Venue booked; plates next.' })
  })

  it('reports an unknown event as a tool error', async () => {
    const { call } = setup()
    const res = await call('get_event', { eventId: 'nope' })
    expect(res.result.isError).toBe(true)
    expect(res.payload).toMatchObject({ errorCode: 'not_found' })
  })
})
