import { z } from 'zod'
import { cancelAction, checkCommit, executeAction, reconcileAction, type ExecutionDeps, type ExecutionResult } from '../execution/execute'
import { toolResult, type ToolCallResult, type ToolDefinition } from './protocol'

// MCP tool registry (contract 0.4, "Guarded MCP tools"). Every state-changing
// tool takes a `reason`, stored as an agent progress entry. The agent passes
// only eventId and actionId; execution keys are derived on the server.

const Id = z.string().min(1).max(200)
const Reason = z.string().min(1).max(2000)

/** Resolved lazily so ping and the protocol work before a Store is configured. */
export type GetDeps = () => ExecutionDeps

function tool<T>(definition: ToolDefinition<T>): ToolDefinition<T> {
  return definition
}

function fromExecution(result: ExecutionResult): ToolCallResult {
  return result.ok ? toolResult(result) : toolResult(result, true)
}

export function createTools(getDeps: GetDeps): ToolDefinition<any>[] {
  return [
    tool({
      name: 'ping',
      description: 'Connectivity check. Returns pong and the server time. Changes nothing.',
      input: z.object({}).strict(),
      handler: async () => {
        console.log('[mcp] ping')
        return toolResult({ ok: true, pong: true, serverTime: new Date().toISOString() })
      },
    }),
    tool({
      name: 'get_event',
      description:
        'Reads an event: brief, current plan with actions, approval and payment state, attempts, and which actions execute_action would currently allow. Changes nothing.',
      input: z.object({ eventId: Id }).strict(),
      handler: async ({ eventId }) => {
        const deps = getDeps()
        const event = await deps.store.getEvent(eventId)
        const view = event ? await deps.store.getEventView(eventId, event.progressSequence) : null
        if (!event || !view) return toolResult({ ok: false, errorCode: 'not_found', reason: 'event_not_found', message: `Event ${eventId} was not found.` }, true)
        const actions = []
        for (const action of view.plan?.actions ?? []) {
          const check = await checkCommit(deps, event, action.actionId)
          actions.push({ actionId: action.actionId, allowed: check.ok, reason: check.ok ? null : check.reason })
        }
        return toolResult({
          ok: true,
          event: {
            eventId: event.eventId,
            status: event.status,
            brief: event.brief,
            briefRevision: event.briefRevision,
            planRevision: event.planRevision,
            cancelRequestedAt: event.cancelRequestedAt,
          },
          plan: view.plan,
          approval: view.approval,
          payment: view.payment && { state: view.payment.state, amount: view.payment.amount, currency: view.payment.currency, mode: view.payment.mode, refundState: view.payment.refundState },
          attempts: view.attempts,
          actions,
        })
      },
    }),
    tool({
      name: 'log_progress',
      description: 'Adds an agent progress entry the customer sees on the event page. Changes no other state.',
      input: z.object({ eventId: Id, message: Reason }).strict(),
      handler: async ({ eventId, message }) => {
        const { store } = getDeps()
        if (!(await store.getEvent(eventId))) return toolResult({ ok: false, errorCode: 'not_found', reason: 'event_not_found', message: `Event ${eventId} was not found.` }, true)
        const entry = await store.appendProgress(eventId, 'agent', message)
        return toolResult({ ok: true, sequence: entry.sequence })
      },
    }),
    tool({
      name: 'execute_action',
      description:
        'Commits one planned supplier action (booking or purchase) through the supplier adapter, only if the customer approved and paid for it. Repeating the call returns the existing attempt with replayed true and never buys twice. Refusals return errorCode not_allowed with a reason, or amount_exceeded.',
      input: z.object({ eventId: Id, actionId: Id, reason: Reason.describe('Why the agent is taking this action; shown to the customer.') }).strict(),
      handler: async (args) => fromExecution(await executeAction(getDeps(), args)),
    }),
    tool({
      name: 'cancel_action',
      description:
        'Cancels one succeeded commitment through the supplier adapter, only after the customer requested cancellation. Repeating the call returns the existing cancel attempt with replayed true.',
      input: z.object({ eventId: Id, actionId: Id, reason: Reason.describe('Why the agent is canceling; shown to the customer.') }).strict(),
      handler: async (args) => fromExecution(await cancelAction(getDeps(), args)),
    }),
    tool({
      name: 'reconcile_action',
      description:
        'Asks the supplier for the observed outcome of an attempt in state unknown and records it. Never starts a new purchase.',
      input: z.object({ eventId: Id, actionId: Id, reason: Reason.optional() }).strict(),
      handler: async (args) => fromExecution(await reconcileAction(getDeps(), args)),
    }),
  ]
}
