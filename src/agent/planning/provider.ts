import { createClient, type SessionCreate } from '@usenaive-sdk/managed-agents'
import { z } from 'zod'
import { isBlocked, pendingResearch, type ApprovalSnapshot } from './approvals'
import { createPlanningFetch } from './transport'
import { ApiError } from '../../server/events/errors'
import { planningProposalSchema, type PlanningAgent } from './contract'

type Snapshot = ApprovalSnapshot & { id: string; status: string; last_seq: number; stop_reason: string | null; structured_output: unknown; pending_actions?: unknown[] }
export interface PlanningClient {
  sessions: {
    create(body: SessionCreate, options: { idempotencyKey: string }): Promise<{ id: string; last_seq: number }>
    send(id: string, body: { message: string }, options: { idempotencyKey: string }): Promise<{ accepted_seq: number }>
    get(id: string): Promise<Snapshot>
    threads?(id: string, query: { limit: number; after?: string }): Promise<{ data: ApprovalSnapshot[]; has_more: boolean; next_cursor?: string | null }>
    confirmTool?(id: string, body: { tool_call_id: string; decision: 'allow' | 'deny'; scope: 'call' }): Promise<unknown>
    events(id: string, query: { after_seq: number; limit: number }): Promise<{ data: { seq: number; type: string; data: unknown }[] }>
  }
}

export const planningOutputSchema = z.toJSONSchema(planningProposalSchema)

export function createPlanningAgent({ client, agentId, budgetMicroUsd = 500_000 }: {
  client: PlanningClient; agentId: string; budgetMicroUsd?: number
}): PlanningAgent {
  async function family(parent: Snapshot): Promise<ApprovalSnapshot[]> {
    if (parent.stop_reason !== 'awaiting_delegation') return [parent]
    if (!client.sessions.threads) throw new Error('Team status lookup is unavailable.')
    const members: ApprovalSnapshot[] = [parent]
    let after: string | undefined
    for (let page = 0; page < 10; page++) {
      const result = await client.sessions.threads(parent.id, { limit: 100, ...(after ? { after } : {}) })
      members.push(...result.data.filter(child => child.parent_session_id === parent.id))
      if (!result.has_more) return members
      if (!result.next_cursor || result.next_cursor === after) break
      after = result.next_cursor
    }
    throw new Error('Team status lookup is incomplete.')
  }
  return {
    async confirm(input) {
      const sessions = await family(await client.sessions.get(input.sessionId))
      const action = pendingResearch(sessions).find(action => action.view.id === input.approvalId)
      if (!action || !client.sessions.confirmTool) throw new Error('This research request is no longer awaiting approval.')
      await client.sessions.confirmTool(action.sessionId, { tool_call_id: action.callId, decision: input.decision, scope: 'call' })
    },
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
      const sessions = await family(session)
      if (sessions.some(isBlocked)) {
        return { ...result, status: 'blocked', progress: null,
          error: 'Research is paused for a decision.', approvals: pendingResearch(sessions).map(action => action.view) }
      }
      if (session.stop_reason === 'awaiting_delegation') return { ...result, progress: 'Your research team is checking options.' }
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
    fetch: createPlanningFetch(),
  }) })
}
