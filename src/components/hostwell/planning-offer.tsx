import type { ReactNode } from 'react'
import { calculateOfferCosts, type SelectedOffer } from '../../agent/planning/offer-contract'
import { formatPaymentAmount } from '../../lib/payment-money'

export function PlanningOfferReview({ offer, stale, supplierQuote, children }: {
  offer: SelectedOffer; stale: boolean; supplierQuote?: string; children?: ReactNode
}) {
  const costs = calculateOfferCosts(offer)
  const money = (amount: number) => formatPaymentAmount(amount, offer.currency)
  const complete = costs.ok && !offer.missing.length
  const deposits = offer.lines.filter(line => line.deposit.amount)
  const terms = [...new Set(offer.lines.map(line => line.cancellationTerms).filter(Boolean))]
  const quotes = offer.lines.flatMap(line => line.sourceQuotes ?? [])
  return <section aria-label="Your offer" className="mx-auto flex w-full max-w-[900px] flex-col gap-5 border border-sand p-6">
    <h2 className="text-[26px] font-light">Your offer</h2>
    {stale && <p role="alert">Your selections or event details changed. We need an updated offer before you can pay.</p>}
    <ul className="flex flex-col gap-3">{offer.lines.map((line, index) => <li key={line.option.id} className="flex flex-wrap justify-between gap-2 border-b border-sand pb-3">
      <span><span className="block font-semibold">{line.option.name}</span><span className="block text-stone">{line.quantityDescription}</span></span>
      {costs.ok && <span>{money(costs.amounts[index])}</span>}
    </li>)}</ul>
    {complete ? <>
      <p className="text-[22px] font-semibold">Total: {money(costs.total)}</p>
      <p className="text-stone">Includes tax, delivery and fees.</p>
    </> : <p>The complete total is not confirmed yet.</p>}
    {deposits.map(line => <p key={line.option.id}>Deposit: {money(line.deposit.amount!)}, {line.deposit.treatment === 'included' ? 'included in the total'
      : line.deposit.treatment === 'additional' ? 'added to the total' : 'not confirmed yet'}.</p>)}
    {!!terms.length && <p>Cancellation: {terms.join(' ')}</p>}
    {!!offer.missing.length && <div><p className="font-semibold">The venue still needs to confirm</p>
      <ul className="list-disc pl-5">{offer.missing.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {offer.expiresAt && <p className="text-stone">Offer valid until {new Date(offer.expiresAt).toLocaleString('en-US', { timeZoneName: 'short' })}</p>}
    {children}
    {(!!supplierQuote || !!quotes.length) && <details><summary className="cursor-pointer underline">View supplier quote</summary>
      {supplierQuote ? <p className="mt-3 whitespace-pre-wrap">{supplierQuote}</p>
        : quotes.map((quote, index) => <blockquote key={index} className="mt-3 border-l border-sand pl-3">{quote}</blockquote>)}
    </details>}
  </section>
}
