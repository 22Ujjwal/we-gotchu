import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanningDeps } from './service'
import { planningCollectionPost, planningGet, planningPost } from './http'

const service = vi.hoisted(() => ({ createPlanning: vi.fn(), getPlanning: vi.fn(), commandPlanning: vi.fn() }))
vi.mock('./service', () => service)
const deps = {} as PlanningDeps
const request = (body: unknown) => new Request('http://localhost/api/planning', { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => { vi.resetAllMocks() })

describe('planning HTTP seam', () => {
  it('returns 201 with the created view and passes command bodies unchanged', async () => {
    const view = { id: 'conversation', version: 3 }
    service.createPlanning.mockResolvedValue(view)
    const body = { requestId: 'create', message: 'Party' }
    const created = await planningCollectionPost(deps, request(body))
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ ...view, canReviewResearch: false })
    expect(service.createPlanning).toHaveBeenCalledWith(deps, body)
    service.commandPlanning.mockResolvedValue(view)
    const command = { kind: 'select', requestId: 'select', expectedVersion: 3, optionId: 'cups' }
    expect((await planningPost(deps, 'conversation', request(command))).status).toBe(200)
    expect(service.commandPlanning).toHaveBeenCalledWith(deps, 'conversation', command)
    service.getPlanning.mockResolvedValue(view)
    expect(await (await planningGet(deps, 'conversation')).json()).toEqual({ ...view, canReviewResearch: false })
  })

  it('returns the existing error envelope for authentication and invalid JSON', async () => {
    service.getPlanning.mockRejectedValue({ status: 401 })
    const unauthorized = await planningGet(deps, 'conversation')
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({ errorCode: 'unauthenticated', message: 'Sign in required.' })
    const malformed = await planningCollectionPost(deps, new Request('http://localhost', { method: 'POST', body: '{' }))
    expect(malformed.status).toBe(422)
    expect((await malformed.json()).errorCode).toBe('invalid_json')
    expect(service.createPlanning).not.toHaveBeenCalled()
  })
})

it('keeps technical review requests out of the customer response', async () => {
  service.getPlanning.mockResolvedValue({ id: 'plan', approvals: [{ id: 'call', tool: 'internal', arguments: {} }], activity: [], status: 'blocked' })
  const customer = await (await planningGet(deps, 'plan')).json()
  expect(customer.approvals).toBeUndefined()
  expect(customer.canReviewResearch).toBe(false)
  const operator = await (await planningGet({ ...deps, allowResearchReview: true }, 'plan')).json()
  expect(operator.approvals).toHaveLength(1)
  expect(operator.canReviewResearch).toBe(true)
})

it('routes saved-state restoration without refreshing the provider', async () => {
  service.getPlanning.mockResolvedValue({ id: 'plan', status: 'ready' })
  const response = await planningGet(deps, 'plan', new Request('http://localhost/api/planning/plan?saved=1'))
  expect(response.status).toBe(200)
  expect(service.getPlanning).toHaveBeenCalledWith(deps, 'plan', { savedOnly: true })
})

it('routes mail reconciliation separately from research and saved-only reads', async () => {
  service.getPlanning.mockResolvedValue({ id: 'plan' })
  expect((await planningGet(deps, 'plan', new Request('http://localhost/api/planning/plan?mail=1'))).status).toBe(200)
  expect(service.getPlanning).toHaveBeenCalledWith(deps, 'plan', { reconcileMail: true })
})

it('dispatches saved reply retries independently of the customer connection', async () => {
  service.commandPlanning.mockResolvedValue({ id: 'plan' })
  const dispatch = vi.fn()
  const body = { kind: 'retry_reply', requestId: 'retry', expectedVersion: 1, inquiryId: 'inquiry', replyId: 'reply' }
  expect((await planningPost(deps, 'plan', request(body), dispatch)).status).toBe(200)
  expect(dispatch).toHaveBeenCalledTimes(1)
  service.commandPlanning.mockRejectedValue({ status: 409, errorCode: 'stale' })
  expect((await planningPost(deps, 'plan', request(body), dispatch)).status).toBe(409)
  expect(dispatch).toHaveBeenCalledTimes(1)
})
