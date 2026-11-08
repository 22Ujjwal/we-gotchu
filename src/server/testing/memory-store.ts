import type { Approval, Attempt, Event, EventView, Payment, Plan, ProgressEntry } from '../../contracts'
import type { Store } from '../store'

// Small in-memory Store for tests of the execution and MCP layers. It
// implements only what those layers use; the rest throws.

export class MemoryStore implements Store {
  events = new Map<string, Event>()
  plans = new Map<string, Plan>()
  approvals: Approval[] = []
  payments: Payment[] = []
  attempts: Attempt[] = []
  progress: ProgressEntry[] = []

  seed(input: { event: Event; plan?: Plan; approval?: Approval; payment?: Payment }): void {
    this.events.set(input.event.eventId, structuredClone(input.event))
    if (input.plan) this.plans.set(input.event.eventId, structuredClone(input.plan))
    if (input.approval) this.approvals.push(structuredClone(input.approval))
    if (input.payment) this.payments.push(structuredClone(input.payment))
  }

  async getEvent(eventId: string) {
    return structuredClone(this.events.get(eventId) ?? null)
  }

  async getEventView(eventId: string, afterSequence = 0): Promise<EventView | null> {
    const event = this.events.get(eventId)
    if (!event) return null
    const approval = [...this.approvals].reverse().find((a) => a.eventId === eventId) ?? null
    return structuredClone({
      event,
      run: null,
      researchResult: null,
      plan: this.plans.get(eventId) ?? null,
      approval,
      payment: approval ? (this.payments.find((p) => p.approvalId === approval.approvalId) ?? null) : null,
      attempts: this.attempts.filter((a) => a.eventId === eventId),
      progress: this.progress.filter((p) => p.eventId === eventId && p.sequence > afterSequence),
    })
  }

  async setEventStatus(eventId: string, from: readonly Event['status'][], to: Event['status']) {
    const event = this.events.get(eventId)
    if (!event || !from.includes(event.status)) return false
    event.status = to
    return true
  }

  async requestCancel(eventId: string, at: Date) {
    const event = this.events.get(eventId)
    if (!event || event.status === 'canceled') return null
    event.cancelRequestedAt ??= at.toISOString()
    event.status = 'canceling'
    return structuredClone(event)
  }

  async getPlan(eventId: string) {
    return structuredClone(this.plans.get(eventId) ?? null)
  }

  async findOpenApproval(eventId: string, planRevision: number, now: Date) {
    const approval = [...this.approvals]
      .reverse()
      .find((a) => a.eventId === eventId && a.planRevision === planRevision && a.revokedAt === null && new Date(a.expiresAt).getTime() > now.getTime())
    const payment = approval && this.payments.find((p) => p.approvalId === approval.approvalId)
    return approval && payment ? structuredClone({ approval, payment }) : null
  }

  async getApproval(approvalId: string) {
    return structuredClone(this.approvals.find((a) => a.approvalId === approvalId) ?? null)
  }

  async listPaidApprovalIds(eventId: string) {
    return this.approvals.filter(a => a.eventId === eventId &&
      this.payments.some(p => p.approvalId === a.approvalId && p.state === 'paid')).map(a => a.approvalId)
  }

  async claimCommit(attempt: Attempt, now: Date) {
    const event = this.events.get(attempt.eventId)
    const approval = this.approvals.find((a) => a.approvalId === attempt.approvalId)
    const payment = this.payments.find(p => p.approvalId === attempt.approvalId)
    if (!event || event.cancelRequestedAt || ['canceling', 'canceled'].includes(event.status) ||
        !approval || approval.revokedAt || new Date(approval.expiresAt) <= now || approval.planRevision !== event.planRevision ||
        !approval.actionIds.includes(attempt.actionId) || !payment || payment.state !== 'paid') return null
    return this.insertAttempt(attempt)
  }

  async insertAttempt(attempt: Attempt) {
    const existing = this.attempts.find((a) => a.executionKey === attempt.executionKey)
    if (existing) return { attempt: structuredClone(existing), replayed: true }
    this.attempts.push(structuredClone(attempt))
    return { attempt: structuredClone(attempt), replayed: false }
  }

  async transitionAttempt(attemptId: string, from: Attempt['state'], to: Attempt['state'], patch: Partial<Attempt>) {
    const attempt = this.attempts.find((a) => a.attemptId === attemptId)
    if (!attempt || attempt.state !== from) return null
    Object.assign(attempt, patch, { state: to, updatedAt: new Date().toISOString() })
    return structuredClone(attempt)
  }

  async listAttempts(eventId: string) {
    return structuredClone(this.attempts.filter((a) => a.eventId === eventId))
  }

  async appendProgress(eventId: string, actor: ProgressEntry['actor'], message: string) {
    const event = this.events.get(eventId)
    if (!event) throw new Error('event not found')
    event.progressSequence += 1
    const entry: ProgressEntry = { eventId, sequence: event.progressSequence, actor, message, createdAt: new Date().toISOString() }
    this.progress.push(entry)
    return structuredClone(entry)
  }

  // Not used by the execution layer.
  createEvent(): never { throw new Error('not implemented') }
  updateBrief(): never { throw new Error('not implemented') }
  getRun(): never { throw new Error('not implemented') }
  getCurrentRun(): never { throw new Error('not implemented') }
  createRun(): never { throw new Error('not implemented') }
  setRunSession(): never { throw new Error('not implemented') }
  claimRunAdvance(): never { throw new Error('not implemented') }
  releaseRunAdvance(): never { throw new Error('not implemented') }
  recordCorrection(): never { throw new Error('not implemented') }
  setRunState(): never { throw new Error('not implemented') }
  publishResearchResult(): never { throw new Error('not implemented') }
  getResearchResult(): never { throw new Error('not implemented') }
  savePlan(): never { throw new Error('not implemented') }
  createApproval(): never { throw new Error('not implemented') }
  revokeApprovals(): never { throw new Error('not implemented') }
  getPaymentByCheckoutSession(): never { throw new Error('not implemented') }
  getPaymentByApproval(): never { throw new Error('not implemented') }
  hasStripeEvent(): never { throw new Error('not implemented') }
  markPaymentPaid(): never { throw new Error('not implemented') }
  repairExpiredCheckout(): never { throw new Error('not implemented') }
  markPaymentExpired(): never { throw new Error('not implemented') }
  setRefund(): never { throw new Error('not implemented') }
  recordStripeEvent(): never { throw new Error('not implemented') }
}
