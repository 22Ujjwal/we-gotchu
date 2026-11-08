import { beforeAll, expect, test, vi } from 'vitest'
import { createTestStore } from '../server/db/client'
import type { Store } from '../server/store'
import { createEvent, getEventView, updateBrief } from '../server/events/service'
import { makeDeps, validBrief } from '../server/events/testFakes'
import { createResearchIntegration } from './integration'
import { discoveryFixture } from './integration.test-fixtures'
import type { ResearchSession } from './session'
import type { ResearchInput } from '../contracts'

let store: Store
beforeAll(async () => { store = await createTestStore() })

function setup() {
  const inputs = new Map<string, string[]>()
  const discover = vi.fn(async (input: ResearchInput) => {
    const evidence = structuredClone(discoveryFixture)
    for (const candidate of evidence.candidates) candidate.candidateId += `:${input.briefRevision}`
    inputs.set(input.runId, evidence.candidates.map(c => c.candidateId))
    return evidence
  })
  const session: ResearchSession = {
    createAgent: vi.fn(async input => `agent:${input.runId}`),
    start: vi.fn(async input => input.runId),
    poll: vi.fn(async sessionId => ({ id: sessionId, status: 'completed', stop_reason: 'end_turn',
      last_seq: 1, structured_output: { candidateIds: inputs.get(sessionId) } })),
    correct: vi.fn(async () => 2), cancel: vi.fn(async () => {}), deleteAgent: vi.fn(async () => {}),
  }
  const research = createResearchIntegration({ store, providers: { discover, session } })
  const { deps } = makeDeps({ store, research, now: () => new Date() })
  return { deps, discover, session, research }
}

async function finish(deps: ReturnType<typeof setup>['deps'], eventId: string) {
  for (let i = 0; i < 16; i++) {
    const view = await getEventView(deps, eventId)
    if (view.researchResult) return view
  }
  throw new Error('Research did not finish within bounded application polls')
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

test('successive partial updates retain answers and send the current brief to new research', async () => {
  const { deps, discover, session } = setup()
  const initial = await createEvent(deps, validBrief)
  const first = await finish(deps, initial.event.eventId)
  let previous = first
  for (const changes of [{ location: 'Oakland, CA' }, { headcount: 48 }, { budget: 12000 }]) {
    const revised = await updateBrief(deps, initial.event.eventId, previous.event.briefRevision, changes)
    expect(revised.event.brief).toEqual({ ...previous.event.brief, ...changes })
    expect(revised.researchResult).toBeNull()
    expect(revised.run!.runId).not.toBe(previous.run!.runId)
    expect(await store.getResearchResult(previous.run!.runId)).toMatchObject({ superseded: true })
    const current = await finish(deps, initial.event.eventId)
    expect(current.researchResult).toMatchObject({ eventId: initial.event.eventId,
      runId: current.run!.runId, briefRevision: current.event.briefRevision, superseded: false })
    expect(discover.mock.lastCall![0].brief).toEqual(current.event.brief)
    expect(vi.mocked(session.start).mock.lastCall![0].brief).toEqual(current.event.brief)
    expect(current.researchResult!.recommendations.map(r => r.candidateId))
      .not.toEqual(previous.researchResult!.recommendations.map(r => r.candidateId))
    previous = current
  }
  expect(discover).toHaveBeenCalledTimes(4)
})

test('invalid partial updates report only absent fields and leave stored answers and run intact', async () => {
  const { deps, discover } = setup()
  const initial = await createEvent(deps, validBrief)
  await expect(updateBrief(deps, initial.event.eventId, 1, { location: ' ' }))
    .rejects.toMatchObject({ status: 422, errorCode: 'missing_fields', extra: { missing: ['location'] } })
  await expect(updateBrief(deps, initial.event.eventId, 1, { headcount: 0 }))
    .rejects.toMatchObject({ status: 422, errorCode: 'invalid_brief' })
  expect((await store.getEventView(initial.event.eventId))!.event).toEqual(initial.event)
  expect((await store.getCurrentRun(initial.event.eventId, 'research'))!.runId).toBe(initial.run!.runId)
  expect(discover).not.toHaveBeenCalled()
})

test('a stale partial update cannot erase an accepted answer or start another run', async () => {
  const { deps, research } = setup()
  const initial = await createEvent(deps, validBrief)
  const start = vi.spyOn(research, 'startResearch')
  const revised = await updateBrief(deps, initial.event.eventId, 1, { location: 'Oakland, CA' })
  await expect(updateBrief(deps, initial.event.eventId, 1, { budget: 10000 }))
    .rejects.toMatchObject({ status: 409, errorCode: 'stale_brief' })
  expect((await store.getEvent(initial.event.eventId))!.brief).toEqual(revised.event.brief)
  expect(start).toHaveBeenCalledTimes(1)
})

test('storage rejects an older completed response after a newer revision has published', async () => {
  const { deps, research } = setup()
  const entered = deferred<void>()
  const release = deferred<void>()
  const advance = research.advanceResearch.bind(research)
  const initial = await createEvent(deps, validBrief)
  vi.spyOn(research, 'advanceResearch').mockImplementation(async input => {
    const step = await advance(input)
    if (input.run.runId === initial.run!.runId && step.status === 'done') {
      entered.resolve()
      await release.promise
    }
    return step
  })
  const publish = vi.spyOn(store, 'publishResearchResult')
  try {
    // The held response has passed checkpoint validation, so the database must reject it.
    const older = finish(deps, initial.event.eventId)
    await entered.promise
    await updateBrief(deps, initial.event.eventId, 1, { location: 'Oakland, CA' })
    const current = await finish(deps, initial.event.eventId)
    release.resolve()
    await older
    expect(await store.getEventView(initial.event.eventId)).toMatchObject({
      event: { briefRevision: 2, status: 'researched' }, researchResult: current.researchResult,
    })
    expect(await store.getResearchResult(initial.run!.runId)).toBeNull()
    expect(await publish.mock.results.at(-1)!.value).toEqual({ ok: false, reason: 'stale_brief' })
  } finally { release.resolve(); publish.mockRestore() }
})

test('delayed cleanup for an older update cannot reset a newer completed revision', async () => {
  const { deps, research } = setup()
  const entered = deferred<void>()
  const release = deferred<void>()
  const initial = await createEvent(deps, validBrief)
  const cancel = research.cancelResearch.bind(research)
  vi.spyOn(research, 'cancelResearch').mockImplementation(async run => {
    if (run.runId === initial.run!.runId) {
      entered.resolve()
      await release.promise
    }
    await cancel(run)
  })
  const older = updateBrief(deps, initial.event.eventId, 1, { location: 'Oakland, CA' })
  try {
    await entered.promise
    await updateBrief(deps, initial.event.eventId, 2, { budget: 10000 })
    const latest = await finish(deps, initial.event.eventId)
    expect(latest.event.status).toBe('researched')
    release.resolve()
    await older
    const current = await getEventView(deps, initial.event.eventId)
    expect(current.event).toMatchObject({ briefRevision: 3, status: 'researched' })
    expect(current.researchResult).toEqual(latest.researchResult)
  } finally { release.resolve(); await older }
})

test('an array is not a partial brief object and cannot replace the active run', async () => {
  const { deps, research } = setup()
  const initial = await createEvent(deps, validBrief)
  const start = vi.spyOn(research, 'startResearch')
  await expect(updateBrief(deps, initial.event.eventId, 1, []))
    .rejects.toMatchObject({ status: 422, errorCode: 'invalid_input' })
  expect((await store.getEvent(initial.event.eventId))!.briefRevision).toBe(1)
  expect(start).not.toHaveBeenCalled()
})

test('revised location and guest count change real discovery requests with controlled HTTP', async () => {
  const { createDiscovery } = await import('../suppliers/discovery')
  const { deps, session } = setup()
  const queries: string[] = []
  const rankings = new Map<string, string[]>()
  const fetcher: typeof fetch = vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init!.body))
    const venue = body.provider === 'litescrape'
    const query: string = venue ? body.input.queryParams.q : body.input.body.query
    queries.push(query)
    const listingId = venue ? (query.includes('Oakland') ? 'oakland' : 'sf')
      : (query.includes('48 people') ? 'plates48' : 'plates20')
    return new Response(JSON.stringify({ runId: `controlled:${listingId}`, status: 'COMPLETED',
      providerResponse: { httpStatus: 200 }, output: venue
        ? { local_results: [{ title: listingId, place_id: listingId, website: `https://example.com/${listingId}` }] }
        : { products: [{ id: listingId, title: listingId, offers: [{ url: `https://example.com/${listingId}` }] }] },
    }))
  })
  vi.mocked(session.start).mockImplementation(async (input, candidates) => {
    rankings.set(input.runId, candidates.map(c => c.candidateId))
    return input.runId
  })
  vi.mocked(session.poll).mockImplementation(async sessionId => ({ id: sessionId,
    status: 'completed', stop_reason: 'end_turn', last_seq: 1,
    structured_output: { candidateIds: rankings.get(sessionId) },
  }))
  deps.research = createResearchIntegration({ store, providers: { session,
    discover: createDiscovery({ apiKey: 'controlled-test-key', fetch: fetcher }),
  } })
  const initial = await createEvent(deps, validBrief)
  const first = await finish(deps, initial.event.eventId)
  expect(first.researchResult!.recommendations.map(r => r.candidateId)).toEqual(['venue:sf', 'supply:plates20'])
  await updateBrief(deps, initial.event.eventId, 1, { location: 'Oakland, CA', headcount: 48, budget: 10000 })
  const current = await finish(deps, initial.event.eventId)
  expect(queries).toEqual([
    'birthday event venue San Francisco, CA', 'paper plates for a birthday with 20 people',
    'birthday event venue Oakland, CA', 'paper plates for a birthday with 48 people',
  ])
  expect(current.researchResult!.recommendations.map(r => r.candidateId)).toEqual(['venue:oakland', 'supply:plates48'])
  expect(vi.mocked(session.start).mock.lastCall![0].brief.budget).toBe(10000)
  expect(current.researchResult!.budgetFit).toBe('unknown')
  expect(current.plan).toBeNull()
})
