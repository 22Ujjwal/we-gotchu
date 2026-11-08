import { formatPaymentAmount } from '../../lib/payment-money'
import { calculateOfferCosts } from '../../agent/planning/offer-contract'
import { createHash } from 'node:crypto'
import { SendRejected, type MailProvider } from '../email/supplier-inquiries/types'
import type { PlanningRecord, PlanningRepository } from './repository'

export function eventMailSubject(subject: string, conversationId: string): string {
  const prefix = `[Arrange ${createHash('sha256').update(conversationId).digest('hex').slice(0, 12)}] `
  return subject.startsWith(prefix) ? subject.slice(0, 200) : `${prefix}${subject.slice(0, 200 - prefix.length)}`
}

// Reserve the exact content before sending so a restart never blindly repeats an email.
export async function sendCustomerNotification(repository: PlanningRepository, provider: MailProvider,
  record: PlanningRecord, key: string, email: { subject: string; text: string }): Promise<void> {
  const to = record.view.arrangement?.customerEmail
  if (!to) return
  email = { ...email, subject: eventMailSubject(email.subject, record.id) }
  const notification = { to, ...email, status: 'uncertain' as const }
  let reserved = false
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await repository.get(record.customerId, record.id)
    if (!current || current.notifications?.[key] || current.view.arrangement?.id !== record.view.arrangement?.id) return
    const saved = await repository.compareAndSet(current, { ...current,
      notifications: { ...current.notifications, [key]: notification } })
    if (saved) { reserved = true; break }
  }
  if (!reserved) return
  let result: NonNullable<PlanningRecord['notifications']>[string] = notification
  try {
    const sent = await provider.send({ to, ...email }, `arrange-customer-${createHash('sha256').update(key).digest('hex')}`)
    result = { ...notification, status: 'accepted', messageId: sent.messageId }
  } catch (error) {
    if (error instanceof SendRejected) result = { ...notification, status: 'failed' }
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await repository.get(record.customerId, record.id)
    if (!current) return
    if (await repository.compareAndSet(current, { ...current,
      notifications: { ...current.notifications, [key]: result } })) return
  }
}

export function arrangementAcknowledgment(record: PlanningRecord) {
  const venue = record.view.selections.find(option => option.kind === 'venue')
  return {
    subject: 'We are arranging your event',
    text: [
      `We received your request for ${venue?.name ?? 'your selected setting'}.`,
      'We are checking availability, the selected extras and the final price with the supplier.',
      ...record.view.selections.filter(option => option.kind === 'supply').map(option => `Selected extra: ${option.name}`),
      'We will send you the details to approve before payment. Nothing is booked or charged.',
    ].join('\n\n'),
  }
}

function offerReadyEmail(record: PlanningRecord, total: number, appUrl: string) {
  const offer = record.view.offer!
  const money = formatPaymentAmount(total, offer.currency)
  return {
    subject: 'Your arrangement is ready to review',
    text: [
      'We have the supplier terms for your selected arrangement. Please review them before approving.',
      ...offer.lines.map(line => `${line.option.name}: ${line.quantityDescription}. Cancellation: ${line.cancellationTerms}`),
      `Complete quoted total: ${money}.`,
      ...offer.lines.filter(line => (line.deposit.amount ?? 0) > 0).map(line =>
        `Deposit for ${line.option.name}: ${formatPaymentAmount(line.deposit.amount!, offer.currency)}, ${line.deposit.treatment} in the quoted price.`),
      `Review your offer: ${appUrl.replace(/\/$/, '')}/planning/${encodeURIComponent(record.id)}`,
      'Nothing has been booked or charged. Approve the offer on the website before proceeding to sandbox payment.',
    ].join('\n\n'),
  }
}

export async function notifySupplierOffer(repository: PlanningRepository, record: PlanningRecord,
  provider: MailProvider, appUrl: string): Promise<void> {
  const arrangement = record.view.arrangement
  const offer = record.view.offer
  const reply = record.view.inquiry?.replies?.at(-1)
  if (!arrangement || arrangement.status === 'stale' || record.pending || record.view.paymentLink
    || !offer || offer.replyId !== reply?.id || reply.status !== 'ready') return
  const costs = calculateOfferCosts(offer)
  if (offer.missing.length || !costs.ok || offer.expiresAt && Date.parse(offer.expiresAt) <= Date.now()) {
    const detail = 'We received the supplier reply, but the offer needs clarification before you can approve it.'
    if (arrangement.status !== 'needs_attention' || arrangement.detail !== detail) {
      const saved = await repository.compareAndSet(record, { ...record, view: { ...record.view, version: record.view.version + 1,
        arrangement: { ...arrangement, status: 'needs_attention', detail } } })
      if (!saved) throw new Error('The arrangement changed before the offer status update.')
    }
    return
  }
  const saved = await repository.compareAndSet(record, { ...record, view: { ...record.view, version: record.view.version + 1,
    arrangement: { ...arrangement, status: 'offer_ready', detail: 'The supplier terms are ready. Review the complete offer before approving payment.' } } })
  if (!saved) throw new Error('The arrangement changed before the offer notification.')
  await sendCustomerNotification(repository, provider, saved, `${arrangement.id}:offer:${offer.id}:${offer.revision}`,
    offerReadyEmail(saved, costs.total, appUrl))
}
