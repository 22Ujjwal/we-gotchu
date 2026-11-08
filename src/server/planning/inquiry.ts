import { randomUUID } from 'node:crypto'
import { planningInquirySchema, type PlanningInquiry, type PlanningView } from '../../agent/planning/contract'
import { ApiError } from '../events/errors'

export function prepareInquiry(view: PlanningView, timestamp: number): PlanningInquiry {
  const venue = view.selections.find(option => option.kind === 'venue')
  if (!venue) throw new ApiError(422, 'venue_required', 'Select a venue before preparing an inquiry.')
  const messages = view.messages.filter(message => message.role === 'user')
  // Only use an address explicitly present in published evidence, not an estimated contact.
  const contacts = venue.facts.flatMap(fact => {
    if (fact.basis !== 'published') return []
    const addresses = fact.value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
    return addresses.filter(address => fact.quote.includes(address)).map(address => ({ address, sourceUrl: fact.sourceUrl }))
  })
  const distinct = [...new Set(contacts.map(contact => contact.address.toLowerCase()))]
  const contact = distinct.length === 1 ? contacts[0] : null
  const text = [
    `Hello ${venue.name} team,`, '',
    'We are helping a customer plan an event and would like to ask about your venue.', '',
    'The customer provided these requirements, in order. Later changes replace earlier requests:',
    ...messages.map((message, index) => `${index + 1}. ${message.text}`), '',
    'Could you confirm availability for the requested date and time, capacity, and the all-in price including taxes and required fees?',
    'Please explain any deposit, whether it is included in the total, the cancellation terms, how long your quote is valid, and the next step to reserve.',
    'This is an inquiry only. We are not making a reservation or accepting charges.', '',
    'Thank you,', 'Arrange',
  ].join('\n')
  const parsed = planningInquirySchema.safeParse({
    id: `inquiry_${randomUUID()}`, revision: 1, status: 'draft', venue,
    recipient: contact?.address ?? '', contactSourceUrl: contact?.sourceUrl ?? null,
    subject: `Event inquiry for ${venue.name}`.slice(0, 200), text,
    contextMessageIds: messages.map(message => message.id), updatedAt: new Date(timestamp).toISOString(),
  })
  if (!parsed.success) throw new ApiError(422, 'draft_too_long', 'The conversation is too long for an inquiry. Please prepare a shorter event brief.')
  return parsed.data
}

export function staleInquiry(view: PlanningView): PlanningInquiry | undefined {
  return view.inquiry ? { ...view.inquiry, status: 'stale' } : undefined
}
