import { beforeEach, describe, expect, it, vi } from 'vitest'

const factories = vi.hoisted(() => ({ local: vi.fn(), neon: vi.fn(), provider: vi.fn(), close: vi.fn() }))
vi.mock('../db/client', () => ({ createLocalPlanningRepository: factories.local, createNeonPlanningStorage: factories.neon }))
vi.mock('../auth', () => ({ requireCustomerId: async () => 'alice' }))
vi.mock('../../agent/planning/provider', () => ({ createConfiguredPlanningAgent: factories.provider }))
import { createPlanningRuntime } from './runtime'

beforeEach(() => {
  vi.resetAllMocks()
  factories.local.mockResolvedValue({ repository: { local: true }, close: factories.close })
  factories.neon.mockReturnValue({ repository: { neon: true }, close: factories.close })
})

describe('planning runtime storage boundary', () => {
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
