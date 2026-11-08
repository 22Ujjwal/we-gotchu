import { createConfiguredPlanningAgent } from '../../agent/planning/provider'
import { requireCustomerId } from '../auth'
import { createNeonPlanningRepository } from '../db/client'
import { ApiError } from '../events/errors'
import type { PlanningRepository } from './repository'
import type { PlanningDeps } from './service'

let repository: PlanningRepository | undefined

export function getPlanningDeps(): PlanningDeps {
  if (!repository) {
    const url = process.env.DATABASE_URL
    if (!url) throw new ApiError(503, 'planning_unavailable', 'Planning storage is not configured.')
    repository = createNeonPlanningRepository(url)
  }
  return { repository, requireCustomerId, agent: createConfiguredPlanningAgent }
}
