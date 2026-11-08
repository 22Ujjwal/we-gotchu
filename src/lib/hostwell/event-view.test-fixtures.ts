import { EventView, bookedEvent, canceledEvent, planReadyEvent } from '../../contracts'
import { researchConsumerFixtures } from '../../agent/integration.test-fixtures'

// Controlled customer HTTP responses only; never import these into production screens.
export type EventViewScenario = 'running' | 'partial' | 'failed' | 'missingInput' |
  'planReady' | 'awaitingPayment' | 'booked' | 'canceling' | 'refundPending' | 'refundCompleted'

export function createEventViewFixture(scenario: EventViewScenario, identity: {
  eventId?: string
  customerId?: string
  briefRevision?: number
} = {}): EventView {
  const base = ['refundPending', 'refundCompleted'].includes(scenario) ? canceledEvent
    : ['booked', 'awaitingPayment', 'canceling'].includes(scenario) ? bookedEvent : planReadyEvent
  const view = structuredClone(base)
  const eventId = identity.eventId ?? 'evt_ui_1'
  const briefRevision = identity.briefRevision ?? 1
  const runId = `${eventId}:research:${briefRevision}`
  const timestamp = '2026-11-08T02:00:00.000Z'
  const researchOnly = ['running', 'partial', 'failed', 'missingInput'].includes(scenario)

  if (researchOnly) {
    view.plan = null
    view.approval = null
    view.payment = null
    view.attempts = []
    view.event.planRevision = 0
    const result = scenario === 'partial' ? researchConsumerFixtures.partial
      : scenario === 'failed' ? researchConsumerFixtures.failure
        : scenario === 'missingInput' ? researchConsumerFixtures.missing : null
    view.researchResult = result ? structuredClone(result) : null
    view.event.status = scenario === 'running' ? 'researching' : scenario === 'partial' ? 'researched'
      : scenario === 'missingInput' ? 'needs_input' : 'failed'
    view.run!.state = scenario === 'running' ? 'running' : scenario === 'partial' ? 'partial'
      : scenario === 'missingInput' ? 'awaiting_input' : 'failed'
    view.run!.lastSequence = scenario === 'running' ? 0 : 7
    view.run!.naiveSessionId = scenario === 'running' ? null : `${eventId}:session`
    view.progress = [{ eventId, sequence: 1, actor: 'agent', createdAt: timestamp,
      message: scenario === 'running' ? 'Comparing retrieved candidates.'
        : scenario === 'partial' ? 'Research is partial; final costs remain unknown.'
          : scenario === 'missingInput' ? 'More information needed: location.' : 'Research failed. Revise the brief to retry.' }]
  }

  if (scenario === 'awaitingPayment') {
    view.event.status = 'awaiting_payment'
    view.payment!.state = 'pending'
    view.payment!.paymentIntentId = null
    view.attempts = []
    view.progress = structuredClone(planReadyEvent.progress)
    view.progress.push({ eventId, sequence: 4, actor: 'customer', createdAt: timestamp,
      message: 'Approved plan revision 1; awaiting payment.' })
  }
  if (scenario === 'canceling') {
    view.event.status = 'canceling'
    view.event.cancelRequestedAt = timestamp
    view.progress.push({ eventId, sequence: 7, actor: 'customer', createdAt: timestamp, message: 'Requested cancellation.' })
  }
  if (scenario === 'refundCompleted') {
    view.payment!.refundState = 'succeeded'
    view.progress.push({ eventId, sequence: 10, actor: 'system', createdAt: timestamp,
      message: 'Refund completed; provider status is succeeded.' })
  }

  view.event = { ...view.event, eventId, customerId: identity.customerId ?? 'customer_ui_1', briefRevision,
    progressSequence: view.progress.at(-1)!.sequence }
  view.run = { ...view.run!, eventId, runId, briefRevision, idempotencyKey: runId }
  if (view.researchResult) Object.assign(view.researchResult, { eventId, runId, briefRevision })
  if (view.plan) {
    Object.assign(view.plan, { eventId, runId, briefRevision, planId: `${eventId}:plan:${view.plan.revision}` })
    for (const action of view.plan.actions) action.actionId = `${eventId}:${action.actionId}`
  }
  if (view.approval) Object.assign(view.approval, {
    eventId, approvalId: `${eventId}:approval`, planId: view.plan!.planId,
    planRevision: view.plan!.revision, actionIds: view.plan!.actions.map(action => action.actionId),
  })
  if (view.payment) Object.assign(view.payment, { paymentId: `${eventId}:payment`, approvalId: view.approval!.approvalId,
    checkoutSessionId: `${eventId}:checkout`, paymentIntentId: view.payment.paymentIntentId ? `${eventId}:intent` : null,
    refundId: view.payment.refundId ? `${eventId}:refund` : null })
  for (const attempt of view.attempts) {
    attempt.eventId = eventId
    attempt.attemptId = `${eventId}:${attempt.attemptId}`
    attempt.actionId = `${eventId}:${attempt.actionId}`
    attempt.approvalId = view.approval!.approvalId
    attempt.executionKey = `${attempt.approvalId}:${attempt.actionId}:${attempt.kind}`
  }
  for (const entry of view.progress) entry.eventId = eventId
  return EventView.parse(view)
}
