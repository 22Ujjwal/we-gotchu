import { createPlanning, getPlanning, commandPlanning } from '../planning/service'
import type { PlanningDeps } from '../planning/service'
import type { AgentActor, AgentBackend } from './types'

/** Reuse the application workflow and durable ownership/idempotency rules.
 * The HTTP/MCP layer verifies the grant before this internal bridge is called. */
export function createPlanningBridge(opts: Omit<PlanningDeps, 'requireCustomerId' | 'allowResearchReview'>): AgentBackend {
  const scoped = (actor: AgentActor): PlanningDeps => ({
    ...opts, requireCustomerId: async () => actor.customerId, allowResearchReview: false,
  })
  return {
    create: (actor, input) => createPlanning(scoped(actor), input),
    read: (actor, id) => getPlanning(scoped(actor), id),
    command: (actor, id, input) => commandPlanning(scoped(actor), id, input),
  }
}
