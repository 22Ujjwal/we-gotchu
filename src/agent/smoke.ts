import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { CONTRACT_VERSION, ResearchResult } from '../contracts'
import { researchEvent } from './research'
import { createNaiveRanker } from './naive'
import { createDiscovery } from '../suppliers/discovery'
import { createDetailEnricher } from '../suppliers/details'

if (process.env.RESEARCH_LIVE_SMOKE !== '1') throw new Error('Set RESEARCH_LIVE_SMOKE=1 to enable paid read-only research')
const apiKey = process.env.NAIVE_API_KEY
const monidKey = process.env.MONID_API_KEY
if (!apiKey || !monidKey || !process.env.NAIVE_RESEARCH_AGENT_ID) throw new Error('NAIVE_API_KEY, MONID_API_KEY and NAIVE_RESEARCH_AGENT_ID are required')
const runId = `smoke-${randomUUID()}`
const checkpointPath = process.env.RESEARCH_CHECKPOINT_PATH
if (!checkpointPath) throw new Error('RESEARCH_CHECKPOINT_PATH is required for recovery evidence')
const ranker = createNaiveRanker({
  apiKey, agentId: process.env.NAIVE_RESEARCH_AGENT_ID,
  checkpoint: async checkpoint => writeFile(checkpointPath, JSON.stringify({ runId, ...checkpoint }, null, 2), { mode: 0o600 }),
})
let result: ResearchResult | undefined
let cleanup: string[] = []
try {
  const startsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  result = await researchEvent({
    contractVersion: CONTRACT_VERSION, eventId: `event-${runId}`, briefRevision: 1, runId,
    brief: { eventType: 'birthday', location: 'San Francisco, CA', startsAt, timezone: 'America/Los_Angeles',
      headcount: 20, budget: 50000, currency: 'usd', supplyNeeds: ['paper plates'], maximumCancellationLoss: 1000 },
  }, {
    discover: createDiscovery({ apiKey: monidKey, limitPerSource: 3 }),
    enrich: createDetailEnricher({ apiKey: monidKey, maxPagesPerVenue: 2 }),
    recommend: ranker.recommend,
  }, {
    timeoutMs: 120_000,
    onProgress: stage => console.log(JSON.stringify({ stage })),
  })
  ResearchResult.parse(result)
} finally {
  cleanup = await ranker.dispose()
  console.log(JSON.stringify({ runId, checkpoint: ranker.checkpoint(), cleanup }))
}
if (process.env.RESEARCH_RESULT_PATH && result) await writeFile(process.env.RESEARCH_RESULT_PATH, JSON.stringify(result, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ outcome: result?.outcome, candidates: result?.candidates.length,
  kinds: result?.candidates.map(c => c.kind), recommendations: result?.recommendations.length,
  budgetFit: result?.budgetFit, sourceChecks: result?.sourceChecks, warnings: result?.warnings }))
const detailedKinds = new Set(result?.candidates.filter(c => c.sources.some(s => s.stage === 'detail')).map(c => c.kind))
const listingEvidence = result?.candidates.some(c => c.kind === 'supply' && c.priceProvenance === 'supplier_listing' && c.verification.listingPrice?.status === 'known' && !!c.verification.listingPrice.sourceUrl)
if (cleanup.length || !detailedKinds.has('venue') || !detailedKinds.has('supply') || !listingEvidence ||
    result?.budgetFit !== 'unknown' || result.candidates.some(c => c.cancellationTerms.known || c.verification.availability?.status !== 'unknown') || !result?.candidates.some(c => c.kind === 'venue') || !result.candidates.some(c => c.kind === 'supply') || !result.recommendations.length) {
  process.exitCode = 1
}
