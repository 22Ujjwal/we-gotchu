import { expect, test } from 'vitest'
import { CONTRACT_VERSION } from '../contracts'
import { MemoryStore } from '../server/events/testFakes'
import { createConfiguredResearch } from './configured'
import { researchBriefFixture } from './integration.fixtures'

test('missing configuration never falls back to simulated research', async () => {
  const port = createConfiguredResearch(new MemoryStore(), {})
  await expect(async () => port.startResearch({ contractVersion: CONTRACT_VERSION, eventId: 'event', runId: 'run',
    briefRevision: 1, brief: researchBriefFixture })).rejects.toThrow('Real research requires')
})

test('invalid research configuration fails before creating an event or an uncertain run', async () => {
  const { makeDeps } = await import('../server/events/testFakes')
  const { createEvent } = await import('../server/events/service')
  for (const env of [{}, { RESEARCH_MODE: 'typo', NAIVE_API_KEY: 'key', MONID_API_KEY: 'key', NAIVE_MODEL: 'model' }]) {
    const store = new MemoryStore()
    const { deps } = makeDeps({ store, research: createConfiguredResearch(store, env) })
    await expect(createEvent(deps, researchBriefFixture)).rejects.toMatchObject({ status: 503, errorCode: 'research_not_configured' })
    expect(store.events.size).toBe(0)
    expect(store.runs.size).toBe(0)
  }
})
