import { beforeAll, expect, test } from 'vitest'
import { CONTRACT_VERSION, planReadyEvent } from '../contracts'
import { createTestStore } from '../server/db/client'
import type { Store } from '../server/store'
import type { ResearchCheckpoint } from './checkpoint'

let store: Store
beforeAll(async () => { store = await createTestStore() })
async function setup() {
  const { event, run } = await store.createEvent({ customerId: 'customer', brief: planReadyEvent.event.brief })
  const checkpoint: ResearchCheckpoint = {
    version: 0, input: { contractVersion: CONTRACT_VERSION, eventId: event.eventId, runId: run.runId, briefRevision: 1, brief: event.brief },
    stage: 'discovery', evidence: null, result: null, agentId: null, sessionId: null,
    lastSequence: 0, correctionsUsed: 0, correctionAfter: null, expiresAt: new Date(Date.now() + 120000).toISOString(),
  }
  await store.researchCheckpoints!.initialize(checkpoint)
  const claimed = (await store.claimRunAdvance(run.runId, new Date(), 30000))!
  return { event, run: claimed, checkpoint }
}

test('checkpoint and ordered progress commit once and survive a new read', async () => {
  const { event, run, checkpoint } = await setup()
  const changed = { ...checkpoint, lastSequence: 7, sessionId: 'session' }
  expect(await store.researchCheckpoints!.save(run, 0, changed, 'Research is running.')).toBe(true)
  expect(await store.researchCheckpoints!.save(run, 0, changed, 'Duplicate.')).toBe(false)
  expect(await store.researchCheckpoints!.read(run.runId)).toMatchObject({ version: 1, lastSequence: 7, sessionId: 'session' })
  expect((await store.getEventView(event.eventId))!.progress.map(p => p.message)).toEqual(['Research is running.'])
  expect(await store.getRun(run.runId)).toMatchObject({ naiveSessionId: 'session', lastSequence: 7 })
})

test('cancellation and a new brief fence unfinished checkpoint writes', async () => {
  for (const action of ['cancel', 'revise']) {
    const { event, run, checkpoint } = await setup()
    if (action === 'cancel') await store.requestCancel(event.eventId, new Date())
    else await store.updateBrief({ eventId: event.eventId, expectedBriefRevision: 1, brief: event.brief })
    expect(await store.researchCheckpoints!.save(run, 0, checkpoint, 'Late progress.')).toBe(false)
    expect((await store.getEventView(event.eventId))!.progress).toEqual([])
  }
})

test('an older lease cannot save state or clear the newer lease', async () => {
  const { run, checkpoint } = await setup()
  const newer = (await store.claimRunAdvance(run.runId, new Date(Date.now() + 31000), 30000))!
  expect(await store.researchCheckpoints!.save(run, 0, checkpoint)).toBe(false)
  await store.releaseRunAdvance(run.runId, 99, run.advancingUntil)
  expect(await store.getRun(run.runId)).toMatchObject({ advancingUntil: newer.advancingUntil, lastSequence: 0 })
})

test('result publication rejects an older lease and a canceled event', async () => {
  for (const action of ['lease', 'cancel']) {
    const { event, run } = await setup()
    if (action === 'lease') await store.claimRunAdvance(run.runId, new Date(Date.now() + 31000), 30000)
    else await store.requestCancel(event.eventId, new Date())
    const result = { contractVersion: CONTRACT_VERSION, eventId: event.eventId, runId: run.runId,
      briefRevision: 1, outcome: 'partial' as const, candidates: [], sourceChecks: [], missing: [],
      recommendations: [], budgetFit: 'unknown' as const, budgetBasis: 'Unknown costs.', currency: 'USD',
      warnings: [], superseded: false, createdAt: new Date().toISOString() }
    expect(await store.publishResearchResult(result, run.advancingUntil)).toMatchObject({ ok: false })
    expect(await store.getResearchResult(run.runId)).toBeNull()
  }
})
