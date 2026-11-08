import type { PlannedAction } from '../contracts'
import type { SupplierAdapter } from './execution/adapter'
import type { ExecutionDeps } from './execution/execute'
import { SimulatedSupplierAdapter, simulatedOptionsFromEnv } from './execution/simulated-adapter'
import type { Store } from './store'
import { createNeonStore } from './db/client'
import { getDeps } from './events/deps'
import { issueFinalRefund } from './payments/webhook'

// Server runtime wiring. Server-only: never import from UI code.

let store: Store | null = null

/** The configured Store. The integrator wires the Neon store here. */
export function getStore(): Store {
  if (!store && process.env.DATABASE_URL) store = createNeonStore(process.env.DATABASE_URL)
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
  return {
    store: getStore(),
    adapterFor: getSupplierAdapter,
    // When every commitment is canceled, issue the customer's refund once.
    onAllCanceled: async (eventId) => {
      await issueFinalRefund(getDeps(), eventId)
    },
    // Every supplier confirmed: send the "It's happening" email the arranging screen promised.
    onAllBooked: async (eventId, approval) => {
      const { notifications, store } = getDeps()
      if (!notifications?.allSet) return
      const [event, plan] = await Promise.all([store.getEvent(eventId), store.getPlan(eventId)])
      if (!event || !plan || plan.revision !== approval.planRevision) return
      await notifications.allSet({ customerId: event.customerId, eventId, approvalId: approval.approvalId, brief: event.brief, plan })
    },
  }
}
