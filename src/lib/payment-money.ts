// Stripe keeps two-decimal API amounts for ISK and UGX despite their ISO currency precision.
// https://docs.stripe.com/currencies#special-cases
export function paymentFractionDigits(currency: string): number {
  if (['isk', 'ugx'].includes(currency.toLowerCase())) return 2
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

export function formatPaymentAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 10 ** paymentFractionDigits(currency))
}
