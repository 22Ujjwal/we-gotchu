import { ApiError, createClient } from '@usenaive-sdk/managed-agents'
import { z } from 'zod'
import type { Candidate, ResearchInput } from '../contracts'
import { Ranking } from './research'

export const RESEARCH_BUDGET_MICRO_USD = 500_000

export function researchOperationKey(runId: string, kind: 'session' | 'correction'): string {
  return `${runId}:${kind === 'session' ? 'research' : 'correction:1'}`
}

const SessionSnapshot = z.object({
  id: z.string(), status: z.string(), stop_reason: z.string().nullable().optional(),
  structured_output: z.unknown().optional(), last_seq: z.number().int().nonnegative(),
  consumed_micro_usd: z.number().nonnegative().optional(),
})
export interface ResearchSession {
  start(input: ResearchInput, candidates: Candidate[], signal: AbortSignal): Promise<string>
  poll(sessionId: string, signal: AbortSignal): Promise<z.infer<typeof SessionSnapshot>>
  correct(sessionId: string, runId: string, signal: AbortSignal): Promise<number>
  cancel(sessionId: string, signal: AbortSignal): Promise<void>
}

export function createResearchSession(options: { apiKey: string; agentId: string; fetch?: typeof fetch }): ResearchSession {
  const client = (signal: AbortSignal) => createClient({ apiKey: options.apiKey, baseUrl: 'https://api.vetta.sh',
    fetch: (input, init) => (options.fetch ?? fetch)(input, { ...init, signal }) })
  return {
    async start(input, candidates, signal) {
      return (await client(signal).sessions.create({
        agent_id: options.agentId, budget_micro_usd: RESEARCH_BUDGET_MICRO_USD,
        message: JSON.stringify({ brief: input.brief, candidates }),
        output_schema: z.toJSONSchema(Ranking), structured_output_required: true,
        metadata: { eventId: input.eventId, runId: input.runId, briefRevision: input.briefRevision },
      }, { idempotencyKey: researchOperationKey(input.runId, 'session') })).id
    },
    async poll(id, signal) { return SessionSnapshot.parse(await client(signal).sessions.get(id)) },
    async correct(id, runId, signal) {
      return (await client(signal).sessions.send(id, {
        message: 'Return submit_output with only candidateIds from the supplied evidence. Reuse evidence. Do not search or include other fields.',
      }, { idempotencyKey: researchOperationKey(runId, 'correction') })).accepted_seq
    },
    async cancel(id, signal) {
      try { await client(signal).sessions.cancel(id) }
      catch (error) {
        if (!(error instanceof ApiError && error.status === 409 && error.code === 'session_terminal')) throw error
      }
    },
  }
}
