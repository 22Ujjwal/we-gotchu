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
