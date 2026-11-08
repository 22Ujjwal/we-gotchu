import { beforeEach, describe, expect, it, vi } from 'vitest'

const factories = vi.hoisted(() => ({ local: vi.fn(), neon: vi.fn(), provider: vi.fn(), close: vi.fn(),
  interpreter: vi.fn(), generator: vi.fn(), worker: vi.fn(), prepareOffer: vi.fn() }))
vi.mock('../db/client', () => ({ createLocalPlanningRepository: factories.local, createNeonPlanningStorage: factories.neon }))
vi.mock('../auth', () => ({ requireCustomerId: async () => 'alice' }))
vi.mock('../../agent/planning/provider', () => ({ createConfiguredPlanningAgent: factories.provider }))
vi.mock('../../agent/planning/reply-interpreter', () => ({ createConfiguredReplyInterpreter: factories.interpreter }))
vi.mock('../../agent/planning/offer-generator', () => ({ createConfiguredOfferGenerator: factories.generator }))
vi.mock('./reply-worker', () => ({ processReplyJobs: factories.worker }))
vi.mock('./reply-offer', () => ({ prepareReplyOffer: factories.prepareOffer }))
import { createPlanningRuntime } from './runtime'

beforeEach(() => {
  vi.resetAllMocks()
  factories.local.mockResolvedValue({ repository: { local: true }, close: factories.close })
  factories.neon.mockReturnValue({ repository: { neon: true }, close: factories.close })
})

describe('planning runtime storage boundary', () => {
  it('continues background reply processing into offer preparation without a customer request', async () => {
    const repository = { local: true, get: vi.fn().mockResolvedValue(null) }
    const offers = { save: vi.fn() }
    const interpret = vi.fn()
    const generate = vi.fn()
    const job = { customerId: 'alice', conversationId: 'conversation', inquiryId: 'inquiry', replyId: 'reply' }
    factories.local.mockResolvedValue({ repository, offers, close: factories.close })
    factories.interpreter.mockReturnValue(interpret)
    factories.generator.mockReturnValue(generate)
    factories.worker.mockImplementation(async (_repository, _interpret, _limit, afterReply) => {
      await afterReply?.(job)
      return { processed: 1 }
    })
    const env = { NODE_ENV: 'development', PLANNING_LOCAL_DB_DIR: '.scratch/runtime-test' }
    const runtime = createPlanningRuntime(env)
    expect(await runtime.processReplies()).toEqual({ processed: 1 })
    expect(factories.prepareOffer).toHaveBeenCalledExactlyOnceWith(repository, offers, generate, job)
    expect(repository.get).toHaveBeenCalledExactlyOnceWith('alice', 'conversation')
    expect(factories.generator).toHaveBeenCalledWith(env)
    expect(factories.provider).not.toHaveBeenCalled()
    await runtime.close()
  })

  it('opens one explicitly configured development database without touching Neon or the provider', async () => {
    const runtime = createPlanningRuntime({ NODE_ENV: 'development', PLANNING_LOCAL_DB_DIR: '.scratch/local-planning-db', DATABASE_URL: 'postgres://unused.invalid/db' })
    const [first, second] = await Promise.all([runtime.getDeps(), runtime.getDeps()])
    expect(first.repository).toBe(second.repository)
    expect(factories.local).toHaveBeenCalledExactlyOnceWith('.scratch/local-planning-db')
    expect(factories.neon).not.toHaveBeenCalled()
    expect(factories.provider).not.toHaveBeenCalled()
    await runtime.close()
    expect(factories.close).toHaveBeenCalledTimes(1)
  })

  it('requires production DATABASE_URL and never opens the local database in production', async () => {
    const missing = createPlanningRuntime({ NODE_ENV: 'production', PLANNING_LOCAL_DB_DIR: '.scratch/local-planning-db' })
    await expect(missing.getDeps()).rejects.toMatchObject({ status: 503, errorCode: 'planning_unavailable' })
    const production = createPlanningRuntime({ NODE_ENV: 'production', DATABASE_URL: 'postgres://configured.invalid/db', PLANNING_LOCAL_DB_DIR: '.scratch/local-planning-db' })
    await production.getDeps()
    expect(factories.local).not.toHaveBeenCalled()
    expect(factories.neon).toHaveBeenCalledExactlyOnceWith('postgres://configured.invalid/db')
  })
})
