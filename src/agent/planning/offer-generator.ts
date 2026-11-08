import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { selectedOfferSchema, type SelectedOffer } from './offer-contract'
import type { PlanningRecord } from '../../server/planning/repository'
import { paymentFractionDigits } from '../../lib/payment-money'

export const supplierOfferInputSchema = selectedOfferSchema.omit({ id: true, revision: true, inquiryId: true, replyId: true,
  contextMessageIds: true, mode: true, lines: true }).extend({
  lines: z.array(selectedOfferSchema.shape.lines.element.omit({ option: true, sourceReplyId: true, sourceQuotes: true })
    .extend({ optionId: z.string().min(1), sourceQuotes: z.array(z.string().min(8)).min(1) })).min(1),
})
export function validateSupplierOffer(record: PlanningRecord, input: unknown): SelectedOffer {
  const inquiry = record.view.inquiry
  const reply = inquiry?.replies?.at(-1)
  if (!inquiry || inquiry.status === 'stale' || reply?.status !== 'ready'
    || !inquiry.replies?.some(item => item.status === 'ready' && ['quote', 'confirmation'].includes(item.interpretation?.kind ?? ''))) throw new Error('A current venue quote is required.')
  const selections = record.view.selections
  if (!selections.some(option => option.id === inquiry.venue.id && option.kind === 'venue')) throw new Error('Select the quoted venue first.')
  const messages = record.view.messages.filter(message => message.role === 'user')
  const extracted = supplierOfferInputSchema.parse(input)
  const customerText = messages.map(message => message.text)
  if (!quotesContainAmount(customerText, extracted.brief.budget, extracted.brief.currency)
    || extracted.brief.maximumCancellationLoss > 0 && !quotesContainAmount(customerText, extracted.brief.maximumCancellationLoss, extracted.brief.currency)) {
    throw new Error('Customer spending limit is not in the saved request.')
  }
  const byId = new Map(selections.map(option => [option.id, option]))
  if (extracted.lines.length !== selections.length || new Set(extracted.lines.map(line => line.optionId)).size !== selections.length) {
    throw new Error('Offer extraction changed the selected options.')
  }
  const lines = extracted.lines.map(({ optionId, ...line }) => {
    const option = byId.get(optionId)
    if (!option) throw new Error('Offer extraction invented an option.')
    const supplierReplies = inquiry.replies ?? []
    const evidence = [...supplierReplies.map(item => item.message.text),
      ...(option.kind === 'supply' ? option.facts.map(fact => fact.quote) : [])]
    if (line.sourceQuotes.some(quote => !evidence.some(source => source.includes(quote)))) throw new Error('Offer quotation is not in the saved evidence.')
    const amounts = [line.unitAmount, line.tax, line.delivery, line.fees, line.deposit?.amount]
    if (amounts.some(amount => amount != null && amount > 0 && !quotesContainAmount(line.sourceQuotes, amount, extracted.currency))) {
      throw new Error('Offer amount is not in the quoted evidence.')
    }
    // Missing charges must not become free merely because extraction supplied zero.
    if (!quotesContainAmount(line.sourceQuotes, 0, extracted.currency)) {
      for (const field of ['unitAmount', 'tax', 'delivery', 'fees'] as const) {
        if (line[field] === 0) line[field] = null
      }
      if (line.deposit.amount === 0) line.deposit = { amount: null, treatment: 'unknown' }
    }
    const sourceReply = [...supplierReplies].reverse().find(item => line.sourceQuotes.every(quote => item.message.text.includes(quote)))
    return { ...line, option, sourceReplyId: sourceReply?.id ?? null }
  })
  return selectedOfferSchema.parse({ ...extracted, lines, id: record.view.offer?.id ?? `offer_${randomUUID()}`,
    revision: (record.view.offer?.revision ?? 0) + 1, inquiryId: inquiry.id, replyId: reply.id,
    contextMessageIds: messages.map(message => message.id), mode: reply.message.mode })
}

function quotesContainAmount(quotes: string[], amount: number, currency: string): boolean {
  const digits = paymentFractionDigits(currency)
  const code = currency.toUpperCase()
  const symbol = ({ USD: '\\$', GBP: '\u00a3', EUR: '\u20ac', JPY: '\u00a5' } as Record<string, string>)[code]
  const prefix = new RegExp(`(?:\\b${code}|${symbol ?? `\\b${code}`})\\s*$`, 'i')
  const suffix = new RegExp(`^\\s*${code}\\b`, 'i')
  // Compare decimal digits as integers; floating point rounding must not make a different price match.
  return quotes.some(quote => [...quote.matchAll(/(?<![\d.,-])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?!\d|[,.]\d)/g)].some(match => {
    const after = quote.slice(match.index + match[0].length)
    if (!(prefix.test(quote.slice(0, match.index)) && !/^\w/.test(after)) && !suffix.test(after)) return false
    const fraction = match[2] ?? ''
    if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) return false
    const minor = BigInt(match[1].replaceAll(',', '')) * 10n ** BigInt(digits)
      + BigInt(fraction.slice(0, digits).padEnd(digits, '0') || '0')
    return minor === BigInt(amount)
  }))
}
