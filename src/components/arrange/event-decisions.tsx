import { useState } from 'react'
import type { CustomerEventView } from '#/server/arrange/customer-view'

export type CustomerAction =
  | { action: 'choose'; optionId: string }
  | { action: 'approve'; offerId: string; acceptOverage: boolean }
  | { action: 'checkout'; offerId: string }
  | { action: 'answer'; operationKey: string; answer: string }

const money = (amount: number, currency: string) => new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount / 100)
const button = 'mt-4 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold'

export function EventDecisions({ view, busy, onAction }: { view: CustomerEventView; busy: boolean; onAction: (action: CustomerAction) => void }) {
  const [acceptedOffer, setAcceptedOffer] = useState<string | null>(null)
  const offer = view.offer
  return <>
    {view.options.length > 0 && <section className="mt-8" aria-labelledby="options-heading">
      <h2 id="options-heading" className="text-lg font-semibold">{view.chosenOptionId ? 'Your chosen option' : 'Choose your event'}</h2>
      <div className="mt-3 grid gap-4">
        {view.options.filter(option => !view.chosenOptionId || option.id === view.chosenOptionId).map(option => <article key={option.id} className="overflow-hidden rounded-xl border border-sage/30">
          {option.imageUrl && <img src={option.imageUrl} alt={option.name} loading="lazy" referrerPolicy="no-referrer" className="h-44 w-full object-cover" />}
          <div className="p-4">
            <h3 className="font-display text-xl">{option.name}</h3>
            <p className="mt-2 text-sm text-body">{option.reason}</p>
            <a className="mt-2 inline-block text-sm underline" href={option.sourceUrl} target="_blank" rel="noreferrer">Read the source for {option.name}</a>
            {option.knownTerms.length > 0 && <><p className="mt-3 text-sm font-semibold">What we know</p><ul className="list-inside list-disc text-sm">{option.knownTerms.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
            {option.unknownTerms.length > 0 && <><p className="mt-3 text-sm font-semibold">Still to confirm with the supplier</p><ul className="list-inside list-disc text-sm">{option.unknownTerms.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
            {!view.chosenOptionId && <button className={button} disabled={busy} onClick={() => onAction({ action: 'choose', optionId: option.id })}>Choose {option.name}</button>}
          </div>
        </article>)}
      </div>
    </section>}
    {offer && <section className="mt-8 rounded-xl border border-sage/30 p-4" aria-labelledby="offer-heading">
      <h2 id="offer-heading" className="text-lg font-semibold">Your complete offer</h2>
      <p className="text-sm text-body">Version {offer.version}. The amounts below come from supplier replies.</p>
      <ul className="mt-4 divide-y divide-sage/20">
        {offer.lines.map((line, index) => <li key={index} className="py-3">
          <p className="flex justify-between gap-3 font-semibold"><span>{line.description}</span><span>{money(line.totalMinor, line.currency)}</span></p>
          <p className="text-sm text-body">{line.quantity} at {money(line.unitAmountMinor, line.currency)} each.</p>
          <p className="mt-2 text-sm">Supplier price: {line.priceExcerpt}</p>
          <p className="text-sm">Deposit terms: {line.deposit}</p>
          <p className="text-sm">Cancellation terms: {line.cancellation}</p>
        </li>)}
      </ul>
      <p className="mt-3 flex justify-between border-t border-sage/30 pt-3 text-lg font-semibold"><span>Total</span><span>{money(offer.totalMinor, offer.currency)}</span></p>
      {!view.payment && <>
        {offer.overBudgetMinor > 0 && <p className="mt-3 text-sm text-red-800">This is {money(offer.overBudgetMinor, offer.currency)} above your budget.</p>}
        {view.approvedOfferId !== offer.id ? <>
          {offer.overBudgetMinor > 0 && <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={acceptedOffer === offer.id} onChange={e => setAcceptedOffer(e.target.checked ? offer.id : null)} /><span>I accept the extra {money(offer.overBudgetMinor, offer.currency)} above my budget.</span></label>}
          <p className="mt-3 text-sm text-body">Approving saves this exact offer. Payment is a separate step.</p>
          <button className={button} disabled={busy || (offer.overBudgetMinor > 0 && acceptedOffer !== offer.id)} onClick={() => onAction({ action: 'approve', offerId: offer.id, acceptOverage: acceptedOffer === offer.id })}>Approve this offer</button>
        </> : <>
          <p className="mt-3 text-sm">You approved this version. We will charge its exact total.</p>
          <button className={button} disabled={busy} onClick={() => onAction({ action: 'checkout', offerId: offer.id })}>Pay {money(offer.totalMinor, offer.currency)}</button>
        </>}
      </>}
    </section>}
    {view.payment && <section className="mt-8 rounded-xl bg-cream p-4" aria-labelledby="payment-heading">
      <h2 id="payment-heading" className="text-lg font-semibold">Payment received</h2>
      <p>{money(view.payment.amountMinor, view.payment.currency)}</p>
      {view.confirmations.length === 0 && <p className="mt-2 text-sm">We are waiting for supplier confirmations.</p>}
      {view.confirmations.map(confirmation => <article key={confirmation.supplier} className="mt-4 border-t border-sage/30 pt-3">
        <h3 className="font-semibold">{confirmation.supplier} confirmed by email</h3>
        <blockquote className="mt-1 text-sm">{confirmation.excerpt}</blockquote>
        <p className="mt-1 text-xs text-body">{new Date(confirmation.confirmedAt).toLocaleString()}</p>
      </article>)}
    </section>}
  </>
}
