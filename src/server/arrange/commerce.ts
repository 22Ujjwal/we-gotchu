import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { LedgerRefusal, type Db } from './ledger'
import { arrangeCommerce, arrangeEvents, arrangeMailOperations, arrangeMailReceipts, arrangeSupplierContacts, arrangeSupplierTerms } from './tables'
import { emptyCommerce, offerLineSchema, optionSchema, type CommerceFacts, type OfferLine, type PaymentFact } from './commerce-types'

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '')}`
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
function fail(code: string, message: string): never { throw new LedgerRefusal(code, message) }

// One event lock serializes choice, offer, approval and payment changes.
// The JSON document holds independent facts, not a mutable workflow status.
export function createCommerceLedger(db: Db, now: () => Date) {
  async function readCommerce(eventId: string): Promise<CommerceFacts> {
    const [row] = await db.select().from(arrangeCommerce).where(eq(arrangeCommerce.eventId, eventId))
    return row?.facts ?? emptyCommerce()
  }
  type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
  async function change<T>(eventId: string, customerId: string | null, run: (facts: CommerceFacts, event: typeof arrangeEvents.$inferSelect, tx: Tx) => Promise<T> | T): Promise<T> {
    return db.transaction(async tx => {
      const [event] = await tx.select().from(arrangeEvents).where(eq(arrangeEvents.id, eventId)).for('update')
      if (!event || (customerId !== null && event.customerId !== customerId)) fail('not_found', 'We could not find that event.')
      const [row] = await tx.select().from(arrangeCommerce).where(eq(arrangeCommerce.eventId, eventId))
      const facts = row?.facts ?? emptyCommerce()
      const result = await run(facts, event, tx)
      await tx.insert(arrangeCommerce).values({ eventId, facts }).onConflictDoUpdate({ target: arrangeCommerce.eventId, set: { facts } })
      return result
    })
  }
  return {
    readCommerce,
    publishOptions(eventId: string, operationKey: string, input: unknown) {
      return change(eventId, null, async (facts, _event, tx) => {
        const parsed = z.array(optionSchema).min(1).max(3).safeParse(input)
        if (!parsed.success || new Set(parsed.data.map(o => o.id)).size !== parsed.data.length) fail('invalid_options', 'Each option needs a source, supplier contacts, and a clear distinction between known and missing terms.')
        const options = parsed.data
        if (facts.researchKey === operationKey) {
          if (JSON.stringify(facts.options) !== JSON.stringify(options)) fail('key_conflict', 'This research key already identifies different options.')
          return { options: facts.options }
        }
        if (facts.choice) fail('choice_locked', 'The customer has already chosen an option.')
        const contacts = await tx.select().from(arrangeSupplierContacts).where(eq(arrangeSupplierContacts.eventId, eventId))
        if (options.some(o => o.contactIds.some(c => !contacts.some(contact => contact.id === c)))) fail('contact_not_on_event', 'An option refers to a supplier outside this event.')
        facts.options = options
        facts.researchKey = operationKey
        return { options }
      })
    },
    chooseOption(customerId: string, eventId: string, optionId: string) {
      return change(eventId, customerId, facts => {
        const option = facts.options.find(o => o.id === optionId)
        if (!option) fail('unknown_option', 'Please choose one of the available options.')
        if (facts.choice && facts.choice.optionId !== optionId) fail('choice_locked', 'We have already started arranging your chosen option.')
        if (!facts.choice) {
          facts.choice = { optionId, chosenAt: now().toISOString() }
          facts.deliveries.push({ id: `choice:${eventId}`, kind: 'choice', message: `The customer chose ${optionId} on event ${eventId}. Read the event and contact the selected suppliers to obtain complete terms.`, delivered: false })
        }
        return facts.choice
      })
    },
    proposeOffer(eventId: string, operationKey: string, input: unknown) {
      return change(eventId, null, async (facts, event, tx) => {
        const existing = facts.offers.find(o => o.operationKey === operationKey)
        const parsed = z.array(offerLineSchema).min(1).max(20).safeParse(input)
        if (!parsed.success) fail('invalid_offer', 'Every offer line needs a quantity, price evidence, deposit terms and cancellation terms.')
        if (existing) {
          const original = existing.lines.map(({ description, quantity, priceTermId, depositTermId, cancellationTermId }) => ({ description, quantity, priceTermId, depositTermId, cancellationTermId }))
          if (JSON.stringify(original) !== JSON.stringify(parsed.data)) fail('key_conflict', 'This offer key already identifies a different offer.')
          return existing
        }
        if (facts.checkout || facts.payment) fail('checkout_locked', 'An approved checkout already exists. Its offer cannot be replaced.')
        const chosen = facts.options.find(o => o.id === facts.choice?.optionId)
        if (!chosen) fail('choice_required', 'The customer must choose an option before we prepare the offer.')
        const terms = await tx.select().from(arrangeSupplierTerms).where(eq(arrangeSupplierTerms.eventId, eventId))
        const receipts = await tx.select().from(arrangeMailReceipts).where(eq(arrangeMailReceipts.eventId, eventId))
        const lines: OfferLine[] = parsed.data.map(line => {
          const price = terms.find(t => t.id === line.priceTermId)
          const deposit = terms.find(t => t.id === line.depositTermId)
          const cancellation = terms.find(t => t.id === line.cancellationTermId)
          if (!price || !deposit || !cancellation || price.amountMinor === null || price.amountMinor <= 0 || price.currency !== event.brief.budget.currency) fail('invalid_offer', 'Every line needs a positive price and supplier evidence in the event currency.')
          const source = receipts.find(r => r.id === price.receiptId)!
          if (!chosen.contactIds.includes(source.contactId!) || [deposit, cancellation].some(t => receipts.find(r => r.id === t.receiptId)?.contactId !== source.contactId)) fail('invalid_offer', 'Price, deposit and cancellation evidence must belong to the selected supplier.')
          if (deposit.term !== 'deposit' || cancellation.term !== 'cancellation') fail('invalid_offer', 'Use the recorded deposit and cancellation terms.')
          const totalMinor = line.quantity * price.amountMinor
          if (!Number.isSafeInteger(totalMinor)) fail('invalid_offer', 'The line amount is too large.')
          return { ...line, contactId: source.contactId!, unitAmountMinor: price.amountMinor, totalMinor, currency: price.currency!, priceExcerpt: price.excerpt, deposit: deposit.excerpt, cancellation: cancellation.excerpt, messageIds: [...new Set([price, deposit, cancellation].map(t => receipts.find(r => r.id === t.receiptId)!.messageId))] }
        })
        if (chosen.contactIds.some(c => !lines.some(l => l.contactId === c))) fail('invalid_offer', 'The offer must include every selected supplier.')
        const totalMinor = lines.reduce((sum, line) => sum + line.totalMinor, 0)
        if (!Number.isSafeInteger(totalMinor)) fail('invalid_offer', 'The offer amount is too large.')
        const offer = { id: id('off'), operationKey, version: facts.offers.length + 1, lines, totalMinor, currency: event.brief.budget.currency, overBudgetMinor: Math.max(0, totalMinor - event.brief.budget.amountMinor), createdAt: now().toISOString() }
        facts.offers.push(offer)
        delete facts.approval
        facts.notifications.push({ id: `offer:${offer.id}`, kind: 'offer_ready', offerId: offer.id, state: 'pending' })
        return offer
      })
    },
    approveOffer(customerId: string, eventId: string, offerId: string, acceptOverage: boolean) {
      return change(eventId, customerId, facts => {
        const offer = facts.offers.at(-1)
        if (!offer || offer.id !== offerId) fail('stale_offer', 'Please review the latest offer before approving it.')
        if (offer.overBudgetMinor > 0 && !acceptOverage) fail('over_budget', 'This offer is above your budget. Please explicitly accept the extra amount.')
        if (facts.approval?.offerId !== offerId) facts.approval = { id: id('apr'), offerId, approvedAt: now().toISOString(), acceptedOverage: acceptOverage }
        return facts.approval
      })
    },
    authorizeCheckout(customerId: string, eventId: string, offerId: string) {
      return change(eventId, customerId, facts => {
        const offer = facts.offers.at(-1)
        if (!offer || offer.id !== offerId || facts.approval?.offerId !== offerId) fail('offer_not_approved', 'Approve the current offer before paying.')
        if (!facts.checkout) facts.checkout = { id: id('chk'), offerId, approvalId: facts.approval.id, amountMinor: offer.totalMinor, currency: offer.currency }
        return facts.checkout
      })
    },
    recordCheckout(eventId: string, operationId: string, sessionId: string, url: string, expiresAt: number) {
      return change(eventId, null, facts => {
        const checkout = facts.checkout
        if (!checkout || checkout.id !== operationId || (checkout.sessionId && checkout.sessionId !== sessionId)) fail('checkout_conflict', 'This checkout does not match its authorized operation.')
        Object.assign(checkout, { sessionId, url, expiresAt })
        return checkout
      })
    },
    recordPayment(eventId: string, payment: Omit<PaymentFact, 'receivedAt'>) {
      return change(eventId, null, facts => {
        const checkout = facts.checkout
        if (!checkout || checkout.sessionId !== payment.checkoutId || checkout.id !== payment.operationId || checkout.amountMinor !== payment.amountMinor || checkout.currency !== payment.currency) fail('payment_mismatch', 'The payment does not match the approved checkout.')
        if (facts.payment) {
          if (facts.payment.checkoutId !== payment.checkoutId || facts.payment.paymentIntentId !== payment.paymentIntentId) fail('payment_mismatch', 'A different payment was already recorded.')
          return facts.payment
        }
        facts.payment = { ...payment, receivedAt: now().toISOString() }
        facts.deliveries.push({ id: `payment:${checkout.id}`, kind: 'payment', message: `Payment received for event ${eventId}. Read the approved offer and ask each supplier to confirm the agreed details. Payment is not supplier confirmation.`, delivered: false })
        return facts.payment
      })
    },
    recordConfirmation(eventId: string, contactId: string, messageId: string, excerpt: string) {
      return change(eventId, null, async (facts, _event, tx) => {
        if (!facts.payment) fail('not_paid', 'A supplier confirmation can only be recorded after payment.')
        const offer = facts.offers.find(o => o.id === facts.checkout?.offerId)!
        if (!offer.lines.some(l => l.contactId === contactId)) fail('contact_not_on_event', 'This supplier is not in the paid offer.')
        const [receipt] = await tx.select().from(arrangeMailReceipts).where(and(eq(arrangeMailReceipts.eventId, eventId), eq(arrangeMailReceipts.contactId, contactId), eq(arrangeMailReceipts.messageId, messageId)))
        const [request] = receipt?.operationId ? await tx.select().from(arrangeMailOperations).where(eq(arrangeMailOperations.id, receipt.operationId)) : []
        if (!receipt || !request?.sentAt || request.sentAt.getTime() < new Date(facts.payment.receivedAt).getTime() || receipt.receivedAt.getTime() < new Date(facts.payment.receivedAt).getTime()) fail('confirmation_not_after_payment', 'Confirmation must reply to a supplier request sent after payment.')
        if (!normalize(excerpt) || !normalize(receipt.reply?.text ?? '').includes(normalize(excerpt))) fail('excerpt_not_in_message', 'Quote the supplier confirmation exactly.')
        const existing = facts.confirmations.find(c => c.contactId === contactId)
        if (!existing) facts.confirmations.push({ contactId, messageId, excerpt, confirmedAt: now().toISOString() })
        if (offer.lines.every(l => facts.confirmations.some(c => c.contactId === l.contactId)) && !facts.notifications.some(n => n.kind === 'confirmed')) facts.notifications.push({ id: `confirmed:${offer.id}`, kind: 'confirmed', offerId: offer.id, state: 'pending' })
        return facts.confirmations.find(c => c.contactId === contactId)!
      })
    },
    recordDelivery(eventId: string, deliveryId: string) {
      return change(eventId, null, facts => { const delivery = facts.deliveries.find(d => d.id === deliveryId); if (delivery) delivery.delivered = true })
    },
    answerQuestion(customerId: string, eventId: string, operationKey: string, answer: string) {
      return change(eventId, customerId, facts => {
        if (!answer.trim() || answer.length > 2000) fail('invalid_answer', 'Please write a short reply.')
        const deliveryId = `answer:${eventId}:${operationKey}`
        const message = `Customer reply for event ${eventId}: ${answer.trim()}`
        const existing = facts.deliveries.find(d => d.id === deliveryId)
        if (existing && existing.message !== message) fail('key_conflict', 'This reply key was already used.')
        if (!existing) facts.deliveries.push({ id: deliveryId, kind: 'answer', message, delivered: false })
        return { received: true }
      })
    },
    claimNotification(eventId: string, notificationId: string) {
      return change(eventId, null, facts => {
        const notification = facts.notifications.find(n => n.id === notificationId)
        if (!notification || notification.state !== 'pending') return null
        notification.state = 'unknown'
        return notification
      })
    },
    recordNotification(eventId: string, notificationId: string, messageId: string) {
      return change(eventId, null, facts => {
        const notification = facts.notifications.find(n => n.id === notificationId)
        if (notification) Object.assign(notification, { state: 'sent', messageId })
      })
    },
  }
}
