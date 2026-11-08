import { getExecutionDeps } from '../runtime'
import type { Hooks } from '../events/deps'
import { cancelAction, executeAction } from './execute'

// Labeled fallback from the demo plan: a scripted agent that calls the same
// guarded execution functions a Naive session would call through MCP, in order,
// with fixed reasons. Every progress entry says it is the scripted agent so the
// demo never presents it as autonomous work. Set AGENT_MODE=naive to disable it.

const LABEL = '[scripted agent, simulated]'

export const scriptedAgentHooks: Hooks = {
  async onPaymentConfirmed({ eventId }) {
    const deps = getExecutionDeps()
    const plan = await deps.store.getPlan(eventId)
    if (!plan) return
    // Venue first, then items that depend on it (plan order already respects dependsOn).
    for (const action of plan.actions) {
      const result = await executeAction(deps, {
        eventId,
        actionId: action.actionId,
        reason: `${LABEL} Executing approved ${action.kind} with ${action.supplierName}.`,
      })
      if (result.attempt?.state !== 'succeeded') break
    }
  },

  async startSupplierCancellation({ eventId }) {
    const deps = getExecutionDeps()
    const attempts = await deps.store.listAttempts(eventId)
    const committed = attempts.filter((a) => a.kind === 'commit' && a.state === 'succeeded')
    for (const attempt of committed) {
      await cancelAction(deps, {
        eventId,
        actionId: attempt.actionId,
        reason: `${LABEL} Canceling ${attempt.actionId} at the customer's request.`,
      })
    }
  },
}
