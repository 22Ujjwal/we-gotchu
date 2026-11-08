import type { Candidate, ResearchInput, Run } from '../contracts'
import { pause } from './http'
import { createResearchSession, RESEARCH_BUDGET_MICRO_USD } from './session'

export type RuntimeCheckpoint = Pick<Run, 'naiveSessionId' | 'lastSequence' | 'correctionsUsed'> & { agentId: string | null }

// Standalone execution waits here; application polling uses the same single-request client directly.
export function createNaiveRanker(options: {
  apiKey: string
  model: string
  fetch?: typeof fetch
  checkpoint?: (state: RuntimeCheckpoint) => void | Promise<void>
}) {
  const client = createResearchSession(options)
  const state: RuntimeCheckpoint = { agentId: null, naiveSessionId: null, lastSequence: 0, correctionsUsed: 0 }
  let runId: string | undefined
  let sessionStopped = false
  let agentDeleted = false
  const save = () => options.checkpoint?.({ ...state })
  const recommend = async (input: ResearchInput, candidates: Candidate[], signal: AbortSignal, correction: boolean): Promise<unknown> => {
    if (runId && runId !== input.runId) throw new Error('A runtime instance cannot be shared between runs')
    runId = input.runId
    if (!state.agentId) {
      state.agentId = await client.createAgent(input, signal)
      await save()
    }
    let minimumSequence = state.lastSequence
    if (!state.naiveSessionId) {
      state.naiveSessionId = await client.start(input, candidates, state.agentId, signal)
      await save()
    } else if (correction) {
      if (state.correctionsUsed >= 1) throw new Error('Correction limit reached')
      state.correctionsUsed = 1
      await save()
      const accepted = await client.correct(state.naiveSessionId, input.runId, signal)
      // A snapshot at the acceptance sequence still contains the previous turn's output.
      minimumSequence = Math.max(state.lastSequence, accepted)
    }
    for (let poll = 0; poll < 90; poll++) {
      const session = await client.poll(state.naiveSessionId, signal)
      state.lastSequence = Math.max(state.lastSequence, session.last_seq)
      await save()
      sessionStopped = ['completed', 'failed', 'cancelled'].includes(session.status)
      if ((session.consumed_micro_usd ?? 0) > RESEARCH_BUDGET_MICRO_USD) throw new Error('Naive usage bound exceeded')
      if (['cancelled', 'failed'].includes(session.status)) throw new Error('Naive session stopped without a result')
      if (['idle', 'completed'].includes(session.status) && (!correction || state.lastSequence > minimumSequence)) {
        if (!session.stop_reason || !['end_turn', 'error'].includes(session.stop_reason)) throw new Error('Naive session requires intervention')
        return session.stop_reason === 'error' ? null : session.structured_output
      }
      await pause(signal)
    }
    throw new Error('Naive polling bound exceeded')
  }
  const dispose = async () => {
    const failures: string[] = []
    if (state.naiveSessionId && !sessionStopped) {
      try { await client.cancel(state.naiveSessionId, AbortSignal.timeout(7500)); sessionStopped = true }
      catch { failures.push('Session cleanup could not be verified.') }
    }
    if (state.agentId && !agentDeleted) {
      try { await client.deleteAgent(state.agentId, AbortSignal.timeout(7500)); agentDeleted = true }
      catch { failures.push('Evaluation definition cleanup could not be verified.') }
    }
    return failures
  }
  return { recommend, dispose, checkpoint: () => ({ ...state }) }
}
