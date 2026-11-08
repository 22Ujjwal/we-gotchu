import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanningAgent, PlanningView } from '../../agent/planning/contract'
import { createTestPlanningRepository } from '../db/client'
import type { PlanningDeps } from './service'

let deps: PlanningDeps
vi.mock('./runtime', () => ({ getPlanningDeps: () => deps, dispatchPlanningReplies: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => ({ options }) }))
import { Route as collectionRoute } from '../../routes/api/planning'
import { Route as itemRoute } from '../../routes/api/planning.$id'

type Handler = (context: { request: Request; params: { id: string } }) => Promise<Response>
const collection = collectionRoute.options.server!.handlers as unknown as { POST: Handler }
const item = itemRoute.options.server!.handlers as unknown as { GET: Handler; POST: Handler }
const context = (body?: unknown, id = '') => ({
  params: { id }, request: new Request(`http://localhost/api/planning/${id}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) }),
})
let db: Awaited<ReturnType<typeof createTestPlanningRepository>>
let agent: PlanningAgent
beforeEach(async () => {
  db = await createTestPlanningRepository()
  agent = {
    start: vi.fn(async () => ({ sessionId: 'session', sequence: 1 })),
    send: vi.fn(async () => ({ sequence: 3 })),
    read: vi.fn(async () => ({
      status: 'ready' as const, sequence: 2, progress: null, error: null,
      proposal: { summary: 'A venue', nextQuestion: null, options: [{
        id: 'venue', kind: 'venue' as const, name: 'A venue', url: 'https://example.com', why: 'Room', facts: [], unknowns: [],
      }] },
    })),
  }
  deps = { repository: db.repository, agent: () => agent, requireCustomerId: async () => 'alice' }
})
afterEach(async () => { await db.close() })

describe('registered planning routes with durable storage', () => {
  it('creates, reloads, selects, and continues through real HTTP handlers', async () => {
    const created = await collection.POST(context({ requestId: 'first', message: 'A party' }))
    expect(created.status).toBe(201)
    const initial = await created.json() as PlanningView
    const loaded = await (await item.GET(context(undefined, initial.id))).json() as PlanningView
    expect(loaded.status).toBe('ready')
    const selection = { kind: 'select', requestId: 'select', optionId: 'venue', expectedVersion: loaded.version }
    const selected = await (await item.POST(context(selection, initial.id))).json() as PlanningView
    expect(selected.selections.map(option => option.id)).toEqual(['venue'])
    const stale = await item.POST(context({ kind: 'message', requestId: 'stale', message: 'Cheaper', expectedVersion: loaded.version }, initial.id))
    expect(stale.status).toBe(409)
    expect((await stale.json()).errorCode).toBe('stale_version')
    const sent = await item.POST(context({ kind: 'message', requestId: 'followup', message: 'Cheaper', expectedVersion: selected.version }, initial.id))
    expect(sent.status).toBe(200)
    expect(agent.send).toHaveBeenCalledWith({ sessionId: 'session', requestId: 'followup', message: 'Cheaper', selections: selected.selections })
    expect(agent.start).toHaveBeenCalledTimes(1)
  })

  it('returns 401 and ownership-safe 404 without querying another session', async () => {
    const created = await collection.POST(context({ requestId: 'first', message: 'A party' }))
    const { id } = await created.json()
    deps = { ...deps, requireCustomerId: async () => 'bob' }
    const denied = await item.GET(context(undefined, id))
    expect(denied.status).toBe(404)
    expect((await denied.json()).errorCode).toBe('not_found')
    deps = { ...deps, requireCustomerId: async () => { throw { status: 401 } } }
    expect((await item.GET(context(undefined, id))).status).toBe(401)
    expect((await collection.POST(context({ requestId: 'x', message: 'Party' }))).status).toBe(401)
    expect(agent.read).not.toHaveBeenCalled()
  })
})
