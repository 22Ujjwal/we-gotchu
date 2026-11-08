import { calculateOfferCosts, type SelectedOffer } from '../../agent/planning/offer-contract'

export function PlanningOfferReview({ offer, stale }: { offer: SelectedOffer; stale: boolean }) {
  const costs = calculateOfferCosts(offer)
  const money = (amount: number | null) => amount === null ? 'Not confirmed' : new Intl.NumberFormat('en-US', {
    style: 'currency', currency: offer.currency.toUpperCase(),
  }).format(amount / 100)
  const complete = costs.ok && !offer.missing.length
  return <section aria-label="Selected offer" className="flex flex-col gap-5 border border-sand p-5">
    <h2 className="text-[26px] font-light">Your selected offer</h2>
    {offer.mode === 'simulated' && <p className="font-semibold">Controlled test offer</p>}
    {stale && <p role="alert">Your selections or event details changed. Prepare an updated offer before continuing.</p>}
    {offer.lines.map(line => <article key={line.option.id} className="flex flex-col gap-2 border-b border-sand pb-4">
      <h3 className="text-[20px]">{line.option.name}</h3>
      <p>{line.quantityDescription}</p>
      <p>{line.units} x {money(line.unitAmount)}</p>
      <p>Tax: {money(line.tax)}. Delivery: {money(line.delivery)}. Other fees: {money(line.fees)}.</p>
      <p>Deposit: {money(line.deposit.amount)}, {line.deposit.treatment === 'included' ? 'included in the quoted price'
        : line.deposit.treatment === 'additional' ? 'additional to the quoted price' : 'inclusion not confirmed'}.</p>
      <p>Cancellation: {line.cancellationTerms ?? 'Not confirmed'}</p>
      <a href={line.option.url} target="_blank" rel="noreferrer" className="underline">View source</a>
      {!!line.sourceQuotes?.length && <details><summary className="cursor-pointer underline">Supporting wording</summary>
        {line.sourceQuotes.map((quote, index) => <blockquote key={index} className="mt-2 border-l border-sand pl-3">{quote}</blockquote>)}
      </details>}
    </article>)}
    {complete ? <p className="text-[20px] font-semibold">Total: {money(costs.total)}</p>
      : <p>The complete total is not confirmed yet.</p>}
    {!!offer.missing.length && <div><p className="font-semibold">Still needed</p>
      <ul className="list-disc pl-5">{offer.missing.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {!costs.ok && <p>{costs.reason}</p>}
    {offer.expiresAt && <p>Quote expires: {new Date(offer.expiresAt).toLocaleString('en-US', { timeZoneName: 'short' })}</p>}
    <p className="text-stone">Review the quoted terms before approving. Nothing is reserved or purchased. Payments in this flow use test mode and simulated supplier execution.</p>
  </section>
}
