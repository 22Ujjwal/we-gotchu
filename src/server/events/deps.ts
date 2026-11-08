import { createConfiguredResearch } from '../../agent/configured'
import type { Event, Mode, ResearchInput, ResearchResult, Run } from '../../contracts'
import type { Store } from '../store'
import { createStripeAdapter, type StripeLike } from '../payments/stripe'
import { simulatedResearchPort } from './simulatedResearch'
import { getStore } from '../runtime'
import { scriptedAgentHooks } from '../execution/scripted-agent'

// Dependency wiring for the customer API and payment flow. Server-only.
// Handlers take a Deps value so tests can swap in fakes without network calls.

export type { StripeLike }

/** Boundary to Tony's research code (contract 0.4, Research). */
export interface ResearchPort {
  startResearch(input: ResearchInput): Promise<{ naiveSessionId: string | null }>
  advanceResearch(input: {
    event: Event
    run: Run
  }): Promise<{ status: 'running' } | { status: 'done'; result: ResearchResult; lastSequence: number }>
  cancelResearch(run: Run): Promise<void>
}

export type PaymentConfirmed = { eventId: string; approvalId: string; paymentId: string }
export type CancellationRequested = { eventId: string; paidApprovalIds: string[] }

/** Hooks wired later by the execution and cancellation work. */
export interface Hooks {
  /** Called once after a payment is confirmed and the event moved to `executing`. Starts the execution session. */
  onPaymentConfirmed(input: PaymentConfirmed): Promise<void>
  /** Called after cancel when paid approvals exist. Starts the supplier cancellation session. */
  startSupplierCancellation(input: CancellationRequested): Promise<void>
}

export type DepsConfig = {
  /** Base URL for Checkout success and cancel redirects. */
  appUrl: string
  stripeWebhookSecret: string | undefined
  /** Mode recorded on payments: `test` for sk_test keys, `live` for sk_live keys. */
  paymentMode: Mode
  /** Mode recorded on planned actions (supplier execution). */
  executionMode: Mode
  /** Single-flight lease taken before advancing a research run. */
  advanceLeaseMs: number
}

export type Deps = {
  store: Store
  stripe: StripeLike
  now: () => Date
  research: ResearchPort
  requireCustomerId: () => Promise<string>
  hooks: Hooks
  config: DepsConfig
}

export const defaultHooks: Hooks = {
  async onPaymentConfirmed(input) {
    // TODO(execution): start the Naive execution session for this approval.
    console.info('[hooks] onPaymentConfirmed not wired yet', input)
  },
  async startSupplierCancellation(input) {
    // TODO(cancellation): start the Naive cancellation session that calls cancel_action.
    console.info('[hooks] startSupplierCancellation not wired yet', input)
  },
}

function paymentModeFromKey(key: string | undefined): Mode {
  if (key?.startsWith('sk_live_') || key?.startsWith('rk_live_')) return 'live'
  if (key?.startsWith('sk_test_') || key?.startsWith('rk_test_')) return 'test'
  return 'simulated'
}

let overrides: Partial<Deps> = {}
let testDeps: Deps | null = null
let cached: Deps | null = null

/**
 * Lets the runtime wiring supply the real Store (and later Tony's ResearchPort
 * and the execution hooks) without this module importing them.
 */
export function configureDeps(partial: Partial<Deps>): void {
  overrides = { ...overrides, ...partial }
  cached = null
}

export function setDepsForTests(deps: Deps | null): void {
  testDeps = deps
}

export function getDeps(): Deps {
  if (testDeps) return testDeps
  if (cached) return cached
  const store = overrides.store ?? getStore()
  const secretKey = process.env.STRIPE_SECRET_KEY
  cached = {
    store,
    stripe: overrides.stripe ?? createStripeAdapter(secretKey),
    now: overrides.now ?? (() => new Date()),
    // Simulation requires an explicit mode; missing real credentials never select fake results.
    research: overrides.research ?? (process.env.RESEARCH_MODE === 'simulated' ? simulatedResearchPort : createConfiguredResearch(store)),
    requireCustomerId:
      overrides.requireCustomerId ?? (async () => (await import('../auth')).requireCustomerId()),
    // The scripted agent drives execution and cancellation until Naive sessions are wired.
    hooks: overrides.hooks ?? (process.env.AGENT_MODE === 'naive' ? defaultHooks : scriptedAgentHooks),
    config: overrides.config ?? {
      appUrl: process.env.APP_URL ?? 'http://localhost:3000',
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      paymentMode: paymentModeFromKey(secretKey),
      executionMode: 'simulated',
      advanceLeaseMs: 30_000,
    },
  }
  return cached
}
