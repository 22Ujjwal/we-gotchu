import type { PlanningRecord, PlanningRepository } from './repository'
import type { SupplierMailTransport } from './supplier-mail'
import type { MailProvider } from '../email/supplier-inquiries/types'
import { sendCustomerNotification } from './customer-notifications'

export async function sendVendorNote(repository: PlanningRepository, transport: SupplierMailTransport,
  record: PlanningRecord, recipient: string, note: { key: string; subject: string; text: string; requestId?: string }) {
  const inquiry = record.view.inquiry
  if (!record.view.arrangement?.controlled || !inquiry || inquiry.recipient !== recipient
    || record.view.arrangement.inquiryId !== inquiry.id) return undefined
  const current = await repository.get(record.customerId, record.id)
  if (!current || current.view.inquiry?.id !== inquiry.id) return undefined
  const existing = current.vendorNotes?.[note.key]
  if (existing?.result?.status === 'accepted' || existing?.result?.status === 'failed') return existing.result
  const content = existing?.content ?? { to: recipient, subject: note.subject, text: note.text,
    replyToMessageId: inquiry.replies?.at(-1)?.message.messageId }
  if (!existing && !await repository.compareAndSet(current, { ...current,
    vendorNotes: { ...current.vendorNotes, [note.key]: { content } } })) return undefined
  // Keep the original reply target; the transport ledger owns send reservation and recovery.
  const result = await transport.sendInquiry({ requestId: note.requestId ?? `vendor:${record.id}:${note.key}`,
    conversationId: record.id, inquiryId: inquiry.id, draftRevision: inquiry.revision, ...content })
  for (let attempt = 0; attempt < 4; attempt++) {
    const latest = await repository.get(record.customerId, record.id)
    if (!latest) break
    if (await repository.compareAndSet(latest, { ...latest,
      vendorNotes: { ...latest.vendorNotes, [note.key]: { content, result } } })) break
  }
  return result
}

export async function finishVendorConfirmation(repository: PlanningRepository, provider: MailProvider,
  record: PlanningRecord, appUrl: string): Promise<void> {
  const booking = record.vendorBooking
  const reply = record.view.inquiry?.replies?.at(-1)
  const delivery = booking && record.vendorNotes?.[booking.noteKey]?.result
  if (!booking || !reply || reply.status !== 'ready' || delivery?.status !== 'accepted') return
  const linked = reply.message.inReplyTo === delivery.messageId || reply.message.references?.includes(delivery.messageId)
  if (!linked || reply.interpretation?.kind !== 'confirmation') return
  // The interpreter retains the supplier's evidence; a quote or acknowledgment is not a booking confirmation.
  let confirmed = record
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await repository.get(record.customerId, record.id)
    if (!current?.vendorBooking || current.vendorBooking.paymentId !== booking.paymentId || !current.view.arrangement) return
    if (current.vendorBooking.confirmedReplyId) { confirmed = current; break }
    const saved = await repository.compareAndSet(current, { ...current,
      vendorBooking: { ...current.vendorBooking, confirmedReplyId: reply.id },
      view: { ...current.view, version: current.view.version + 1, arrangement: { ...current.view.arrangement,
        status: 'vendor_confirmed', detail: 'The demo supplier confirmed your arrangement.' } } })
    if (saved) { confirmed = saved; break }
  }
  if (confirmed.vendorBooking?.confirmedReplyId !== reply.id) return
  await sendCustomerNotification(repository, provider, confirmed, `${booking.paymentId}:vendor-confirmed`, {
    subject: 'Your supplier has confirmed your arrangement',
    text: [reply.interpretation.summary, 'This is a simulated supplier confirmation for the demo. No real reservation or purchase has been made.',
      `View your arrangement: ${appUrl.replace(/\/$/, '')}/planning/${encodeURIComponent(record.id)}`].join('\n\n'),
  })
}

// The approval is tied to an immutable offer revision; the reply must target its confirmation request.
export async function requestOfferConfirmation(repository: PlanningRepository, transport: SupplierMailTransport,
  record: PlanningRecord, recipient: string): Promise<void> {
  const offer = record.view.offer
  const approval = record.view.offerApproval
  if (!offer || approval?.offerId !== offer.id || approval.offerRevision !== offer.revision || record.view.paymentLink
    || record.view.arrangement?.status !== 'awaiting_offer_confirmation') return
  const { calculateOfferCosts } = await import('../../agent/planning/offer-contract')
  const { formatPaymentAmount } = await import('../../lib/payment-money')
  const costs = calculateOfferCosts(offer)
  if (!costs.ok || offer.missing.length) return
  const money = (amount: number) => formatPaymentAmount(amount, offer.currency)
  const key = `hold:${offer.id}:${offer.revision}`
  await sendVendorNote(repository, transport, record, recipient, {
    key, subject: `Please confirm approved terms for ${record.view.selections.find(option => option.kind === 'venue')?.name ?? 'our event'}`,
    text: [
      'The customer approved the following offer. Before payment, please confirm availability and that every term below remains unchanged.',
      `${offer.brief.startsAt}, ${offer.brief.timezone}, ${offer.brief.headcount} guests.`,
      ...offer.lines.map((line, index) => `${line.option.name}: ${line.quantityDescription}. Line total ${money(costs.amounts[index])}. Deposit ${money(line.deposit.amount!)} ${line.deposit.treatment}. Cancellation: ${line.cancellationTerms}`),
      `Total including all quoted charges: ${money(costs.total)}.`,
      'Please reply in this thread with confirmation of the unchanged terms and availability, or explain any changes. Can you hold this offer while the customer completes payment?',
      'This requests confirmation only. No payment or binding reservation is authorized.',
    ].join('\n\n'),
  })
}

export async function processSupplierDecision(repository: PlanningRepository, provider: MailProvider,
  record: PlanningRecord, appUrl: string): Promise<void> {
  const reply = record.view.inquiry?.replies?.at(-1)
  const arrangement = record.view.arrangement
  if (!reply || reply.status !== 'ready' || !arrangement?.controlled || arrangement.status === 'stale' || record.view.paymentLink) return
  const interpretation = reply.interpretation
  const link = `${appUrl.replace(/\/$/, '')}/planning/${encodeURIComponent(record.id)}`
  if (interpretation?.kind === 'question' || interpretation?.kind === 'refusal') {
    const text = `${interpretation.summary}\n\n${interpretation.nextAction}`
    const current = await repository.getById(record.id)
    if (!current || current.view.inquiry?.replies?.at(-1)?.id !== reply.id) return
    const saved = current.view.supplierQuestion?.replyId === reply.id ? current
      : await repository.compareAndSet(current, { ...current, view: { ...current.view, version: current.view.version + 1,
        supplierQuestion: { replyId: reply.id, text }, offerApproval: undefined } })
    if (!saved) throw new Error('The supplier question changed before it could be saved.')
    await sendCustomerNotification(repository, provider, saved, `${arrangement.id}:question:${reply.id}`, {
      subject: 'Your arrangement needs your input', text: `${text}\n\nReview and answer securely: ${link}\n\nNo payment or booking has been made.`,
    })
    return
  }
  const approval = record.view.offerApproval
  const offer = record.view.offer
  if (!offer || approval?.offerId !== offer.id || approval.offerRevision !== offer.revision
    || interpretation?.kind !== 'confirmation' || interpretation.confirmsApprovedOffer !== true || interpretation.missing.length
    || !interpretation.facts.some(fact => fact.field === 'availability')
    || Date.parse(reply.message.receivedAt) < Date.parse(approval.approvedAt)) return
  const sent = record.vendorNotes?.[`hold:${offer.id}:${offer.revision}`]?.result
  if (sent?.status !== 'accepted' || !(reply.message.inReplyTo === sent.messageId || reply.message.references?.includes(sent.messageId))) return
  const saved = approval.confirmedReplyId === reply.id ? record : await repository.compareAndSet(record, { ...record,
    view: { ...record.view, version: record.view.version + 1, offerApproval: { ...approval, confirmedReplyId: reply.id },
      arrangement: { ...arrangement, status: 'offer_ready', detail: 'The supplier confirmed your approved terms and availability. You can now continue to sandbox payment.' } } })
  if (!saved) throw new Error('The approved offer changed before confirmation was saved.')
  await sendCustomerNotification(repository, provider, saved, `${arrangement.id}:payment-ready:${offer.id}:${offer.revision}`, {
    subject: 'Your approved arrangement is ready for payment',
    text: `The supplier confirmed the terms and availability for your approved offer.\n\nContinue to sandbox payment: ${link}\n\nNo payment or real booking has been made.`,
  })
}
