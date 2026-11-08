import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createStore } from '../server/db/store-impl'
import { schema } from '../server/db/schema'
import type { Store } from '../server/store'
import { CONTRACT_VERSION } from '../contracts'
import { createEvent, getEventView, cancel, updateBrief } from '../server/events/service'
import { makeDeps } from '../server/events/testFakes'
import { createResearchIntegration } from './integration'
import { discoveryFixture, researchBriefFixture } from './integration.test-fixtures'
import type { ResearchSession } from './session'

let directory: string
let database: PGlite
let store: Store
let deps: ReturnType<typeof makeDeps>['deps']
let session: ResearchSession
const discover = vi.fn(async () => structuredClone(discoveryFixture))

async function connect() {
  database = new PGlite(directory)
  const db = drizzle({ client: database, schema })
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../server/db/migrations', import.meta.url)) })
  store = createStore(db)
  deps = makeDeps({ store, research: createResearchIntegration({ store, providers: { discover, session } }), now: () => new Date() }).deps
}
async function restart() {
  // Close the database as well as replacing every application service and store instance.
  await database.close()
  await connect()
}
async function startRanking() {
  const started = await createEvent(deps, researchBriefFixture)
  for (let i = 0; i < 3; i++) await getEventView(deps, started.event.eventId)
  expect((await store.researchCheckpoints!.read(started.run!.runId))!.stage).toBe('ranking')
  return { eventId: started.event.eventId, runId: started.run!.runId }
}
async function finish(eventId: string) {
  for (let i = 0; i < 12; i++) {
    const view = await getEventView(deps, eventId)
    if (view.researchResult) return view
  }
  throw new Error('Recovery exceeded the test step bound')
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'research-recovery-'))
  discover.mockClear()
  session = {
    createAgent: vi.fn(async () => 'agent'), start: vi.fn(async () => 'session'),
    poll: vi.fn(async () => ({ id: 'session', status: 'completed', stop_reason: 'end_turn', last_seq: 7,
      structured_output: { candidateIds: discoveryFixture.candidates.map(c => c.candidateId) } })),
    correct: vi.fn(async () => 8), cancel: vi.fn(async () => {}), deleteAgent: vi.fn(async () => {}),
  }
  await connect()
})
afterEach(async () => { vi.restoreAllMocks(); await database.close(); await rm(directory, { recursive: true, force: true }) })

test('a disconnected session read resumes from disk after service replacement', async () => {
  const { eventId, runId } = await startRanking()
  vi.mocked(session.poll).mockRejectedValueOnce(new TypeError('connection reset'))
  await getEventView(deps, eventId)
  expect(await store.researchCheckpoints!.read(runId)).toMatchObject({ stage: 'ranking', lastSequence: 0 })
  await restart()
  const completed = await finish(eventId)
  expect(completed.researchResult!.recommendations).toHaveLength(discoveryFixture.candidates.length)
  expect(completed.run).toMatchObject({ naiveSessionId: 'session', lastSequence: 7 })
  expect(session.start).toHaveBeenCalledTimes(1)
  expect(discover).toHaveBeenCalledTimes(1)
})

test('an interrupted outcome write cannot advance the processed sequence or lose the ranking', async () => {
  const { eventId, runId } = await startRanking()
  const checkpoints = store.researchCheckpoints!
  const save = checkpoints.save.bind(checkpoints)
  let interrupted = false
  vi.spyOn(checkpoints, 'save').mockImplementation(async (run, version, checkpoint, message) => {
    if (checkpoint.stage === 'cleanup') {
      interrupted = true
      throw new Error('database disconnected before commit')
    }
    return save(run, version, checkpoint, message)
  })
  await getEventView(deps, eventId)
  expect(interrupted).toBe(true)
  expect(await checkpoints.read(runId)).toMatchObject({ stage: 'ranking', lastSequence: 0, result: null })
  await restart()
  const completed = await finish(eventId)
  expect(completed.run!.lastSequence).toBe(7)
  expect(completed.researchResult!.recommendations).toHaveLength(discoveryFixture.candidates.length)
  expect(completed.progress.filter(p => p.message === 'Research evidence validated; final costs remain unconfirmed.')).toHaveLength(1)
  expect(session.start).toHaveBeenCalledTimes(1)
})

test('uncertain creation retains its operation identity and cannot claim confirmed cleanup', async () => {
  const started = await createEvent(deps, researchBriefFixture)
  const { eventId } = started.event
  const { runId } = started.run!
  await getEventView(deps, eventId)
  await getEventView(deps, eventId)
  vi.mocked(session.start).mockRejectedValueOnce(new TypeError('response lost after remote creation'))
  await getEventView(deps, eventId)
  await restart()
  const completed = await finish(eventId)
  expect(completed.researchResult!.outcome).toBe('partial')
  expect(completed.researchResult!.warnings.join(' ')).toContain('uncertain outcome')
  expect(await store.researchCheckpoints!.read(runId)).toMatchObject({
    pendingOperation: { kind: 'session', idempotencyKey: `${runId}:research` },
    cleanup: { confirmed: false, unresolvedOperation: true },
  })
  expect(session.start).toHaveBeenCalledTimes(1)
  expect(session.poll).not.toHaveBeenCalled()
})

for (const committed of [false, true]) {
  test(`a lost session checkpoint acknowledgement recovers safely when commit is ${committed}`, async () => {
    const started = await createEvent(deps, researchBriefFixture)
    const { eventId } = started.event
    const { runId } = started.run!
    await getEventView(deps, eventId)
    await getEventView(deps, eventId)
    const checkpoints = store.researchCheckpoints!
    const save = checkpoints.save.bind(checkpoints)
    vi.spyOn(checkpoints, 'save').mockImplementation(async (run, version, checkpoint, message) => {
      if (checkpoint.stage !== 'ranking') return save(run, version, checkpoint, message)
      if (committed) await save(run, version, checkpoint, message)
      throw new Error('process lost database acknowledgement')
    })
    await getEventView(deps, eventId)
    expect(session.cancel).not.toHaveBeenCalled()
    await restart()
    const completed = await finish(eventId)
    expect(session.start).toHaveBeenCalledTimes(1)
    expect(session.createAgent).toHaveBeenCalledTimes(1)
    if (committed) {
      expect(completed.researchResult!.recommendations).toHaveLength(discoveryFixture.candidates.length)
      expect(completed.progress.filter(p => p.message === 'Comparing the retrieved candidates.')).toHaveLength(1)
    } else {
      expect(completed.researchResult!.recommendations).toEqual([])
      expect(completed.researchResult!.warnings.join(' ')).toContain('uncertain outcome')
      expect(await store.researchCheckpoints!.read(runId)).toMatchObject({ pendingOperation: { kind: 'session' } })
    }
  })
}

test('a committed result survives a lost acknowledgement without duplicate publication', async () => {
  const { eventId } = await startRanking()
  const checkpoints = store.researchCheckpoints!
  const save = checkpoints.save.bind(checkpoints)
  vi.spyOn(checkpoints, 'save').mockImplementation(async (run, version, checkpoint, message) => {
    const saved = await save(run, version, checkpoint, message)
    if (checkpoint.result) throw new Error('process interrupted after commit')
    return saved
  })
  await getEventView(deps, eventId)
  await restart()
  const completed = await finish(eventId)
  const again = await getEventView(deps, eventId)
  expect(again.researchResult).toEqual(completed.researchResult)
  expect(again.progress).toEqual(completed.progress)
  expect(session.poll).toHaveBeenCalledTimes(1)
  expect(completed.progress.filter(p => p.message === 'Research evidence validated; final costs remain unconfirmed.')).toHaveLength(1)
})

test('replayed and older snapshots after restart cannot duplicate progress or regress the cursor', async () => {
  const { eventId, runId } = await startRanking()
  vi.mocked(session.poll).mockResolvedValueOnce({ id: 'session', status: 'running', last_seq: 4 })
  await getEventView(deps, eventId)
  const before = await store.getEventView(eventId)
  await restart()
  for (const sequence of [4, 2, 4]) {
    vi.mocked(session.poll).mockResolvedValueOnce({ id: 'session', status: 'running', last_seq: sequence })
    expect((await getEventView(deps, eventId)).progress).toEqual(before!.progress)
    expect((await store.researchCheckpoints!.read(runId))!.lastSequence).toBe(4)
  }
  expect((await finish(eventId)).run!.lastSequence).toBe(7)
  expect(session.start).toHaveBeenCalledTimes(1)
})

test('read failures exhaust the same durable budget across replacements', async () => {
  const { eventId } = await startRanking()
  vi.mocked(session.poll).mockRejectedValue(new TypeError('connection reset'))
  for (let i = 0; i < 3; i++) {
    await getEventView(deps, eventId)
    await restart()
  }
  const completed = await finish(eventId)
  expect(completed.researchResult!.recommendations).toEqual([])
  expect(completed.researchResult!.warnings.join(' ')).toContain('retry limit')
  expect(completed.researchResult!.candidates).toEqual(discoveryFixture.candidates)
  expect(session.poll).toHaveBeenCalledTimes(3)
  expect(completed.progress.filter(p => p.message.includes('connection interrupted'))).toHaveLength(1)
})

for (const action of ['cancel', 'revise'] as const) {
  test(`${action} remains authoritative after restart and fences a stale worker`, async () => {
    const { eventId, runId } = await startRanking()
    const oldEvent = (await store.getEvent(eventId))!
    const oldRun = (await store.claimRunAdvance(runId, new Date(), 30000))!
    if (action === 'cancel') await cancel(deps, eventId)
    else await updateBrief(deps, eventId, 1, { location: 'New location' })
    await restart()
    await deps.research.advanceResearch({ event: oldEvent, run: oldRun })
    expect(session.poll).not.toHaveBeenCalled()
    expect(await store.getResearchResult(runId)).toBeNull()
    const view = await getEventView(deps, eventId)
    if (action === 'cancel') {
      expect(view.run!.state).toBe('canceled')
      expect(view.event.status).toBe('canceled')
      expect(session.start).toHaveBeenCalledTimes(1)
    } else {
      expect(view.event.briefRevision).toBe(2)
      expect(view.researchResult).toBeNull()
      const completed = await finish(eventId)
      expect(completed.researchResult!.briefRevision).toBe(2)
      expect(await store.getResearchResult(runId)).toBeNull()
    }
  })
}

test('delayed initialization cannot revive a superseded run after replacement', async () => {
  const started = await createEvent(deps, researchBriefFixture)
  const second = await store.updateBrief({ eventId: started.event.eventId, expectedBriefRevision: 1,
    brief: { ...researchBriefFixture, location: 'Second location' } })
  if (!second.ok) throw new Error('Expected revision two')
  await updateBrief(deps, started.event.eventId, 2, { location: 'Third location' })
  await restart()
  await deps.research.startResearch({ contractVersion: CONTRACT_VERSION, eventId: second.event.eventId,
    runId: second.run.runId, briefRevision: 2, brief: second.event.brief })
  expect(await store.researchCheckpoints!.read(second.run.runId)).toBeNull()
  const completed = await finish(started.event.eventId)
  expect(completed.researchResult!.briefRevision).toBe(3)
  expect(session.start).toHaveBeenCalledTimes(1)
})

for (const kind of ['agent', 'session', 'correction'] as const) {
  test(`interruption after recording ${kind} intent never repeats an uncertain write`, async () => {
    const started = await createEvent(deps, researchBriefFixture)
    const { eventId } = started.event
    await getEventView(deps, eventId)
    if (kind !== 'agent') await getEventView(deps, eventId)
    if (kind === 'correction') {
      await getEventView(deps, eventId)
      vi.mocked(session.poll).mockResolvedValueOnce({ id: 'session', status: 'idle', stop_reason: 'end_turn',
        last_seq: 7, structured_output: { candidateIds: ['invented'] } })
      await getEventView(deps, eventId)
    }
    const checkpoints = store.researchCheckpoints!
    const save = checkpoints.save.bind(checkpoints)
    vi.spyOn(checkpoints, 'save').mockImplementation(async (run, version, checkpoint, message) => {
      const saved = await save(run, version, checkpoint, message)
      if (checkpoint.stage === 'uncertain') throw new Error('process interrupted before dispatch')
      return saved
    })
    await getEventView(deps, eventId)
    await restart()
    const completed = await finish(eventId)
    expect(completed.researchResult!.warnings.join(' ')).toContain('uncertain outcome')
    expect(session.createAgent).toHaveBeenCalledTimes(kind === 'agent' ? 0 : 1)
    expect(session.start).toHaveBeenCalledTimes(kind === 'correction' ? 1 : 0)
    expect(session.correct).not.toHaveBeenCalled()
  })
}
