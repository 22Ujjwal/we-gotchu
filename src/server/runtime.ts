import type { PlannedAction } from '../contracts'
import type { SupplierAdapter } from './execution/adapter'
import type { ExecutionDeps } from './execution/execute'
import { SimulatedSupplierAdapter, simulatedOptionsFromEnv } from './execution/simulated-adapter'
import type { Store } from './store'

// Server runtime wiring. Server-only: never import from UI code.

let store: Store | null = null

/** The configured Store. The integrator wires the Neon store here. */
export function getStore(): Store {
  if (!store) {
    throw new Error('No Store is configured. Wire the database store in src/server/runtime.ts (or call setStoreForTests in tests).')
  }
  return store
}

export function setStoreForTests(next: Store | null): void {
  store = next
}

let simulated: SimulatedSupplierAdapter | null = null

/**
 * Only the simulated adapter exists for the demo. A live or test action gets the
 * simulated adapter too, and execute_action refuses it with mode_mismatch.
 */
export function getSupplierAdapter(_action: PlannedAction): SupplierAdapter {
  simulated ??= new SimulatedSupplierAdapter(simulatedOptionsFromEnv(process.env.SIMULATED_SUPPLIER_FAILURE))
  return simulated
}

export function getExecutionDeps(): ExecutionDeps {
  return { store: getStore(), adapterFor: getSupplierAdapter }
}
