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
