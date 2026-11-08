import { handle, json, readJson } from '../events/errors'
import { commandPlanning, createPlanning, getPlanning } from './service'
import type { PlanningView } from '../../agent/planning/contract'
import type { PlanningDeps } from './service'

function present(deps: PlanningDeps, view: PlanningView) {
  const { approvals, ...customer } = view
  return { ...customer, canReviewResearch: !!deps.allowResearchReview, canArrange: !!deps.arrange, ...(deps.mail ? { canSendInquiry: true } : {}),
    ...(deps.allowResearchReview ? { approvals } : {}) }
}

export const planningCollectionPost = (deps: PlanningDeps, request: Request) =>
  handle(async () => json(present(deps, await createPlanning(deps, await readJson(request))), 201))

export const planningGet = (deps: PlanningDeps, id: string, request?: Request) =>
  handle(async () => json(present(deps, await (request && new URL(request.url).searchParams.get('saved') === '1'
    ? getPlanning(deps, id, { savedOnly: true })
    : request && new URL(request.url).searchParams.get('mail') === '1'
      ? getPlanning(deps, id, { reconcileMail: true }) : getPlanning(deps, id)))))

export const planningPost = (deps: PlanningDeps, id: string, request: Request, dispatchReplies?: () => void) =>
  handle(async () => {
    const command = await readJson(request)
    const view = await commandPlanning(deps, id, command)
    if (command && typeof command === 'object' && 'kind' in command && command.kind === 'retry_reply') dispatchReplies?.()
    return json(present(deps, view))
  })
