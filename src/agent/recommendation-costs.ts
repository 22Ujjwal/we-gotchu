export function packQuantity(needed: number, packSize: number) {
  if (![needed, packSize].every(n => Number.isSafeInteger(n) && n > 0)) return undefined
  const packs = Math.ceil(needed / packSize)
  if (!Number.isSafeInteger(packs * packSize)) return undefined
  return { needed, packSize, packs }
}

export type CostComponent = { amountMinor: number | null; currency: string; required: boolean }

// Components describe one selection, never mutually exclusive alternatives.
export function assessCosts(components: CostComponent[], budget: number, currency: string) {
  let subtotal = 0
  let known = false
  let complete = components.length > 0
  for (const component of components) {
    const usable = component.currency.toUpperCase() === currency.toUpperCase() &&
      component.amountMinor !== null && Number.isSafeInteger(component.amountMinor) && component.amountMinor >= 0
    if (!usable) { if (component.required) complete = false; continue }
    known = true
    subtotal += component.amountMinor!
  }
  if (!known || !Number.isSafeInteger(subtotal) || !Number.isSafeInteger(budget) || budget < 0) {
    return { subtotal: null, fit: 'unknown' as const }
  }
  return { subtotal, fit: subtotal > budget ? 'over' as const : complete ? 'within' as const : 'unknown' as const }
}
