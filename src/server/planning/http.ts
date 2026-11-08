import { handle, json, readJson } from '../events/errors'
import { commandPlanning, createPlanning, getPlanning } from './service'
import type { PlanningView } from '../../agent/planning/contract'
import type { PlanningDeps } from './service'

function present(deps: PlanningDeps, view: PlanningView) {
  const { approvals, ...customer } = view
  return { ...customer, canReviewResearch: !!deps.allowResearchReview,
    ...(deps.allowResearchReview ? { approvals } : {}) }
}

export const planningCollectionPost = (deps: PlanningDeps, request: Request) =>
  handle(async () => json(present(deps, await createPlanning(deps, await readJson(request))), 201))

export const planningGet = (deps: PlanningDeps, id: string) =>
  handle(async () => json(present(deps, await getPlanning(deps, id))))

export const planningPost = (deps: PlanningDeps, id: string, request: Request) =>
  handle(async () => json(present(deps, await commandPlanning(deps, id, await readJson(request)))))
