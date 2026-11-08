import { handle, json, readJson } from '../events/errors'
import { commandPlanning, createPlanning, getPlanning } from './service'
import type { PlanningDeps } from './service'

export const planningCollectionPost = (deps: PlanningDeps, request: Request) =>
  handle(async () => json(await createPlanning(deps, await readJson(request)), 201))

export const planningGet = (deps: PlanningDeps, id: string) =>
  handle(async () => json(await getPlanning(deps, id)))

export const planningPost = (deps: PlanningDeps, id: string, request: Request) =>
  handle(async () => json(await commandPlanning(deps, id, await readJson(request))))
