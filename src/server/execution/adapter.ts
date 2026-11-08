import type { Mode, PlannedAction } from '../../contracts'

// Supplier adapter interface (contract 0.4, "Supplier adapter").
// Adapters run inside execute_action, cancel_action and reconcile_action on our
// server; the backend records their result. Each call must finish well inside
// one HTTP request.

export type AdapterOutcome = 'succeeded' | 'failed' | 'unknown'

export type AdapterResult = {
  outcome: AdapterOutcome
  providerReference?: string
  actualAmount?: number
  evidence?: { providerReference: string; confirmation?: string }
  /** For a definite refusal above maximumAmount, use the reason `amount_exceeded`. */
  errorReason?: string
}

export interface SupplierAdapter {
  mode: Mode
  /** Must refuse (outcome failed, errorReason amount_exceeded) rather than commit above action.maximumAmount. */
  commit(action: PlannedAction, executionKey: string): Promise<AdapterResult>
  cancel(action: PlannedAction, commitReference: string, executionKey: string): Promise<AdapterResult>
  /** Reports the observed outcome for an executionKey. Never starts a new purchase. */
  reconcile(action: PlannedAction, executionKey: string): Promise<AdapterResult>
}
