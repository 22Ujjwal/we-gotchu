import { beforeEach, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({ store: { local: true }, getStorage: vi.fn(), configureStore: vi.fn(), configureDeps: vi.fn(), getDeps: vi.fn() }))
vi.mock('../planning/runtime', () => ({ getPlanningTransactionStore: state.getStorage }))
vi.mock('../runtime', () => ({ configureStore: state.configureStore }))
vi.mock('./deps', () => ({ configureDeps: state.configureDeps, getDeps: state.getDeps }))
import { getRequestDeps } from './local-runtime'

beforeEach(() => {
  vi.clearAllMocks()
  state.getStorage.mockResolvedValue(state.store)
  state.getDeps.mockReturnValue({ store: state.store })
})
test('wires the existing event and execution runtimes to the planning database in explicit local mode', async () => {
  const result = await getRequestDeps({ NODE_ENV: 'development', PLANNING_LOCAL_DB_DIR: '.scratch/test' })
  expect(state.getStorage).toHaveBeenCalledTimes(1)
  expect(state.configureStore).toHaveBeenCalledWith(state.store)
  expect(state.configureDeps).toHaveBeenCalledWith({ store: state.store })
  expect(result.store).toBe(state.store)
})
test('does not open a local database in production', async () => {
  await getRequestDeps({ NODE_ENV: 'production', PLANNING_LOCAL_DB_DIR: '.scratch/test' })
  expect(state.getStorage).not.toHaveBeenCalled()
  expect(state.configureStore).not.toHaveBeenCalled()
})
