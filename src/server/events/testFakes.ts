import type { Approval, Attempt, Brief, Event, EventView, Payment, Plan, ProgressEntry, ResearchResult, Run } from '../../contracts'
import type { Store } from '../store'
import { createStripeAdapter, type CheckoutCreateParams, type CheckoutSessionLike, type RefundCreateParams, type StripeLike } from '../payments/stripe'
import type { Deps, ResearchPort } from './deps'
import { simulatedResearchPort } from './simulatedResearch'

// Test-only fakes: an in-memory Store that follows the documented interface
// semantics, and a Stripe fake with no network. Webhook signature checks use the
// real Stripe SDK verifier. Never import from production code.

export class MemoryStore implements Store {
  events = new Map<string, Event>()
  runs = new Map<string, Run>()
  results = new Map<string, ResearchResult>()
  plans = new Map<string, Plan>()
  approvals = new Map<string, Approval>()
  payments = new Map<string, Payment>()
  attempts = new Map<string, Attempt>()
  progress: ProgressEntry[] = []
  stripeEvents = new Set<string>()
  private n = 0
  constructor(private now: () => Date = () => new Date()) {}
  private nextId(p: string) {
    return `${p}_${++this.n}`
  }
  private iso() {
    return this.now().toISOString()
  }
  private newRun(eventId: string, phase: Run['phase'], briefRevision: number, idempotencyKey: string): Run {
    const run: Run = {
      runId: this.nextId('run'),
      eventId,
      phase,
      briefRevision,
      idempotencyKey,
      naiveSessionId: null,
      lastSequence: 0,
      state: 'running',
      advancingUntil: null,
      correctionsUsed: 0,
      createdAt: this.iso(),
    }
    this.runs.set(run.runId, run)
    return run
  }

  async createEvent({ customerId, brief }: { customerId: string; brief: Brief }) {
    const event: Event = {
      eventId: this.nextId('evt'),
      customerId,
      brief,
      briefRevision: 1,
      status: 'researching',
      planRevision: 0,
      cancelRequestedAt: null,
      progressSequence: 0,
      createdAt: this.iso(),
    }
    this.events.set(event.eventId, event)
    const run = this.newRun(event.eventId, 'research', 1, `${event.eventId}:research:1`)
    return { event: { ...event }, run: { ...run } }
  }
  async getEvent(eventId: string) {
    const e = this.events.get(eventId)
    return e ? { ...e } : null
  }
  async getEventView(eventId: string, afterSequence = 0): Promise<EventView | null> {
    const event = this.events.get(eventId)
    if (!event) return null
    const run = [...this.runs.values()].filter((r) => r.eventId === eventId && r.phase === 'research').at(-1) ?? null
    const result = [...this.results.values()].filter((r) => r.eventId === eventId && !r.superseded).at(-1) ?? null
    const approval = [...this.approvals.values()].filter((a) => a.eventId === eventId).at(-1) ?? null
    const payment = approval ? ([...this.payments.values()].find((p) => p.approvalId === approval.approvalId) ?? null) : null
    return {
      event: { ...event },
      run: run ? { ...run } : null,
      researchResult: result,
      plan: this.plans.get(eventId) ?? null,
      approval,
      payment,
      attempts: [...this.attempts.values()].filter((a) => a.eventId === eventId),
      progress: this.progress.filter((p) => p.eventId === eventId && p.sequence > afterSequence),
    }
  }
  async updateBrief({ eventId, expectedBriefRevision, brief }: { eventId: string; expectedBriefRevision: number; brief: Brief }) {
    const event = this.events.get(eventId)
    if (!event) return { ok: false as const, reason: 'not_found' as const }
    if (event.briefRevision !== expectedBriefRevision) return { ok: false as const, reason: 'stale_brief' as const }
    const plan = this.plans.get(eventId)
    if (plan && [...this.approvals.values()].some((a) => a.eventId === eventId && a.planRevision === plan.revision)) {
      return { ok: false as const, reason: 'already_approved' as const }
    }
    const previousRun = (await this.getCurrentRun(eventId, 'research')) ?? null
    event.brief = brief
    event.briefRevision += 1
    for (const r of this.results.values()) if (r.eventId === eventId) r.superseded = true
    this.plans.delete(eventId)
    if (previousRun && previousRun.state === 'running') this.runs.get(previousRun.runId)!.state = 'canceled'
    const run = this.newRun(eventId, 'research', event.briefRevision, `${eventId}:research:${event.briefRevision}`)
    return { ok: true as const, event: { ...event }, run: { ...run }, previousRun }
  }
  async setEventStatus(eventId: string, from: readonly Event['status'][], to: Event['status']) {
    const e = this.events.get(eventId)
    if (!e || !from.includes(e.status)) return false
    e.status = to
    return true
  }
  async requestCancel(eventId: string, at: Date) {
    const e = this.events.get(eventId)
    if (!e || e.status === 'canceled') return null
    e.cancelRequestedAt ??= at.toISOString()
    e.status = 'canceling'
    return { ...e }
  }
  async getRun(runId: string) {
    const r = this.runs.get(runId)
    return r ? { ...r } : null
  }
  async getCurrentRun(eventId: string, phase: Run['phase']) {
    const r = [...this.runs.values()].filter((x) => x.eventId === eventId && x.phase === phase).at(-1)
    return r ? { ...r } : null
  }
  async createRun(input: { eventId: string; phase: Run['phase']; briefRevision: number; idempotencyKey: string }) {
    const existing = [...this.runs.values()].find((r) => r.idempotencyKey === input.idempotencyKey)
    if (existing) return { run: { ...existing }, existing: true }
    return { run: { ...this.newRun(input.eventId, input.phase, input.briefRevision, input.idempotencyKey) }, existing: false }
  }
  async setRunSession(runId: string, naiveSessionId: string) {
    this.runs.get(runId)!.naiveSessionId = naiveSessionId
  }
  async claimRunAdvance(runId: string, now: Date, leaseMs: number) {
    const r = this.runs.get(runId)
    if (!r || r.state !== 'running') return null
    if (r.advancingUntil && new Date(r.advancingUntil).getTime() > now.getTime()) return null
    r.advancingUntil = new Date(now.getTime() + leaseMs).toISOString()
    return { ...r }
  }
  async releaseRunAdvance(runId: string, lastSequence: number) {
    const r = this.runs.get(runId)!
    r.advancingUntil = null
    r.lastSequence = Math.max(r.lastSequence, lastSequence)
  }
  async recordCorrection(runId: string) {
    const r = this.runs.get(runId)!
    if (r.correctionsUsed > 0) return false
    r.correctionsUsed = 1
    return true
  }
  async setRunState(runId: string, from: readonly Run['state'][], to: Run['state']) {
    const r = this.runs.get(runId)
    if (!r || !from.includes(r.state)) return false
    r.state = to
    return true
  }
  async publishResearchResult(result: ResearchResult) {
    const run = this.runs.get(result.runId)
    const event = this.events.get(result.eventId)
    if (!run || !event) return { ok: false as const, reason: 'not_found' as const }
    if (this.results.has(run.runId)) return { ok: false as const, reason: 'duplicate' as const }
    if (run.state !== 'running') return { ok: false as const, reason: 'run_not_active' as const }
    if (run.briefRevision !== event.briefRevision || result.briefRevision !== event.briefRevision) {
      return { ok: false as const, reason: 'stale_brief' as const }
    }
    this.results.set(run.runId, structuredClone(result))
    const runState = { success: 'succeeded', partial: 'partial', awaiting_input: 'awaiting_input', failed: 'failed', canceled: 'canceled' } as const
    run.state = runState[result.outcome]
    if (result.outcome === 'awaiting_input') event.status = 'needs_input'
    if (result.outcome === 'failed') event.status = 'failed'
    if (result.outcome === 'canceled') event.status = 'canceled'
    return { ok: true as const }
  }
  async getResearchResult(runId: string) {
    return this.results.get(runId) ?? null
  }
  async savePlan(plan: Plan) {
    const e = this.events.get(plan.eventId)!
    if (e.planRevision >= plan.revision) throw new Error('duplicate plan revision')
    this.plans.set(plan.eventId, plan)
    e.planRevision = plan.revision
  }
  async getPlan(eventId: string) {
    return this.plans.get(eventId) ?? null
  }
  async findOpenApproval(eventId: string, planRevision: number, now: Date) {
    const a = [...this.approvals.values()].find(
      (x) => x.eventId === eventId && x.planRevision === planRevision && x.revokedAt === null && new Date(x.expiresAt) > now,
    )
    if (!a) return null
    const payment = [...this.payments.values()].find((p) => p.approvalId === a.approvalId)!
    return { approval: a, payment }
  }
  async createApproval(approval: Approval, payment: Payment) {
    this.approvals.set(approval.approvalId, { ...approval })
    this.payments.set(payment.paymentId, { ...payment })
  }
  async getApproval(approvalId: string) {
    const a = this.approvals.get(approvalId)
    return a ? { ...a } : null
  }
  async revokeApprovals(eventId: string, at: Date) {
    const out: Approval[] = []
    for (const a of this.approvals.values()) {
      if (a.eventId === eventId && a.revokedAt === null) {
        a.revokedAt = at.toISOString()
        out.push({ ...a })
      }
    }
    return out
  }
  async getPaymentByCheckoutSession(id: string) {
    const p = [...this.payments.values()].find((x) => x.checkoutSessionId === id)
    return p ? { ...p } : null
  }
  async getPaymentByApproval(approvalId: string) {
    const p = [...this.payments.values()].find((x) => x.approvalId === approvalId)
    return p ? { ...p } : null
  }
  async markPaymentPaid(checkoutSessionId: string, paymentIntentId: string) {
    const p = [...this.payments.values()].find((x) => x.checkoutSessionId === checkoutSessionId)
    if (!p || p.state !== 'pending') return null
    p.state = 'paid'
    p.paymentIntentId = paymentIntentId
    return { ...p }
  }
  async markPaymentExpired(checkoutSessionId: string) {
    const p = [...this.payments.values()].find((x) => x.checkoutSessionId === checkoutSessionId)
    if (!p || p.state !== 'pending') return false
    p.state = 'expired'
    return true
  }
  async setRefund(paymentId: string, refund: { refundId: string; refundState: Payment['refundState']; refundReason: string }) {
    Object.assign(this.payments.get(paymentId)!, refund)
  }
  async hasStripeEvent(id: string) { return this.stripeEvents.has(id) }
  async recordStripeEvent(id: string) {
    if (this.stripeEvents.has(id)) return false
    this.stripeEvents.add(id)
    return true
  }
  async claimCommit(attempt: Attempt, now: Date) {
    const event = this.events.get(attempt.eventId)
    const approval = this.approvals.get(attempt.approvalId)
    const payment = [...this.payments.values()].find(p => p.approvalId === attempt.approvalId)
    if (!event || event.cancelRequestedAt || ['canceling', 'canceled'].includes(event.status) ||
        !approval || approval.revokedAt || new Date(approval.expiresAt) <= now || approval.planRevision !== event.planRevision ||
        !approval.actionIds.includes(attempt.actionId) || !payment || payment.state !== 'paid') return null
    return this.insertAttempt(attempt)
  }

  async insertAttempt(attempt: Attempt) {
    const existing = [...this.attempts.values()].find((a) => a.executionKey === attempt.executionKey)
    if (existing) return { attempt: existing, replayed: true }
    this.attempts.set(attempt.attemptId, attempt)
    return { attempt, replayed: false }
  }
  async transitionAttempt(attemptId: string, from: Attempt['state'], to: Attempt['state'], patch: Partial<Attempt>) {
    const a = this.attempts.get(attemptId)
    if (!a || a.state !== from) return null
    Object.assign(a, patch, { state: to })
    return { ...a }
  }
  async listAttempts(eventId: string) {
    return [...this.attempts.values()].filter((a) => a.eventId === eventId)
  }
  async appendProgress(eventId: string, actor: ProgressEntry['actor'], message: string) {
    const e = this.events.get(eventId)!
    e.progressSequence += 1
    const entry = { eventId, sequence: e.progressSequence, actor, message, createdAt: this.iso() }
    this.progress.push(entry)
    return entry
  }
}

export const WEBHOOK_SECRET = 'whsec_test_fake_secret_for_unit_tests'

export class FakeStripe implements StripeLike {
  sessions = new Map<string, CheckoutSessionLike>()
  createCalls: { params: CheckoutCreateParams; idempotencyKey: string }[] = []
  expired: string[] = []
  refundCalls: { params: RefundCreateParams; idempotencyKey: string }[] = []
  private real = createStripeAdapter(undefined)
  checkout = {
    sessions: {
      create: async (params: CheckoutCreateParams, opts: { idempotencyKey: string }) => {
        this.createCalls.push({ params, idempotencyKey: opts.idempotencyKey })
        const id = `cs_test_${this.createCalls.length}`
        const s: CheckoutSessionLike = {
          id,
          url: `https://checkout.stripe.test/${id}`,
          expires_at: params.expires_at,
          amount_total: params.line_items.reduce((sum, l) => sum + l.price_data.unit_amount * l.quantity, 0),
          currency: params.line_items[0].price_data.currency,
          metadata: params.metadata,
          payment_status: 'unpaid',
          payment_intent: null,
        }
        this.sessions.set(id, s)
        return s
      },
      retrieve: async (id: string) => this.sessions.get(id)!,
      expire: async (id: string) => {
        this.expired.push(id)
        return this.sessions.get(id)!
      },
    },
  }
  refunds = {
    create: async (params: RefundCreateParams, opts: { idempotencyKey: string }) => {
      this.refundCalls.push({ params, idempotencyKey: opts.idempotencyKey })
      return { id: `re_test_${this.refundCalls.length}`, status: 'pending' }
    },
  }
  webhooks = {
    constructEventAsync: (payload: string, header: string, secret: string) => this.real.webhooks.constructEventAsync(payload, header, secret),
  }
}

export function makeDeps(overrides: Partial<Deps> & { clock?: { t: Date } } = {}) {
  const { clock: givenClock, ...rest } = overrides
  const clock = givenClock ?? { t: new Date('2026-11-08T01:00:00.000Z') }
  const now = () => new Date(clock.t)
  const store = new MemoryStore(now)
  const stripe = new FakeStripe()
  const customer = { id: 'user_alice' }
  const confirmed: unknown[] = []
  const cancellations: unknown[] = []
  const research: ResearchPort = rest.research ?? simulatedResearchPort
  const deps: Deps = {
    store,
    stripe,
    now,
    research,
    requireCustomerId: async () => customer.id,
    hooks: {
      onPaymentConfirmed: async (i) => void confirmed.push(i),
      startSupplierCancellation: async (i) => void cancellations.push(i),
    },
    config: {
      appUrl: 'http://localhost:3000',
      stripeWebhookSecret: WEBHOOK_SECRET,
      paymentMode: 'test',
      executionMode: 'simulated',
      advanceLeaseMs: 30_000,
    },
    ...rest,
  }
  return { deps, store, stripe, customer, clock, confirmed, cancellations }
}

export const validBrief: Brief = {
  eventType: 'birthday',
  location: 'San Francisco, CA',
  startsAt: '2026-12-12T02:00:00.000Z',
  timezone: 'America/Los_Angeles',
  headcount: 20,
  budget: 50000,
  currency: 'usd',
  supplyNeeds: ['paper plates'],
  maximumCancellationLoss: 1000,
}
