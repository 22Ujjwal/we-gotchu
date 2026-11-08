import { createClient, type SessionCreate } from '@usenaive-sdk/managed-agents'
import { z } from 'zod'
import { ApiError } from '../../server/events/errors'
import { planningProposalSchema, type PlanningAgent } from './contract'

type Snapshot = { id: string; status: string; last_seq: number; stop_reason: string | null; structured_output: unknown; pending_actions?: unknown[] }
export interface PlanningClient {
  sessions: {
    create(body: SessionCreate, options: { idempotencyKey: string }): Promise<{ id: string; last_seq: number }>
    send(id: string, body: { message: string }, options: { idempotencyKey: string }): Promise<{ accepted_seq: number }>
    get(id: string): Promise<Snapshot>
    events(id: string, query: { after_seq: number; limit: number }): Promise<{ data: { seq: number; type: string; data: unknown }[] }>
  }
}

export const planningOutputSchema = z.toJSONSchema(planningProposalSchema)

export function createPlanningAgent({ client, agentId, budgetMicroUsd = 500_000 }: {
  client: PlanningClient; agentId: string; budgetMicroUsd?: number
}): PlanningAgent {
  return {
    async start(input) {
      const session = await client.sessions.create({
        agent_id: agentId, message: input.message, budget_micro_usd: budgetMicroUsd,
        output_schema: planningOutputSchema, structured_output_required: true,
        metadata: { conversationId: input.conversationId, purpose: 'event-planning' },
      }, { idempotencyKey: `planning:${input.conversationId}:${input.requestId}` })
      return { sessionId: session.id, sequence: session.last_seq }
    },
    async send(input) {
      const accepted = await client.sessions.send(input.sessionId, {
        message: JSON.stringify({ customerMessage: input.message, customerSelections: input.selections }),
      }, { idempotencyKey: `planning:${input.sessionId}:${input.requestId}` })
      return { sequence: accepted.accepted_seq }
    },
    async read(input) {
      const [session, events] = await Promise.all([
        client.sessions.get(input.sessionId),
        client.sessions.events(input.sessionId, { after_seq: input.afterSequence, limit: 100 }),
      ])
      const result = { status: 'working' as const, sequence: session.last_seq, proposal: null, error: null,
        progress: events.data.some(event => event.type === 'tool.started')
          ? 'Checking sources for your event.' : 'Working on your event options.' }
      if (['failed', 'cancelled'].includes(session.status) || ['error', 'budget_paused', 'max_iterations', 'context_exhausted'].includes(session.stop_reason ?? '')) {
        return { ...result, status: 'failed', progress: null, error: 'Research stopped before the next proposal was ready. Your saved options are still available.' }
      }
      if (session.pending_actions?.length || ['awaiting_approval', 'awaiting_input', 'awaiting_answer'].includes(session.stop_reason ?? '')) {
        return { ...result, status: 'failed', progress: null, error: 'Research needs operator attention. Your saved options are still available.' }
      }
      // An accepted follow-up can briefly read the previous turn's idle snapshot.
      if (session.last_seq <= input.afterSequence || !['idle', 'completed'].includes(session.status)) return result
      const proposal = planningProposalSchema.safeParse(session.structured_output)
      if (!proposal.success) return { ...result, status: 'failed', progress: null, error: 'Research finished without a usable proposal. Your saved options are still available.' }
      return { ...result, status: 'ready', proposal: proposal.data, progress: null }
    },
  }
}

export function createConfiguredPlanningAgent(env: NodeJS.ProcessEnv = process.env): PlanningAgent {
  if (!env.NAIVE_API_KEY || !env.NAIVE_PLANNING_AGENT_ID) {
    throw new ApiError(503, 'planning_not_configured', 'Event planning is not configured yet.')
  }
  return createPlanningAgent({ agentId: env.NAIVE_PLANNING_AGENT_ID, client: createClient({
    apiKey: env.NAIVE_API_KEY, baseUrl: 'https://api.vetta.sh',
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(45_000) }),
  }) })
}
