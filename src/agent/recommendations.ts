import type { Brief, Candidate, ResearchResult } from '../contracts'
import { assessCosts, packQuantity, type CostComponent } from './recommendation-costs'
import { evidenceFresh, type FreshnessPolicy } from './recommendation-freshness'

const PRODUCT_TOOL = 'monid:channel3/v1/products/{product_id}'
const SUPPORTED_CURRENCIES = ['USD', 'CAD', 'AUD', 'GBP', 'EUR', 'SEK', 'CZK', 'RON', 'CHF']

type Assessment = { candidate: Candidate; group?: string; subtotal: number | null; matched: string[]; unmet: string[]; unchecked: string[] }

function assess(candidate: Candidate, brief: Brief, now: number, policy: FreshnessPolicy): Assessment {
  const result: Assessment = { candidate, subtotal: null, matched: [], unmet: [], unchecked: [
    `Event-date availability for ${brief.startsAt} in ${brief.timezone} is unconfirmed.`,
    `Suitability for ${brief.eventType} in ${brief.location} requires verification.`,
    'Taxes, delivery, and other required charges are unknown.',
    `Cancellation loss within ${brief.maximumCancellationLoss} ${brief.currency} minor units is unconfirmed.`,
  ] }
  if (candidate.evidenceMode === 'simulated') result.unchecked.push('Simulated evidence is not live supplier research.')
  if (candidate.kind === 'venue') result.unchecked.push(`Capacity for ${brief.headcount} guests is unconfirmed.`)
  const terms = candidate.cancellationTerms
  if (terms.known && terms.summary && evidenceFresh(candidate, terms.sourceUrl, 'cancellation', now, policy)) {
    result.matched.push('Sourced cancellation terms are available for review; event applicability is unconfirmed.')
  } else result.unchecked.push('Cancellation terms are missing, stale, or lack current source provenance.')
  if (candidate.kind !== 'supply') {
    result.unchecked.push('A compatible, current event quote or total is unavailable.')
    return result
  }
  // Saved listing calculations must be re-established against the current brief and source age.
  if (candidate.priceProvenance === 'supplier_listing' &&
      (candidate.verification.packSize || candidate.verification.listingPrice)) {
    result.candidate = { ...candidate, priceEstimate: null, quantityInfo: undefined }
  }
  const pack = candidate.verification.packSize
  const price = candidate.verification.listingPrice
  const trusted = (field: typeof pack, type: 'packSize' | 'listingPrice') => field?.status === 'known' &&
    candidate.sources.some(s => s.url === field.sourceUrl && s.tool === PRODUCT_TOOL && s.stage === 'detail') &&
    evidenceFresh(candidate, field.sourceUrl, type, now, policy)
  if (!trusted(pack, 'packSize') || !trusted(price, 'listingPrice')) {
    result.unchecked.push('Pack or listing price evidence is missing, stale, conflicting, or unsupported.')
    return result
  }
  // Parse only the detail adapter's complete generated format, never arbitrary supplier prose.
  const packMatch = pack.note?.match(/^Product key_features: Includes ([1-9][0-9]{0,5}) (plates|cups|napkins)\.?\. Listing evidence only; required packs are not calculated\.$/)
  const priceMatch = price.note?.match(/^Retailer [a-zA-Z0-9.-]+ lists ([0-9]+(?:\.[0-9]+)?) ([A-Za-z]{3}) for one offered product, ([0-9]+) minor units\. Not a delivered total or quote\.$/)
  const unit = packMatch?.[2]
  const needs = unit ? brief.supplyNeeds.filter(need => new RegExp(`\\b${unit}\\b`, 'i').test(need)) : []
  const requestedTypes = needs[0]?.match(/\b(?:plates|cups|napkins)\b/gi) ?? []
  if (!packMatch || !priceMatch || needs.length !== 1 || new Set(requestedTypes.map(type => type.toLowerCase())).size !== 1 || pack.sourceUrl !== price.sourceUrl) {
    result.unchecked.push('No unambiguous supported pack, price, and requested supply match; required quantity remains unknown.')
    return result
  }
  const currency = priceMatch[2].toUpperCase()
  const minor = Number(priceMatch[3])
  const quantity = packQuantity(brief.headcount, Number(packMatch[1]))
  if (!quantity || !SUPPORTED_CURRENCIES.includes(currency) || currency !== brief.currency.toUpperCase() ||
    !Number.isSafeInteger(minor) || Math.abs(Number(priceMatch[1]) * 100 - minor) > 0.000001 ||
    !Number.isSafeInteger(minor * quantity.packs)) {
    result.unchecked.push('Listing currency or amount is incompatible or unsafe; no currency conversion was attempted.')
    return result
  }
  result.group = needs[0]
  result.subtotal = minor * quantity.packs
  result.candidate = { ...candidate, quantityInfo: quantity, priceEstimate: result.subtotal, priceProvenance: 'supplier_listing' }
  result.matched.push(`${quantity.packs} indivisible packs of ${quantity.packSize} provide ${quantity.packs * quantity.packSize} ${unit} for an estimated ${quantity.needed} needed.`)
  result.matched.push(`Listing subtotal is ${result.subtotal} ${currency} minor units before unverified required charges.`)
  result.unchecked.push(`Quantity assumes one per guest for ${needs[0]}; consumption and exact product suitability need confirmation.`)
  if (result.subtotal > brief.budget) result.unmet.push(`Listing subtotal exceeds the ${brief.budget} ${currency} minor-unit budget by ${result.subtotal - brief.budget}.`)
  return result
}

export function explainRecommendations(candidates: Candidate[], ordered: string[], brief: Brief,
  now: number, policy: FreshnessPolicy): Pick<ResearchResult, 'candidates' | 'recommendations' | 'budgetFit' | 'budgetBasis'> {
  const assessments = new Map(candidates.map(c => [c.candidateId, assess(c, brief, now, policy)]))
  const selected = new Map<string, Assessment>()
  const costs: CostComponent[] = [{ amountMinor: null, currency: brief.currency, required: true }]
  const recommendations = ordered.map((id, index) => {
    const a = assessments.get(id)!
    if (a.group) {
      const prior = selected.get(a.group)
      if (!prior) {
        selected.set(a.group, a)
        // Simulated figures remain visible but cannot establish a current budget verdict.
        costs.push({ amountMinor: a.candidate.evidenceMode === 'live' ? a.subtotal : null, currency: brief.currency, required: true })
      } else if (prior.subtotal !== null && a.subtotal !== null) {
        const difference = a.subtotal - prior.subtotal
        const comparison = `Alternative for ${a.group}: ${Math.abs(difference)} ${brief.currency} minor units ${difference > 0 ? 'more' : 'less'} than ${prior.candidate.candidateId}; model preference retained, final costs unknown.`
        if (difference > 0) a.unmet.push(comparison)
        else a.matched.push(comparison)
      }
    }
    return { candidateId: id, rank: index + 1, matched: a.matched, unmet: a.unmet, unchecked: a.unchecked }
  })
  const budget = assessCosts(costs, brief.budget, brief.currency)
  const missingNeeds = brief.supplyNeeds.filter(need => !selected.has(need))
  return {
    candidates: candidates.map(c => assessments.get(c.candidateId)!.candidate), recommendations,
    budgetFit: budget.fit,
    budgetBasis: `Selected first-ranked supply estimates subtotal ${budget.subtotal ?? 'unknown'} ${brief.currency} minor units against budget ${brief.budget}. Selected IDs: ${[...selected.values()].map(a => a.candidate.candidateId).join(', ') || 'none'}. Alternatives are not added together. Venue cost, taxes, delivery, and event suitability remain unknown. ${missingNeeds.length ? `Uncovered supply needs: ${missingNeeds.join(', ')}.` : 'Supply quantities assume one item per guest.'} This is a listing estimate, not a verified quote or final delivered total.`,
  }
}
