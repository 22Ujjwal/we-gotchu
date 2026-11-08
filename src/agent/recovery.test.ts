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
import { createEvent, getEventView } from '../server/events/service'
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
