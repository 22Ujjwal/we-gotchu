import { expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createTestPlanningRepository } from '../../src/server/db/client.ts'
import { createPlanningBridge } from '../../src/server/agent-connect/planning-bridge.ts'
import { createAgentGateway } from '../../src/server/agent-connect/gateway.ts'
import { createArrangeMcpHandler } from './mcp.mjs'

it('runs a persisted planning journey through the official MCP client without outreach or payment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'arrange-agent-journey-'))
  const endpoint = 'https://arrange.example/api/agent-connect/mcp'
  const token = 'fixture-individual-grant-for-planning-journey-only'
  const grant = { grantId: 'journey-grant', clientId: 'journey-client', customerId: 'journey-customer',
    audience: endpoint, expiresAt: Date.now() + 600_000, revoked: false,
    scopes: ['arrange:read', 'arrange:plan', 'arrange:select'], conversationIds: null }
  const brief = 'Birthday for 20 guests in San Francisco, CA. December 12, 2026 at 18:00-08:00. Timezone America/Los_Angeles. Budget USD 500. Supplies: paper plates. Maximum cancellation loss USD 0.'
  let starts = 0
  const sent = []
  let unsafeCalls = 0
  const forbidden = () => { unsafeCalls++; throw new Error('An external planning tool must not start outreach, offers or arrangements') }
  const provider = {
    async start() { starts++; return { sessionId: 'fixture-research-session', sequence: 1 } },
    async send(input) { sent.push(input); return { sequence: 3 } },
    async read() {
      return { status: 'ready', sequence: sent.length ? 4 : 2, progress: null, error: null,
        proposal: { summary: sent.length ? '30 guests in Oakland; other requirements unchanged' : '20 guests in San Francisco',
          nextQuestion: null, options: [{ id: 'venue-1', kind: 'venue', name: 'Fixture venue',
            url: 'https://venue.example', why: 'Controlled test result only', facts: [],
            unknowns: ['Availability unconfirmed', 'All-in price unknown'] }] } }
    },
  }
  let database
  let client
  async function connect() {
    const backend = createPlanningBridge({ repository: database.repository, agent: () => provider,
      mail: { sendInquiry: forbidden, reconcileInquiry: forbidden }, arrange: forbidden, generateOffer: forbidden })
    const gateway = createAgentGateway({ backend, admit: async () => {}, audience: endpoint, appOrigin: 'https://arrange.example' })
    const handler = createArrangeMcpHandler({ gateway, endpointUrl: endpoint,
      verifyToken: async candidate => candidate === token ? grant : null })
    client = new Client({ name: 'arrange-persisted-fixture-client', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: (url, init) => handler(new Request(url, init)),
    }))
  }
  async function call(name, args) {
    const result = await client.callTool({ name, arguments: args })
    expect(result.isError).not.toBe(true)
    return result.structuredContent
  }
  try {
    database = await createTestPlanningRepository(directory)
    await connect()
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
      'arrange_get_capabilities', 'arrange_start_event', 'arrange_get_event', 'arrange_refine_event', 'arrange_toggle_selection',
    ])
    const created = await call('arrange_start_event', { requestId: 'initial', message: brief })
    const id = created.conversationId
    expect(created.researchStatus).toBe('working')
    expect((await call('arrange_start_event', { requestId: 'initial', message: brief })).conversationId).toBe(id)
    const ready = await call('arrange_get_event', { conversationId: id })
    expect(ready.researchStatus).toBe('ready')
    expect(ready.proposal.options[0].unknowns).toContain('All-in price unknown')
    const selection = { conversationId: id, requestId: 'choose', expectedVersion: ready.version, optionId: 'venue-1' }
    const selected = await call('arrange_toggle_selection', selection)
    expect((await call('arrange_toggle_selection', selection)).selections).toEqual(selected.selections)
    expect(selected.selections).toHaveLength(1)
    expect(selected).not.toHaveProperty('inquiry')
    expect(selected).not.toHaveProperty('paymentLink')
    expect(selected.fulfillment).toBe('not_verified')
    const stored = await database.repository.get(grant.customerId, id)
    expect(stored.view.selections).toHaveLength(1)
    expect(stored.view.inquiry?.delivery).toBeUndefined()
    expect(stored.view.arrangement).toBeUndefined()
    expect(stored.view.paymentLink).toBeUndefined()
    expect(unsafeCalls).toBe(0)

    await client.close(); client = undefined
    await database.close(); database = undefined
    database = await createTestPlanningRepository(directory)
    await connect()
    const restored = await call('arrange_get_event', { conversationId: id })
    expect(restored.selections).toEqual(selected.selections)
    expect(restored.customerReviewUrl).toBe(created.customerReviewUrl)
    const revised = await call('arrange_refine_event', { conversationId: id, requestId: 'revise',
      expectedVersion: restored.version, message: 'Change to 30 guests in Oakland, CA. Keep everything else unchanged.' })
    expect(revised.researchStatus).toBe('working')
    const finished = await call('arrange_get_event', { conversationId: id })
    expect(finished.proposal.summary).toContain('30 guests in Oakland')
    expect(finished.selections).toEqual(selected.selections)
    expect(finished.fulfillment).toBe('not_verified')
    const saved = await database.repository.get(grant.customerId, id)
    expect(saved.view.messages.filter(message => message.role === 'user').map(message => message.text)).toEqual([
      brief, 'Change to 30 guests in Oakland, CA. Keep everything else unchanged.',
    ])
    expect(saved.view.inquiry?.delivery).toBeUndefined()
    expect(saved.view.paymentLink).toBeUndefined()
    expect(starts).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ message: 'Change to 30 guests in Oakland, CA. Keep everything else unchanged.',
      selections: selected.selections })
    expect(unsafeCalls).toBe(0)
  } finally {
    await client?.close()
    await database?.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)
