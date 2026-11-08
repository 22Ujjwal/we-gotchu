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
