import { cleanupResearchResources } from './cleanup'
import { CONTRACT_VERSION, ResearchInput, canSendCorrection } from '../contracts'
import type { ResearchPort } from '../server/events/deps'
import type { Store } from '../server/store'
import type { ResearchCheckpoint } from '../server/research-checkpoint'
import { researchEvent, rankingCandidates, type Discovery, type ResearchProviders } from './research'
import { RESEARCH_BUDGET_MICRO_USD, researchOperationKey, type ResearchSession } from './session'

export type IntegrationProviders = {
  discover: ResearchProviders['discover']
  enrich?: ResearchProviders['enrich']
  session: ResearchSession
}

class LostLease extends Error {}
class CheckpointWriteFailed extends Error {}

// Longer than previous-run cleanup plus checkpoint initialization during a brief revision.
const MISSING_CHECKPOINT_GRACE_MS = 60_000

export function createResearchIntegration(options: {
  store: Pick<Store, 'researchCheckpoints' | 'appendProgress'>
  providers: IntegrationProviders
  stepTimeoutMs?: number
  runTimeoutMs?: number
}): ResearchPort {
  const checkpoints = options.store.researchCheckpoints
  if (!checkpoints) throw new Error('Durable research checkpoint storage is required')
  const stepMs = options.stepTimeoutMs ?? 10_000
  const runMs = options.runTimeoutMs ?? 120_000
  if (!Number.isSafeInteger(stepMs) || stepMs <= 0 || stepMs > 10_000 ||
      !Number.isSafeInteger(runMs) || runMs <= 0) throw new Error('Invalid research bounds')
  const session = options.providers.session
  const running = { status: 'running' as const }
  const evidenceOf = (c: ResearchCheckpoint): Discovery => ({
    candidates: c.evidence?.candidates ?? [], sourceChecks: c.evidence?.sourceChecks ?? [],
    warnings: c.evidence?.warnings ?? [],
  })
  const validate = async (c: ResearchCheckpoint, recommend: ResearchProviders['recommend'], discover = async () => evidenceOf(c)) =>
    {
      const result = await researchEvent(c.input, { discover, recommend }, { timeoutMs: stepMs })
      return { ...result, warnings: [...new Set(result.warnings)] }
    }
  const supportedOrder: ResearchProviders['recommend'] = async (_input, candidates) => ({ candidateIds: candidates.map(c => c.candidateId) })

  return {
    async startResearch(input) {
      // Validation belongs to researchEvent, including its awaiting_input outcome.
      ResearchInput.omit({ brief: true }).parse(input)
      await checkpoints.initialize({
        version: 0, input, stage: 'discovery', evidence: null, result: null,
        agentId: null, naiveSessionId: null, lastSequence: 0, correctionsUsed: 0,
        correctionAfter: null, expiresAt: new Date(Date.now() + runMs).toISOString(),
      })
      return { naiveSessionId: null }
    },
    async advanceResearch({ event, run }) {
      let c = await checkpoints.read(run.runId)
      if (!c) {
        // A revised brief commits its run before the previous run's cleanup finishes and
        // before startResearch writes the checkpoint, so a young run is still starting.
        if (Date.now() - Date.parse(run.createdAt) < MISSING_CHECKPOINT_GRACE_MS) return running
        const result = await researchEvent({ contractVersion: CONTRACT_VERSION, eventId: run.eventId,
          runId: run.runId, briefRevision: run.briefRevision, brief: event.brief }, {
          discover: async () => ({ candidates: [], sourceChecks: [] }), recommend: async () => null,
        }, { timeoutMs: stepMs })
        return { status: 'done', lastSequence: run.lastSequence,
          result: { ...result, outcome: 'failed', warnings: [
            'This older run has no research checkpoint and cannot resume. Submit a revised brief to restart.',
            ...(run.naiveSessionId && !run.naiveSessionId.startsWith('sim_session_')
              ? ['An earlier hosted session may need provider reconciliation.'] : []),
          ] } }
      }
      const leaseMs = new Date(run.advancingUntil ?? 0).getTime() - Date.now() - 100
      if (leaseMs <= 0) return running
      const stepDeadline = Date.now() + Math.min(stepMs, leaseMs)
      const signal = AbortSignal.timeout(Math.min(stepMs, leaseMs))
      const save = async (patch: Partial<ResearchCheckpoint>, message?: string) => {
        const next = { ...c!, ...patch }
        let saved: boolean
        try { saved = await checkpoints.save(run, c!.version, next, message) }
        catch { throw new CheckpointWriteFailed('Research checkpoint write could not be confirmed') }
        if (!saved) throw new LostLease()
        c = { ...next, version: c!.version + 1 }
      }
      const finish = async (warning: string, processed: Partial<ResearchCheckpoint> = {}) => {
        // Finalization preserves saved evidence without pretending another provider call failed.
        const result = c!.evidence ?? await validate(c!, supportedOrder)
        await save({ ...processed, result: { ...result, recommendations: [], warnings: [...result.warnings, warning] }, stage: 'cleanup' }, warning)
      }
      const pendingOperation = (kind: 'agent' | 'session' | 'correction') => ({
        kind, idempotencyKey: researchOperationKey(run.runId, kind), startedAt: new Date().toISOString(),
      })
      // Provider calls are awaited, bounded and never detached from the request.
      const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
        signal.throwIfAborted()
        let abort: () => void = () => {}
        const stopped = new Promise<never>((_, reject) => {
          abort = () => reject(new Error('Research step timed out'))
          signal.addEventListener('abort', abort, { once: true })
        })
        try { return await Promise.race([operation(), stopped]) }
        finally { signal.removeEventListener('abort', abort) }
      }
      const discard = async (sessionId: string | null, agentId: string | null) => {
        const cleanup = await cleanupResearchResources({ runId: run.runId, sessionId, agentId,
          timeoutMs: 3000, checkpoints, session })
        if (!cleanup.confirmed) await options.store.appendProgress(run.eventId, 'system',
          'An earlier research operation needs provider cleanup. No supplier transaction was canceled.')
      }
      try {
        // This no-op save verifies the current lease and cancellation before any provider call.
        await save({})
        if (!['done', 'cleanup', 'delete_agent', 'uncertain'].includes(c.stage) && Date.now() >= Date.parse(c.expiresAt)) {
          await finish('Research reached its time limit; retry with a revised brief.')
          return running
        }
        switch (c.stage) {
          case 'discovery': {
            const result = await bounded(() => researchEvent(c!.input, {
              discover: options.providers.discover, recommend: supportedOrder,
            }, { timeoutMs: stepMs, signal }))
            const terminal = result.outcome === 'awaiting_input' || !result.candidates.length
            await save({ evidence: result, result: terminal ? result : null,
              stage: terminal ? 'done' : options.providers.enrich ? 'investigating' : 'agent',
            }, terminal ? 'Research needs attention; see the outcome details.' : 'Discovery evidence saved; supplier details remain unverified.')
            return running
          }
          case 'investigating': {
            const evidence = evidenceOf(c)
            const investigated = c.investigatedCandidateIds ?? []
            // Alternate venues and supplies, and save each attempt before the next poll.
            const venues = evidence.candidates.filter(candidate => candidate.kind === 'venue')
            const supplies = evidence.candidates.filter(candidate => candidate.kind === 'supply')
            const ordered = Array.from({ length: Math.max(venues.length, supplies.length) },
              (_, i) => [venues[i], supplies[i]]).flat().filter(candidate => !!candidate)
            const candidate = ordered.find(candidate => !investigated.includes(candidate.candidateId))
            if (!candidate) {
              await save({ stage: 'agent' })
              return running
            }
            const remaining = stepDeadline - Date.now()
            if (remaining < 4) throw new Error('Investigation request deadline reached')
            const reserve = Math.max(1, Math.floor(remaining / 10))
            const detail = await bounded(() => researchEvent(c!.input, {
              discover: async () => ({ candidates: [candidate], sourceChecks: [], warnings: [] }),
              enrich: options.providers.enrich, recommend: supportedOrder,
            }, { timeoutMs: remaining - reserve, detailTimeoutMs: remaining - reserve,
              rankingReserveMs: reserve, signal }))
            const combined = {
              candidates: evidence.candidates.map(saved => saved.candidateId === candidate.candidateId
                ? detail.candidates.find(updated => updated.candidateId === saved.candidateId) ?? saved : saved),
              sourceChecks: [...evidence.sourceChecks, ...detail.sourceChecks],
              warnings: [...new Set([...(evidence.warnings ?? []), ...detail.warnings])],
            }
            const result = await validate(c, supportedOrder, async () => combined)
            const completed = [...investigated, candidate.candidateId]
            await save({ evidence: result, investigatedCandidateIds: completed,
              stage: completed.length >= ordered.length ? 'agent' : 'investigating',
            }, `Supplier details checked for ${completed.length} of ${ordered.length} options.`)
            return running
          }
          case 'agent': {
            await save({ stage: 'uncertain', pendingOperation: pendingOperation('agent') })
            const agentId = await bounded(() => session.createAgent(c!.input, signal))
            try { await save({ agentId, stage: 'session', pendingOperation: null }) }
            catch (error) { if (error instanceof LostLease) await discard(null, agentId); throw error }
            return running
          }
          case 'session': {
            await save({ stage: 'uncertain', pendingOperation: pendingOperation('session') })
            const sessionId = await bounded(() => session.start(c!.input, rankingCandidates(c!.evidence!.candidates), c!.agentId!, signal))
            try { await save({ naiveSessionId: sessionId, stage: 'ranking', pendingOperation: null }, 'Comparing the retrieved candidates.') }
            catch (error) { if (error instanceof LostLease) await discard(sessionId, c.agentId); throw error }
            return running
          }
          case 'ranking': {
            const disconnected = 'Research could not reconnect within its retry limit. Saved evidence is retained; revise the brief to retry.'
            if ((c.readFailures ?? 0) >= 3) {
              await finish(disconnected)
              return running
            }
            let snapshot: Awaited<ReturnType<ResearchSession['poll']>>
            try { snapshot = await bounded(() => session.poll(c!.naiveSessionId!, signal)) }
            catch {
              const readFailures = (c.readFailures ?? 0) + 1
              await save({ readFailures }, readFailures === 1
                ? 'Research connection interrupted; saved work will resume on the next poll.' : undefined)
              if (readFailures >= 3) await finish(disconnected)
              return running
            }
            if (snapshot.id !== c.naiveSessionId) throw new Error('Session identity mismatch')
            if (snapshot.last_seq < c.lastSequence) return running
            const advanced = snapshot.last_seq > c.lastSequence
            // The cursor commits with the outcome, so a crash cannot acknowledge unprocessed work.
            const processed = { lastSequence: snapshot.last_seq,
              sessionStopped: ['completed', 'failed', 'cancelled'].includes(snapshot.status) }
            if ((snapshot.consumed_micro_usd ?? 0) > RESEARCH_BUDGET_MICRO_USD) {
              await finish('Research reached its usage limit; only retrieved evidence is shown.', processed)
              return running
            }
            if (['running', 'queued'].includes(snapshot.status)) {
              await save(processed, advanced ? 'Research comparison progress saved.' : undefined)
              return running
            }
            if (snapshot.status === 'cancelled') {
              const result = await validate(c, async () => null)
              await save({ ...processed, result: { ...result, outcome: 'canceled', recommendations: [],
                warnings: [...result.warnings, 'Research stopped. No supplier booking or purchase was canceled.'] }, stage: 'cleanup' })
              return running
            }
            if (!['idle', 'completed'].includes(snapshot.status) || snapshot.stop_reason !== 'end_turn') {
              await finish('The research provider stopped without a valid completion; retry with a revised brief.', processed)
              return running
            }
            if (c.correctionAfter !== null && snapshot.last_seq <= c.correctionAfter) return running
            let invalid = false
            const result = await validate(c, async (_input, _candidates, _signal, correction) => {
              if (correction) invalid = true
              return snapshot.structured_output
            })
            if (invalid && canSendCorrection({ ...run, correctionsUsed: c.correctionsUsed })) {
              await save({ ...processed, stage: 'correcting' })
            } else {
              await save({ ...processed, result, stage: 'cleanup' }, 'Research evidence validated; final costs remain unconfirmed.')
            }
            return running
          }
          case 'correcting': {
            // Dispatch can resume execution before its response or checkpoint acknowledgement arrives.
            await save({ stage: 'uncertain', pendingOperation: pendingOperation('correction'),
              sessionStopped: false, correctionsUsed: 1 })
            const accepted = await bounded(() => session.correct(c!.naiveSessionId!, c!.input.runId, signal))
            await save({ correctionAfter: Math.max(accepted, c.lastSequence), stage: 'ranking', pendingOperation: null,
              sessionStopped: false }, 'Checking the recommendation format once more.')
            return running
          }
          case 'uncertain':
            await finish('A research operation has an uncertain outcome. It was not retried; provider reconciliation is needed.')
            return running
          case 'cleanup': {
            await cleanupResearchResources({ runId: run.runId, sessionId: c.naiveSessionId,
              agentId: c.agentId, sessionStopped: c.sessionStopped, sessionOnly: true,
              timeoutMs: Math.min(stepMs, leaseMs), checkpoints, session })
            await save({ stage: 'delete_agent' })
            return running
          }
          case 'delete_agent': {
            const cleanup = await cleanupResearchResources({ runId: run.runId, sessionId: c.naiveSessionId,
              agentId: c.agentId, sessionStopped: c.sessionStopped,
              timeoutMs: Math.min(stepMs, leaseMs), checkpoints, session })
            const warning = cleanup.confirmed ? undefined : 'Research cleanup could not be confirmed; reconciliation is needed.'
            await save({ stage: 'done', result: warning ? { ...c.result!, warnings: [...new Set([...c.result!.warnings, warning])] } : c.result })
            return running
          }
          case 'done':
            return { status: 'done', result: c.result!, lastSequence: c.lastSequence }
        }
      } catch (error) {
        if (error instanceof LostLease) return running
        // A lost acknowledgement may hide a committed write. Re-read it on the next request.
        if (error instanceof CheckpointWriteFailed) throw error
        try { await finish(c.stage === 'uncertain'
          ? 'A provider operation has an uncertain outcome. It was not retried; reconciliation is needed.'
          : 'A research step failed. Saved evidence is retained; retry with a revised brief.') }
        catch (saveError) { if (!(saveError instanceof LostLease)) throw saveError }
        return running
      }
    },
    async cancelResearch(run) {
      // Run identity exists before either provider resource, including on a replaced brief.
      const checkpoint = await checkpoints.read(run.runId)
      if (!checkpoint) {
        if (run.naiveSessionId && !run.naiveSessionId.startsWith('sim_session_')) {
          await session.cancel(run.naiveSessionId, AbortSignal.timeout(stepMs))
          await options.store.appendProgress(run.eventId, 'system',
            'The older research session stopped. Its missing checkpoint may require definition cleanup.')
        }
        return
      }
      const cleanup = await cleanupResearchResources({ runId: run.runId,
        sessionId: checkpoint.naiveSessionId, agentId: checkpoint.agentId,
        sessionStopped: checkpoint.sessionStopped, timeoutMs: stepMs, checkpoints, session })
      if (!cleanup.confirmed) throw new Error('Research cleanup could not be confirmed')
    },
  }
}
