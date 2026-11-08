import type { Offer, ResearchedOption } from './commerce-types'
import type { EventBrief } from './brief'
import type { EventRecord, Stage } from './ledger'

// What the customer sees. Plain data, no server imports, so the page can share the type.

export type CustomerEventView = {
  id: string
  brief: EventBrief
  stage: Stage
  headline: string
  options: ResearchedOption[]
  chosenOptionId: string | null
  offer: Offer | null
  approvedOfferId: string | null
  payment: { amountMinor: number; currency: string; receivedAt: string } | null
  confirmations: { supplier: string; excerpt: string; confirmedAt: string }[]
  contacts: { id: string; name: string; kind: string; emailsSent: number; replies: number }[]
  terms: { term: string; amountMinor: number | null; currency: string | null; note: string | null; excerpt: string; supplier: string; recordedAt: string }[]
  activity: { at: string; kind: 'email_sent' | 'reply_received' | 'progress' | 'question_for_customer'; text: string }[]
}

export function toCustomerView(event: EventRecord): CustomerEventView {
  const name = new Map(event.contacts.map(c => [c.id, c.name]))
  const sent = event.sent.filter(s => s.state === 'sent' && s.sentAt)
  const activity: CustomerEventView['activity'] = [
    ...sent.map(s => ({ at: s.sentAt!.toISOString(), kind: 'email_sent' as const, text: `We wrote to ${name.get(s.contactId)}: "${s.subject}"` })),
    ...event.received.map(r => ({ at: r.receivedAt.toISOString(), kind: 'reply_received' as const, text: `${name.get(r.contactId)} replied` })),
    ...event.updates.map(u => ({ at: u.createdAt.toISOString(), kind: u.kind, text: u.text })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  return {
    id: event.id,
    brief: event.brief,
    stage: event.stage,
    headline: headline(event, name),
    options: event.commerce.options,
    chosenOptionId: event.commerce.choice?.optionId ?? null,
    offer: event.commerce.offers.at(-1) ?? null,
    approvedOfferId: event.commerce.approval?.offerId ?? null,
    payment: event.commerce.payment ? { amountMinor: event.commerce.payment.amountMinor, currency: event.commerce.payment.currency, receivedAt: event.commerce.payment.receivedAt } : null,
    confirmations: event.commerce.confirmations.map(c => ({ supplier: name.get(c.contactId) ?? 'Supplier', excerpt: c.excerpt, confirmedAt: c.confirmedAt })),
    contacts: event.contacts.map(c => ({
      id: c.id, name: c.name, kind: c.kind,
      emailsSent: sent.filter(s => s.contactId === c.id).length,
      replies: event.received.filter(r => r.contactId === c.id).length,
    })),
    terms: event.terms.map(t => ({
      term: t.term, amountMinor: t.amountMinor, currency: t.currency, note: t.note, excerpt: t.excerpt,
      supplier: name.get(t.contactId) ?? '', recordedAt: t.recordedAt.toISOString(),
    })),
    activity,
  }
}

function headline(event: EventRecord, name: Map<string, string>): string {
  const names = (ids: string[]) => [...new Set(ids)].map(id => name.get(id)).join(' and ')
  const lastReply = event.received.at(-1)
  switch (event.stage) {
    case 'choosing': return 'Your options are ready. Choose the one that feels right.'
    case 'offer_ready': return 'Your complete offer is ready to review.'
    case 'awaiting_payment': return 'You approved the offer. You can now pay securely.'
    case 'paid': return 'Payment received. We are asking each supplier to confirm the details.'
    case 'confirmed': return 'Every supplier in your offer has confirmed by email.'
    case 'getting_started':
      return "We're on it. We're reading your brief and working out who to talk to first."
    case 'contacting_suppliers':
      return `We've written to ${names(event.sent.filter(s => s.state !== 'rejected').map(s => s.contactId))}. We'll let you know as soon as they reply.`
    case 'supplier_replied':
      return `${name.get(lastReply!.contactId)} replied. We're going through what they said.`
    case 'negotiating':
      return `We're working through the details with ${names(event.received.map(r => r.contactId))}.`
  }
}
