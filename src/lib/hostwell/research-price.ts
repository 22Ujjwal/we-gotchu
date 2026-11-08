import type { PlanningOption } from '../../agent/planning/contract'
import { formatPaymentAmount, paymentFractionDigits } from '../payment-money'

type Estimate = { minimum: number; maximum: number; currency: string }
const number = String.raw`\d+(?:,\d{3})*(?:\.\d+)?`
const currency = String.raw`(?:[A-Z]{3}|[$\u20ac\u00a3])`
const money = new RegExp(`(${currency})\\s*(${number})(?:\\s*(?:-|\\u2013|\\u2014|to)\\s*(${currency})?\\s*(${number}))?`, 'g')
const currencyCode = (symbol: string) => ({ '$': 'USD', '\u20ac': 'EUR', '\u00a3': 'GBP' })[symbol] ?? symbol

function amounts(value: string) {
  return [...value.matchAll(money)].flatMap(match => {
    const code = currencyCode(match[1])
    if (match[3] && currencyCode(match[3]) !== code) return []
    const scale = 10 ** paymentFractionDigits(code)
    const minimum = Math.round(Number(match[2].replaceAll(',', '')) * scale)
    const maximum = Math.round(Number((match[4] ?? match[2]).replaceAll(',', '')) * scale)
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) return []
    return [{ minimum, maximum, currency: code, index: match.index!, end: match.index! + match[0].length }]
  })
}

export function formatResearchEstimate(estimate: Estimate): string {
  const minimum = formatPaymentAmount(estimate.minimum, estimate.currency)
  return estimate.minimum === estimate.maximum ? minimum : `${minimum}-${formatPaymentAmount(estimate.maximum, estimate.currency)}`
}

// Saved research predates structured pricing. Only explicit subtotals qualify for addition;
// a rate, budget balance or another option's combined total must never become an item subtotal.
function legacySubtotal(fact: PlanningOption['facts'][number]): Estimate | undefined {
  const found = amounts(fact.value)
  const explicit = found.find(amount => /(?:=|calculates?\s+to|subtotal\s*[:=]?|total\s*[:=]?)\s*$/i.test(fact.value.slice(0, amount.index)))
  const candidate = explicit ?? (/subtotal|total/i.test(fact.label) && found.length === 1 ? found[0] : undefined)
  if (!candidate || /^(?:\s*\/\s*(?:h(?:ou)?r|day|person)|\s+per\s+(?:hour|day|person|item|table))/i.test(fact.value.slice(candidate.end))) return undefined
  return candidate
}

export function researchPrice(option: PlanningOption) {
  const facts = option.facts.filter(fact => /price|cost|total|hire|rate/i.test(fact.label) && amounts(fact.value).length > 0)
  const subtotalFact = facts.find(fact => legacySubtotal(fact))
  const primary = subtotalFact ?? facts[0]
  const pricing = option.pricing
  let estimate: Estimate | undefined
  let quantity = option.kind === 'supply' ? Number(primary?.value.match(/(?:^|\s)(\d+)\s*(?:x|\u00d7)\s*(?:[$\u20ac\u00a3]|[A-Z]{3})/)?.[1] ?? 1) : 1
  if (pricing && pricing.quantity !== null && pricing.maximumUnitAmount >= pricing.minimumUnitAmount) {
    const minimum = Math.round(pricing.minimumUnitAmount * pricing.quantity)
    const maximum = Math.round(pricing.maximumUnitAmount * pricing.quantity)
    if (Number.isSafeInteger(minimum) && Number.isSafeInteger(maximum)) {
      estimate = { minimum, maximum, currency: pricing.currency }
      if (option.kind === 'supply' && pricing.unit === 'item') quantity = pricing.quantity
    }
  } else if (!pricing && subtotalFact) estimate = legacySubtotal(subtotalFact)
  const listed = pricing ? { minimum: pricing.minimumUnitAmount, maximum: pricing.maximumUnitAmount, currency: pricing.currency }
    : primary && amounts(primary.value).length === 1 ? amounts(primary.value)[0] : undefined
  const sources = primary ? [primary, ...facts.filter(fact => fact !== primary)].slice(0, 2) : []
  if (pricing && !sources.some(fact => fact.sourceUrl === pricing.sourceUrl)) sources.unshift({ label: 'Research estimate',
    value: `${formatResearchEstimate(listed!)} per ${pricing.unit}${pricing.quantity === null ? '' : `; quantity ${pricing.quantity}`}.`,
    sourceUrl: pricing.sourceUrl, quote: pricing.quote, basis: 'estimate' })
  return { quantity, estimate, facts: sources,
    amount: estimate ? `${formatResearchEstimate(estimate)} est.` : listed ? `${formatResearchEstimate(listed)} listed` : facts.length ? 'See prices' : 'Quote needed' }
}

export function totalResearchPrices(prices: ReturnType<typeof researchPrice>[]): Estimate | undefined {
  if (!prices.length || prices.some(price => !price.estimate)) return undefined
  const currency = prices[0].estimate!.currency
  if (prices.some(price => price.estimate!.currency !== currency)) return undefined
  const minimum = prices.reduce((sum, price) => sum + price.estimate!.minimum, 0)
  const maximum = prices.reduce((sum, price) => sum + price.estimate!.maximum, 0)
  return Number.isSafeInteger(minimum) && Number.isSafeInteger(maximum) ? { minimum, maximum, currency } : undefined
}
