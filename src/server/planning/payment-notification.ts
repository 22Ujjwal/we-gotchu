import type { Store } from '../store'
import type { MailProvider } from '../email/supplier-inquiries/types'
import type { PlanningRecord, PlanningRepository } from './repository'
import { sendCustomerNotification } from './customer-notifications'

export async function notifyPlanningPayment(store: Store, repository: PlanningRepository, provider: MailProvider,
  checkoutSessionId: string, appUrl: string, onPaid?: (record: PlanningRecord) => Promise<void>): Promise<void> {
  const payment = await store.getPaymentByCheckoutSession(checkoutSessionId)
  if (!payment || payment.state !== 'paid' || payment.refundState !== 'none') return
  const approval = await store.getApproval(payment.approvalId)
  if (!approval) return
  const event = await store.getEvent(approval.eventId)
  const plan = await store.getPlan(approval.eventId)
  const binding = plan?.planningOffer
  if (!event || !plan || !binding || plan.planId !== approval.planId || plan.revision !== approval.planRevision) return
  const record = await repository.get(event.customerId, binding.conversationId)
  const link = record?.view.paymentLink
  if (!record || !link || link.eventId !== event.eventId || link.offerId !== binding.offerId
    || link.offerRevision !== binding.revision) return
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: payment.currency }).format(payment.amount / 100)
  const simulated = plan.mode === 'simulated'
  let paidRecord: PlanningRecord | undefined
  if (simulated && payment.mode === 'test' && record.view.arrangement?.controlled) {
    let saved = record
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await repository.get(record.customerId, record.id)
      if (!current) return
      if (current.verifiedPayment?.paymentId === payment.paymentId) { saved = current; break }
      const next = await repository.compareAndSet(current, { ...current,
        verifiedPayment: { paymentId: payment.paymentId, checkoutSessionId, amount: payment.amount, currency: payment.currency } })
      if (next) { saved = next; break }
    }
    if (saved.verifiedPayment?.paymentId === payment.paymentId) paidRecord = saved
  }
  await sendCustomerNotification(repository, provider, record, `${payment.paymentId}:confirmation`, {
    subject: 'Your arrangement payment confirmation',
    text: [
      `${payment.mode === 'test' ? 'Stripe sandbox payment received' : 'Payment received'}: ${amount}.`,
      `Payment reference: ${payment.paymentId}.`,
      `Event: ${event.brief.eventType}. Location: ${event.brief.location}.`,
      `Starts: ${new Date(event.brief.startsAt).toLocaleString('en-US', { timeZone: event.brief.timezone })} ${event.brief.timezone}.`,
      ...plan.actions.map(action => `${action.supplierName}: ${action.quantityOrSchedule}.`),
      simulated ? 'Supplier fulfillment is simulated. No real venue reservation or purchase has been made.'
        : 'Payment is confirmed. Check your arrangement for the latest supplier confirmation status.',
      `View your arrangement: ${appUrl.replace(/\/$/, '')}/planning/${encodeURIComponent(record.id)}`,
    ].join('\n\n'),
  })
  // A supplier turn can take minutes; the customer receipt should not wait for it.
  if (paidRecord) await onPaid?.(paidRecord)
}
