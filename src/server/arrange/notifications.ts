import type { EventRecord } from './ledger'
import type { Notification } from './commerce-types'

export type EventNotificationSender = (input: Notification & { event: EventRecord }) => Promise<{ messageId: string }>

export function createEventNotifications(config: { apiKey: string; inboxId: string; appUrl: string }): EventNotificationSender {
  return async ({ event, kind, offerId, id }) => {
    const { clerkClient } = await import('@clerk/tanstack-react-start/server')
    const user = await clerkClient().users.getUser(event.customerId)
    const email = user.emailAddresses.find(address => address.id === user.primaryEmailAddressId)
    if (!email || email.verification?.status !== 'verified') throw new Error('No verified primary email')
    const offer = event.commerce.offers.find(item => item.id === offerId)!
    const link = new URL(`/arrange/events/${event.id}`, config.appUrl).href
    const total = new Intl.NumberFormat('en', { style: 'currency', currency: offer.currency }).format(offer.totalMinor / 100)
    const content = {
      subject: kind === 'offer_ready' ? 'Your event offer is ready' : 'Your suppliers have confirmed',
      text: [
        kind === 'offer_ready' ? 'Your complete offer is ready to review and approve.' : 'Every supplier in your paid offer has confirmed the details by email.',
        `${event.brief.occasion} in ${event.brief.city}, ${event.brief.date} at ${event.brief.time}, ${event.brief.guests} guests.`,
        ...offer.lines.map(line => `${line.description}: ${line.quantity} at ${line.unitAmountMinor / 100} ${line.currency}. Deposit: ${line.deposit} Cancellation: ${line.cancellation}`),
        `Total: ${total}`,
        `Read the offer and supplier evidence: ${link}`,
        'Supplier email confirmations are recorded on your event page. They do not represent a reservation in an external booking system.',
      ].join('\n\n'),
    }
    const { AgentMailClient } = await import('agentmail')
    const client = new AgentMailClient({ apiKey: config.apiKey })
    const result = await client.inboxes.messages.send(config.inboxId, { to: [email.emailAddress], subject: content.subject, text: content.text }, { headers: { 'Idempotency-Key': id } })
    return { messageId: result.messageId }
  }
}
