import { ResearchInput } from '../contracts'
import type { ResearchPort } from '../server/events/deps'
import type { Store } from '../server/store'
import type { ResearchCheckpoint } from './checkpoint'
import { researchEvent, type Discovery, type ResearchProviders } from './research'
import type { ResearchSession } from './session'

export type IntegrationProviders = {
  discover: ResearchProviders['discover']
  enrich?: (input: ResearchInput, evidence: Discovery, signal: AbortSignal) => Promise<Discovery>
  session: ResearchSession
}

class LostLease extends Error {}

export function createResearchIntegration(options: {
  store: Store
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
  const validate = (c: ResearchCheckpoint, recommend: ResearchProviders['recommend'], discover = async () => evidenceOf(c)) =>
    researchEvent(c.input, { discover, recommend }, { timeoutMs: stepMs })
  const supportedOrder: ResearchProviders['recommend'] = async (_input, candidates) => ({ candidateIds: candidates.map(c => c.candidateId) })

  return {
    async startResearch(input) {
      // Validation belongs to researchEvent, including its awaiting_input outcome.
      ResearchInput.omit({ brief: true }).parse(input)
      await checkpoints.initialize({
        version: 0, input, stage: 'discovery', evidence: null, result: null,
        agentId: null, sessionId: null, lastSequence: 0, correctionsUsed: 0,
        correctionAfter: null, expiresAt: new Date(Date.now() + runMs).toISOString(),
      })
      return { naiveSessionId: null }
    },
    async advanceResearch({ run }) {
      let c = await checkpoints.read(run.runId)
      if (!c) throw new Error('Research checkpoint is missing')
      const leaseMs = new Date(run.advancingUntil ?? 0).getTime() - Date.now() - 100
      if (leaseMs <= 0) return running
      const signal = AbortSignal.timeout(Math.min(stepMs, leaseMs))
      const save = async (patch: Partial<ResearchCheckpoint>, message?: string) => {
        const next = { ...c!, ...patch }
        if (!await checkpoints.save(run, c!.version, next, message)) throw new LostLease()
        c = { ...next, version: c!.version + 1 }
      }
      const finish = async (warning: string) => {
        const result = await validate(c!, async () => { throw new Error('No usable ranking') })
        await save({ result: { ...result, warnings: [...result.warnings, warning] }, stage: 'cleanup' }, warning)
      }
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
        const cleanupSignal = AbortSignal.timeout(3000)
        if (sessionId) await session.cancel(sessionId, cleanupSignal).catch(() => undefined)
        if (agentId) await session.deleteAgent(agentId, cleanupSignal).catch(() => undefined)
      }
      try {
        // This no-op save verifies the current lease and cancellation before any provider call.
        await save({})
        if (!['done', 'cleanup', 'delete_agent'].includes(c.stage) && Date.now() >= Date.parse(c.expiresAt)) {
          await finish('Research reached its time limit; retry with a revised brief.')
          return running
        }
        switch (c.stage) {
          case 'discovery': {
            await save({ stage: 'uncertain' }, 'Looking for supplier evidence.')
            const result = await bounded(() => researchEvent(c!.input, {
              discover: options.providers.discover, recommend: supportedOrder,
            }, { timeoutMs: stepMs, signal }))
            const terminal = result.outcome === 'awaiting_input' || !result.candidates.length
            await save({ evidence: result, result: terminal ? result : null,
              stage: terminal ? 'done' : options.providers.enrich ? 'enrichment' : 'agent',
            }, terminal ? 'Research needs attention; see the outcome details.' : 'Discovery evidence saved; supplier details remain unverified.')
            return running
          }
          case 'enrichment': {
            await save({ stage: 'uncertain' }, 'Investigating supplier details.')
            const enriched = await bounded(() => options.providers.enrich!(c!.input, evidenceOf(c!), signal))
            const result = await validate(c, supportedOrder, async () => enriched)
            await save({ evidence: result, stage: result.candidates.length ? 'agent' : 'done',
              result: result.candidates.length ? null : result }, 'Supplier investigation evidence saved.')
            return running
          }
          case 'agent': {
            await save({ stage: 'uncertain' })
            const agentId = await bounded(() => session.createAgent(c!.input, signal))
            try { await save({ agentId, stage: 'session' }) }
            catch (error) { await discard(null, agentId); throw error }
            return running
          }
          case 'session': {
            await save({ stage: 'uncertain' })
            const sessionId = await bounded(() => session.start(c!.input, c!.evidence!.candidates, c!.agentId!, signal))
            try { await save({ sessionId, stage: 'ranking' }, 'Comparing the retrieved candidates.') }
            catch (error) { await discard(sessionId, c.agentId); throw error }
            return running
          }
          case 'ranking': {
            const snapshot = await bounded(() => session.poll(c!.sessionId!, signal))
            if (snapshot.id !== c.sessionId) throw new Error('Session identity mismatch')
            if (snapshot.last_seq < c.lastSequence) return running
            const advanced = snapshot.last_seq > c.lastSequence
            await save({ lastSequence: snapshot.last_seq }, advanced ? 'Research comparison progress saved.' : undefined)
            if ((snapshot.consumed_micro_usd ?? 0) > 500_000) {
              await finish('Research reached its usage limit; only retrieved evidence is shown.')
              return running
            }
            if (['running', 'queued'].includes(snapshot.status)) return running
            if (snapshot.status === 'cancelled') {
              const result = await validate(c, async () => null)
              await save({ result: { ...result, outcome: 'canceled', recommendations: [],
                warnings: [...result.warnings, 'Research stopped. No supplier booking or purchase was canceled.'] }, stage: 'cleanup' })
              return running
            }
            if (!['idle', 'completed'].includes(snapshot.status) || snapshot.stop_reason !== 'end_turn') {
              await finish('The research provider stopped without a valid completion; retry with a revised brief.')
              return running
            }
            if (c.correctionAfter !== null && snapshot.last_seq <= c.correctionAfter) return running
            let invalid = false
            const result = await validate(c, async (_input, _candidates, _signal, correction) => {
              if (correction) invalid = true
              return snapshot.structured_output
            })
            if (invalid && c.correctionsUsed === 0) {
              await save({ stage: 'correcting' })
            } else {
              await save({ result, stage: 'cleanup' }, 'Research evidence validated; final costs remain unconfirmed.')
            }
            return running
          }
          case 'correcting': {
            await save({ stage: 'uncertain', correctionsUsed: 1 })
            const accepted = await bounded(() => session.correct(c!.sessionId!, c!.input.runId, signal))
            await save({ correctionAfter: Math.max(accepted, c.lastSequence), stage: 'ranking' }, 'Checking the recommendation format once more.')
            return running
          }
          case 'uncertain':
            await finish('A research operation has an uncertain outcome. It was not retried; provider reconciliation is needed.')
            return running
          case 'cleanup': {
            let warning: string | undefined
            if (c.sessionId) {
              try { await bounded(() => session.cancel(c!.sessionId!, signal)) }
              catch { warning = 'Research session cleanup could not be confirmed; reconciliation is needed.' }
            }
            await save({ stage: 'delete_agent', result: warning ? { ...c.result!, warnings: [...c.result!.warnings, warning] } : c.result })
            return running
          }
          case 'delete_agent': {
            let warning: string | undefined
            if (c.agentId) {
              try { await bounded(() => session.deleteAgent(c!.agentId!, signal)) }
              catch { warning = 'Research definition cleanup could not be confirmed; reconciliation is needed.' }
            }
            await save({ stage: 'done', result: warning ? { ...c.result!, warnings: [...c.result!.warnings, warning] } : c.result })
            return running
          }
          case 'done':
            return { status: 'done', result: c.result!, lastSequence: c.lastSequence }
        }
      } catch (error) {
        if (error instanceof LostLease) return running
        try { await finish('A research step failed. Saved evidence is retained; retry with a revised brief.') }
        catch (saveError) { if (!(saveError instanceof LostLease)) throw saveError }
        return running
      }
    },
    async cancelResearch(sessionId) {
      // This only stops hosted research. Supplier transactions are outside this port.
      await session.cancel(sessionId, AbortSignal.timeout(stepMs))
    },
  }
}
