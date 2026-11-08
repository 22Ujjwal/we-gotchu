import { createHash } from 'node:crypto'
import type { PlannedAction } from '../../contracts'
import type { AdapterResult, SupplierAdapter } from './adapter'

// Simulated supplier. Makes no external call and is always labeled mode
// "simulated". References are derived from the execution key, so the same key
// always yields the same `sim_` reference.

export type SimulatedFailure = 'fail' | 'timeout'

export type SimulatedAdapterOptions = {
  /** Make commits fail definitely or time out (throw). */
  failure?: SimulatedFailure
  /** Limit the failure to one action: matches an actionId or an action kind. Omit for all commits. */
  failureTarget?: string
  /** Delay before a simulated timeout throws. Default 10 ms. */
  timeoutDelayMs?: number
  /** What reconcile reports for a commit that timed out. Default succeeded (the booking went through). */
  reconcileOutcome?: 'succeeded' | 'failed'
  /** Simulated supplier price; defaults to the action's maximumAmount. Above maximumAmount the adapter refuses. */
  priceFor?: (action: PlannedAction) => number
}

/**
 * Parses SIMULATED_SUPPLIER_FAILURE: `fail` or `timeout`, optionally followed by
 * `:<actionId or kind>`, e.g. `timeout:item_purchase`. Anything else means no failure.
 */
export function simulatedOptionsFromEnv(value: string | undefined): SimulatedAdapterOptions {
  if (!value) return {}
  const [failure, target] = value.split(':', 2)
  if (failure !== 'fail' && failure !== 'timeout') return {}
  return { failure, failureTarget: target || undefined }
}

export function simulatedReference(executionKey: string): string {
  return `sim_${createHash('sha256').update(executionKey).digest('hex').slice(0, 16)}`
}

export class SimulatedSupplierAdapter implements SupplierAdapter {
  readonly mode = 'simulated' as const
  private readonly options: SimulatedAdapterOptions

  constructor(options: SimulatedAdapterOptions = {}) {
    this.options = options
  }

  private failureFor(action: PlannedAction): SimulatedFailure | undefined {
    const { failure, failureTarget } = this.options
    if (!failure) return undefined
    if (failureTarget && failureTarget !== action.actionId && failureTarget !== action.kind) return undefined
    return failure
  }

  private price(action: PlannedAction): number {
    return this.options.priceFor ? this.options.priceFor(action) : action.maximumAmount
  }

  private success(action: PlannedAction, executionKey: string, confirmation: string): AdapterResult {
    const providerReference = simulatedReference(executionKey)
    return {
      outcome: 'succeeded',
      providerReference,
      actualAmount: this.price(action),
      evidence: { providerReference, confirmation },
    }
  }

  async commit(action: PlannedAction, executionKey: string): Promise<AdapterResult> {
    const price = this.price(action)
    if (price > action.maximumAmount) {
      return { outcome: 'failed', errorReason: 'amount_exceeded' }
    }
    const failure = this.failureFor(action)
    if (failure === 'fail') return { outcome: 'failed', errorReason: 'simulated supplier refused the booking' }
    if (failure === 'timeout') {
      await new Promise((resolve) => setTimeout(resolve, this.options.timeoutDelayMs ?? 10))
      throw new Error('simulated supplier timeout')
    }
    return this.success(action, executionKey, `Simulated ${action.kind} with ${action.supplierName}.`)
  }

  async cancel(action: PlannedAction, commitReference: string, executionKey: string): Promise<AdapterResult> {
    const providerReference = simulatedReference(executionKey)
    return {
      outcome: 'succeeded',
      providerReference,
      actualAmount: 0,
      evidence: { providerReference, confirmation: `Simulated cancellation of ${commitReference} with ${action.supplierName}.` },
    }
  }

  async reconcile(action: PlannedAction, executionKey: string): Promise<AdapterResult> {
    if (executionKey.endsWith(':cancel')) {
      return this.success(action, executionKey, `Simulated cancellation confirmed on reconcile.`)
    }
    if (this.failureFor(action) === 'fail' || this.price(action) > action.maximumAmount) {
      return { outcome: 'failed', errorReason: 'simulated supplier has no booking for this key' }
    }
    if ((this.options.reconcileOutcome ?? 'succeeded') === 'failed') {
      return { outcome: 'failed', errorReason: 'simulated supplier has no booking for this key' }
    }
    return this.success(action, executionKey, `Simulated ${action.kind} confirmed on reconcile.`)
  }
}
