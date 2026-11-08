import { beforeAll, expect, test, vi } from 'vitest'
import { CONTRACT_VERSION, ResearchResult } from '../contracts'
import { createTestStore } from '../server/db/client'
import type { Store } from '../server/store'
import { createEvent, getEventView, cancel } from '../server/events/service'
import { makeDeps } from '../server/events/testFakes'
import { createResearchIntegration } from './integration'
import { discoveryFixture, researchBriefFixture, researchConsumerFixtures } from './integration.fixtures'
import type { ResearchSession } from './session'

let store: Store
beforeAll(async () => { store = await createTestStore() })
function setup(overrides: Partial<ResearchSession> = {}) {
  const session: ResearchSession = {
    createAgent: vi.fn(async () => 'agent'), start: vi.fn(async () => 'session'),
    poll: vi.fn(async () => ({ id: 'session', status: 'idle', stop_reason: 'end_turn', last_seq: 7,
      structured_output: { candidateIds: discoveryFixture.candidates.map(c => c.candidateId) } })),
    correct: vi.fn(async () => 8), cancel: vi.fn(async () => {}), deleteAgent: vi.fn(async () => {}), ...overrides,
  }
  const discover = vi.fn(async () => structuredClone(discoveryFixture))
  const research = createResearchIntegration({ store, providers: { discover, session } })
  const { deps } = makeDeps({ store, research, now: () => new Date() })
  return { deps, session, discover, research }
}
async function finish(deps: ReturnType<typeof makeDeps>['deps'], eventId: string) {
  for (let i = 0; i < 16; i++) {
    const view = await getEventView(deps, eventId)
    if (view.researchResult) return view
  }
  throw new Error('Research did not finish within the bounded test steps')
}

test('application start and polls persist evidence and session identity without inventing a plan', async () => {
  const { deps, discover, session } = setup()
  const started = await createEvent(deps, researchBriefFixture)
  expect(started.run?.state).toBe('running')
  expect(discover).not.toHaveBeenCalled()
  await getEventView(deps, started.event.eventId)
  expect((await store.researchCheckpoints!.read(started.run!.runId))!.evidence?.candidates).toEqual(discoveryFixture.candidates)
  expect(session.start).not.toHaveBeenCalled()
  const completed = await finish(deps, started.event.eventId)
  expect(completed.event.status).toBe('researched')
  expect(completed.researchResult).toMatchObject({ outcome: 'partial', budgetFit: 'unknown' })
  expect(completed.plan).toBeNull()
  expect(completed.run).toMatchObject({ lastSequence: 7, naiveSessionId: 'session' })
  expect(discover).toHaveBeenCalledTimes(1)
  expect(session.cancel).toHaveBeenCalledTimes(1)
})

test('idle error retains partial evidence and never reports success', async () => {
  const { deps, session } = setup({ poll: vi.fn(async () => ({ id: 'session', status: 'idle', stop_reason: 'error', last_seq: 9 })) })
  const started = await createEvent(deps, researchBriefFixture)
  const completed = await finish(deps, started.event.eventId)
  expect(completed.researchResult).toMatchObject({ outcome: 'partial', recommendations: [] })
  expect(completed.researchResult!.warnings.join(' ')).toContain('without a valid completion')
  expect(session.correct).not.toHaveBeenCalled()
})

test('duplicate provider snapshots do not duplicate visible progress', async () => {
  const { deps } = setup({ poll: vi.fn(async () => ({ id: 'session', status: 'running', last_seq: 4 })) })
  const started = await createEvent(deps, researchBriefFixture)
  for (let i = 0; i < 5; i++) await getEventView(deps, started.event.eventId)
  const once = await store.getEventView(started.event.eventId)
  const twice = await getEventView(deps, started.event.eventId)
  expect(twice.progress).toEqual(once!.progress)
  expect(twice.run!.lastSequence).toBe(4)
  expect(twice.progress.map(p => p.sequence)).toEqual([...twice.progress].map((_, i) => i + 1))
})

test('one correction waits beyond accepted sequence and never repeats discovery', async () => {
  let polls = 0
  const { deps, discover, session } = setup({ poll: vi.fn(async () => {
    polls++
    return { id: 'session', status: 'idle', stop_reason: 'end_turn', last_seq: polls === 1 ? 7 : polls === 2 ? 8 : 10,
      structured_output: { candidateIds: polls < 3 ? ['invented'] : discoveryFixture.candidates.map(c => c.candidateId) } }
  }) })
  const started = await createEvent(deps, researchBriefFixture)
  const completed = await finish(deps, started.event.eventId)
  expect(completed.researchResult!.recommendations).toHaveLength(discoveryFixture.candidates.length)
  expect(completed.run).toMatchObject({ correctionsUsed: 1, lastSequence: 10 })
  expect(session.correct).toHaveBeenCalledTimes(1)
  expect(discover).toHaveBeenCalledTimes(1)
})

test('missing input and failed discovery finish without hosted calls', async () => {
  const { research, session, deps, discover } = setup()
  const { event, run } = await store.createEvent({ customerId: 'customer_test', brief: researchBriefFixture })
  await research.startResearch({ contractVersion: CONTRACT_VERSION, eventId: event.eventId, runId: run.runId,
    briefRevision: 1, brief: { ...event.brief, location: '' } })
  const claimed = (await store.claimRunAdvance(run.runId, new Date(), 30000))!
  await research.advanceResearch({ event, run: claimed })
  expect((await store.researchCheckpoints!.read(run.runId))!.result).toMatchObject({ outcome: 'awaiting_input', missing: ['location'] })
  expect(discover).not.toHaveBeenCalled()
  expect(session.createAgent).not.toHaveBeenCalled()
  discover.mockRejectedValueOnce(new Error('private credentials'))
  const started = await createEvent(deps, researchBriefFixture)
  const completed = await finish(deps, started.event.eventId)
  expect(completed.researchResult!.outcome).toBe('failed')
  expect(JSON.stringify(completed)).not.toContain('private credentials')
})

test('cancellation while session creation is in flight discards the late session', async () => {
  let accept: (value: string) => void = () => {}
  let entered: () => void = () => {}
  const waiting = new Promise<void>(resolve => { entered = resolve })
  const { deps, session } = setup({ start: vi.fn(() => { entered(); return new Promise<string>(resolve => { accept = resolve }) }) })
  const started = await createEvent(deps, researchBriefFixture)
  await getEventView(deps, started.event.eventId)
  await getEventView(deps, started.event.eventId)
  const pending = getEventView(deps, started.event.eventId)
  await waiting
  await cancel(deps, started.event.eventId)
  accept('late-session')
  const completed = await pending
  expect(completed.run!.state).toBe('canceled')
  expect(completed.researchResult).toBeNull()
  expect(session.cancel).toHaveBeenCalledWith('late-session', expect.any(AbortSignal))
  expect(session.poll).not.toHaveBeenCalled()
})

test('consumer fixtures validate without claiming live supplier evidence', () => {
  for (const fixture of [researchConsumerFixtures.missing, researchConsumerFixtures.partial, researchConsumerFixtures.failure, researchConsumerFixtures.canceled]) {
    expect(ResearchResult.safeParse(fixture).success).toBe(true)
    expect(fixture.candidates.every(c => c.evidenceMode === 'simulated')).toBe(true)
  }
})

test('a new integration instance continues from durable evidence and session checkpoints', async () => {
  const { deps, discover, session } = setup()
  const started = await createEvent(deps, researchBriefFixture)
  for (let i = 0; i < 3; i++) await getEventView(deps, started.event.eventId)
  const noDiscovery = vi.fn(async () => { throw new Error('Discovery must not repeat') })
  deps.research = createResearchIntegration({ store, providers: { discover: noDiscovery, session } })
  const completed = await finish(deps, started.event.eventId)
  expect(completed.researchResult!.outcome).toBe('partial')
  expect(discover).toHaveBeenCalledTimes(1)
  expect(noDiscovery).not.toHaveBeenCalled()
  expect(session.start).toHaveBeenCalledTimes(1)
})

test('enrichment receives saved evidence once before hosted ranking', async () => {
  const { deps, discover, session } = setup()
  const enrich = vi.fn(async (_input, evidence) => ({ ...evidence, warnings: ['Detail check did not confirm availability.'] }))
  deps.research = createResearchIntegration({ store, providers: { discover, session, enrich } })
  const started = await createEvent(deps, researchBriefFixture)
  const completed = await finish(deps, started.event.eventId)
  expect(enrich).toHaveBeenCalledTimes(1)
  expect(enrich.mock.calls[0][1].candidates).toEqual(discoveryFixture.candidates)
  expect(completed.researchResult!.warnings).toContain('Detail check did not confirm availability.')
  expect(session.start).toHaveBeenCalledTimes(1)
})

test('uncertain session creation is not retried and retains evidence for reconciliation', async () => {
  const { deps, session } = setup({ start: vi.fn(async () => { throw new Error('private transport diagnostic') }) })
  const started = await createEvent(deps, researchBriefFixture)
  const completed = await finish(deps, started.event.eventId)
  expect(completed.researchResult!.outcome).toBe('partial')
  expect(completed.researchResult!.warnings.join(' ')).toContain('uncertain outcome')
  expect(JSON.stringify(completed)).not.toContain('private transport diagnostic')
  expect(session.start).toHaveBeenCalledTimes(1)
})

test('a revised brief rejects an in-flight provider result', async () => {
  let accept: (value: Awaited<ReturnType<ResearchSession['poll']>>) => void = () => {}
  let entered: () => void = () => {}
  const waiting = new Promise<void>(resolve => { entered = resolve })
  const { deps } = setup({ poll: vi.fn(() => { entered(); return new Promise<Awaited<ReturnType<ResearchSession['poll']>>>(resolve => { accept = resolve }) }) })
  const started = await createEvent(deps, researchBriefFixture)
  for (let i = 0; i < 3; i++) await getEventView(deps, started.event.eventId)
  const pending = getEventView(deps, started.event.eventId)
  await waiting
  await store.updateBrief({ eventId: started.event.eventId, expectedBriefRevision: 1,
    brief: { ...researchBriefFixture, location: 'New location' } })
  accept({ id: 'session', status: 'idle', stop_reason: 'end_turn', last_seq: 10,
    structured_output: { candidateIds: discoveryFixture.candidates.map(c => c.candidateId) } })
  const view = await pending
  expect(view.event.briefRevision).toBe(2)
  expect(view.researchResult).toBeNull()
  expect(await store.getResearchResult(started.run!.runId)).toBeNull()
})

test('cancellation reports an unconfirmed provider stop and schedules no new research', async () => {
  const { deps, session } = setup({ start: vi.fn(async () => 'cancel-session'),
    poll: vi.fn(async () => ({ id: 'cancel-session', status: 'running', last_seq: 0 })),
    cancel: vi.fn(async () => { throw new Error('private failure') }) })
  const started = await createEvent(deps, researchBriefFixture)
  for (let i = 0; i < 3; i++) await getEventView(deps, started.event.eventId)
  const canceled = await cancel(deps, started.event.eventId)
  expect(canceled.run!.state).toBe('canceled')
  expect(canceled.progress.some(p => p.message.includes('stop could not be confirmed'))).toBe(true)
  const calls = vi.mocked(session.poll).mock.calls.length
  await getEventView(deps, started.event.eventId)
  expect(session.poll).toHaveBeenCalledTimes(calls)
  expect((await store.researchCheckpoints!.read(started.run!.runId))!.cleanup).toMatchObject({ confirmed: false, sessionId: 'cancel-session' })
})

test('a terminal hosted session needs no cancel call', async () => {
  const { deps, session } = setup({ poll: vi.fn(async () => ({ id: 'session', status: 'completed', stop_reason: 'end_turn', last_seq: 7,
    structured_output: { candidateIds: discoveryFixture.candidates.map(c => c.candidateId) } })) })
  const started = await createEvent(deps, researchBriefFixture)
  const completed = await finish(deps, started.event.eventId)
  expect(completed.researchResult!.outcome).toBe('partial')
  expect(session.cancel).not.toHaveBeenCalled()
})

test('repeated malformed ranking stops after one correction with supported evidence only', async () => {
  let sequence = 10
  const { deps, session } = setup({ poll: vi.fn(async () => ({ id: 'session', status: 'idle', stop_reason: 'end_turn',
    last_seq: sequence++, structured_output: { candidateIds: ['invented'] } })) })
  const started = await createEvent(deps, researchBriefFixture)
  const completed = await finish(deps, started.event.eventId)
  expect(completed.researchResult!.recommendations).toEqual([])
  expect(completed.researchResult!.candidates).toEqual(discoveryFixture.candidates)
  expect(session.correct).toHaveBeenCalledTimes(1)
})

test('an expired run stops scheduling provider work', async () => {
  const { deps, discover, session } = setup()
  const started = await createEvent(deps, researchBriefFixture)
  const run = (await store.claimRunAdvance(started.run!.runId, new Date(), 30000))!
  const checkpoint = (await store.researchCheckpoints!.read(run.runId))!
  await store.researchCheckpoints!.save(run, checkpoint.version, { ...checkpoint, expiresAt: '2026-01-01T00:00:00.000Z' })
  await store.releaseRunAdvance(run.runId, 0, run.advancingUntil)
  const completed = await finish(deps, started.event.eventId)
  expect(completed.researchResult!.outcome).toBe('failed')
  expect(discover).not.toHaveBeenCalled()
  expect(session.createAgent).not.toHaveBeenCalled()
})

test('real REST adapters work through application polling with controlled HTTP responses', async () => {
  const { createDiscovery } = await import('../suppliers/discovery')
  const { createResearchSession } = await import('./session')
  const requests: string[] = []
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url)
    requests.push(path)
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    let reply: unknown
    if (path === 'https://api.monid.ai/v1/run') reply = { runId: 'monid-controlled', status: 'COMPLETED',
      providerResponse: { httpStatus: 200 }, output: body.provider === 'litescrape'
        ? { local_results: [{ title: 'Controlled venue', place_id: 'venue', website: 'https://example.com/venue' }] }
        : { products: [{ id: 'plates', title: 'Controlled plates', offers: [{ url: 'https://example.com/plates' }] }] } }
    else if (path.endsWith('/agents')) reply = { id: 'http-agent' }
    else if (path.endsWith('/sessions')) reply = { id: 'http-session' }
    else if (path.endsWith('/cancel') || init?.method === 'DELETE') reply = {}
    else reply = { id: 'http-session', status: 'idle', stop_reason: 'end_turn', last_seq: 12,
      structured_output: { candidateIds: ['venue:venue', 'supply:plates'] } }
    return new Response(JSON.stringify(reply))
  }) as typeof fetch
  const research = createResearchIntegration({ store, providers: {
    discover: createDiscovery({ apiKey: 'controlled-secret', fetch: fetcher }),
    session: createResearchSession({ apiKey: 'controlled-secret', model: 'controlled-model', fetch: fetcher }),
  } })
  const { deps } = makeDeps({ store, research, now: () => new Date() })
  const started = await createEvent(deps, researchBriefFixture)
  const completed = await finish(deps, started.event.eventId)
  expect(completed.researchResult!.recommendations.map(r => r.candidateId)).toEqual(['venue:venue', 'supply:plates'])
  expect(completed.researchResult!.outcome).toBe('partial')
  expect(JSON.stringify(completed)).not.toContain('controlled-secret')
  expect(requests.filter(path => path === 'https://api.monid.ai/v1/run')).toHaveLength(2)
  expect(requests.filter(path => path.endsWith('/sessions'))).toHaveLength(1)
})
