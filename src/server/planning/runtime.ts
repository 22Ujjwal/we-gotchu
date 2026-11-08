import { createConfiguredPlanningAgent } from '../../agent/planning/provider'
import { requireCustomerId } from '../auth'
import { createLocalPlanningRepository, createNeonPlanningRepository } from '../db/client'
import { ApiError } from '../events/errors'
import type { PlanningRepository } from './repository'
import type { PlanningDeps } from './service'

export function createPlanningRuntime(env: NodeJS.ProcessEnv = process.env) {
  let repository: Promise<PlanningRepository> | undefined
  let local: Awaited<ReturnType<typeof createLocalPlanningRepository>> | undefined

  async function open(): Promise<PlanningRepository> {
    if (env.NODE_ENV === 'development' && env.PLANNING_LOCAL_DB_DIR) {
      local = await createLocalPlanningRepository(env.PLANNING_LOCAL_DB_DIR)
      return local.repository
    }
    if (!env.DATABASE_URL) throw new ApiError(503, 'planning_unavailable', 'Planning storage is not configured.')
    return createNeonPlanningRepository(env.DATABASE_URL)
  }

  return {
    async getDeps(): Promise<PlanningDeps> {
      repository ??= open().catch(error => { repository = undefined; throw error })
      return { repository: await repository, requireCustomerId, agent: () => createConfiguredPlanningAgent(env) }
    },
    async close(): Promise<void> {
      await repository?.catch(() => undefined)
      await local?.close()
      local = undefined
      repository = undefined
    },
  }
}

// Development hot reload must reuse the owner of the file-backed database.
const state = globalThis as typeof globalThis & { __planningRuntime?: ReturnType<typeof createPlanningRuntime> }
const runtime = process.env.NODE_ENV === 'development'
  ? state.__planningRuntime ??= createPlanningRuntime()
  : createPlanningRuntime()

export const getPlanningDeps = () => runtime.getDeps()
