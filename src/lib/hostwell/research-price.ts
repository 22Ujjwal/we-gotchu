import type { PlanningOption } from '../../agent/planning/contract'

const money = /(?:\b[A-Z]{3}\s+|[$\u20ac\u00a3])\d+(?:,\d{3})*(?:\.\d+)?/g

// Display sourced wording only. These values never enter offer or payment calculations.
export function researchPrice(option: PlanningOption) {
  const facts = option.facts.filter(fact => /price|cost|subtotal|hire|rate/i.test(fact.label)
    && (fact.value.match(money)?.length ?? 0) > 0)
  const subtotal = facts.find(fact => /subtotal|total/i.test(fact.label)
    && (fact.value.includes('=') || (fact.value.match(money)?.length ?? 0) === 1))
  const primary = subtotal ?? facts[0]
  const amounts = primary?.value.match(money) ?? []
  const equationAmount = subtotal?.value.split('=').at(-1)?.trim().match(money)?.[0]
  const amount = subtotal ? equationAmount ?? amounts[0] : amounts.length === 1 ? amounts[0] : undefined
  const numeric = amount ? Number(amount.replace(/[^0-9.]/g, '')) : NaN
  const quantity = option.kind === 'supply' ? Number(primary?.value.match(/(?:^|\s)(\d+)\s*(?:x|\u00d7)\s*(?:[$\u20ac\u00a3]|[A-Z]{3})/)?.[1] ?? 1) : 1
  return {
    quantity,
    currency: amount?.startsWith('$') ? 'USD' : amount?.match(/^[A-Z]{3}/)?.[0],
    subtotal: subtotal && Number.isFinite(numeric) ? numeric : null,
    amount: amount ? `${amount} ${subtotal ? 'est.' : 'listed'}` : facts.length ? 'See prices' : 'Quote needed',
    facts: primary ? [primary, ...facts.filter(fact => fact !== primary)].slice(0, 2) : [],
  }
}
