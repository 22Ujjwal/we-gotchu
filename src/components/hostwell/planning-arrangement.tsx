import { displayCopy, displayFactValue } from '../../lib/hostwell/display-copy'
import type { PlanningVenueImage } from '../../lib/hostwell/planning-images'
import { useState } from 'react'
import { calculateOfferCosts } from '../../agent/planning/offer-contract'
import type { PlanningCommand, PlanningOption, PlanningView } from '../../agent/planning/contract'
import { Button } from './ui'
import { paymentFractionDigits } from '../../lib/payment-money'
import { Receipt } from './receipt'
import { VenueView } from './venue-view'
import { defaultBrief } from '../../lib/hostwell/fixture'

export function PlanningArrangement({ view, disabled, submit, onBack, customerEmail, images = {} }: {
  images?: Record<string, PlanningVenueImage[]>
  customerEmail: string
  onBack: () => void
  view: PlanningView; disabled: boolean; submit: (command: PlanningCommand) => Promise<PlanningView | null>
}) {
  const [email, setEmail] = useState(view.arrangement?.customerEmail ?? customerEmail)
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const venue = view.selections.find(option => option.kind === 'venue')
  if (!venue) return null
  const supplies = new Map<string, PlanningOption>()
  for (const option of [...(view.proposal?.options ?? []), ...view.selections]) if (option.kind === 'supply') supplies.set(option.id, option)
  const selected = new Set(view.selections.map(option => option.id))
  const arrangement = view.arrangement
  const offer = view.offer
  const costs = offer && calculateOfferCosts(offer)
  const active = arrangement && arrangement.status !== 'stale'
  const extras = <div className="flex flex-col gap-5 pt-8">
      <h3 className="text-[22px]">{view.paymentLink ? 'Included in your arrangement' : 'Add to your arrangement'}</h3>
      {[...supplies.values()].filter(option => !view.paymentLink || selected.has(option.id)).map(option => <label key={option.id} className="flex items-start gap-4 py-2 text-[17px] leading-6">
        {!view.paymentLink && <input type="checkbox" checked={selected.has(option.id)} disabled={disabled || !!view.paymentLink}
          onChange={() => void submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId: option.id })} />}
        <span><span className="block font-medium">{displayCopy(option.name)}</span>
          {!view.paymentLink && option.facts.filter(fact => /price|cost|subtotal|pack/i.test(fact.label)).slice(0, 2).map((fact, index) => <span key={index} className="mt-1 block text-[15px]">{fact.value}</span>)}
        </span>
      </label>)}
      {!supplies.size && <p className="text-stone">Ask for any extras in the message below the settings.</p>}
    </div>
  const receipt = <div className="flex flex-col gap-5">
      <Receipt currency={offer?.currency} venue={{ freeCancellationUntil: '' }} brief={view.brief ?? defaultBrief}
        order={{ lines: offer ? offer.lines.map((line, index) => ({ qty: line.units, item: displayCopy(line.option.name),
          amount: costs?.ok ? costs.amounts[index] / 10 ** paymentFractionDigits(offer.currency) : 'Quote needed' }))
          : view.selections.map(option => ({ qty: 1, item: displayCopy(option.name), amount: 'Quote needed',
            notes: option.facts.filter(fact => fact.basis === 'published' && /price|cost|subtotal|hire/i.test(fact.label))
              .slice(0, 1).map(fact => `Published ${fact.label.toLowerCase().replace(/^published\s+/, '')}: ${displayFactValue(fact.value).replace(/[.]+$/, '')}. Final quote pending.`) })),
          requests: [], subtotal: costs?.ok ? costs.total / 10 ** paymentFractionDigits(offer!.currency) : null, vat: null, total: costs?.ok ? costs.total / 10 ** paymentFractionDigits(offer!.currency) : null }} />
    </div>
  const action = <div className="flex flex-col gap-4">
      {arrangement?.controlled && <p className="font-semibold">Controlled supplier rehearsal. No real venue will be contacted.</p>}
      {active ? !view.paymentLink && <div role="status" aria-live="polite"><p className="font-semibold">Your arrangement request is saved</p><p className="mt-2">{arrangement.detail}</p></div>
        : <>
          {arrangement?.status === 'stale' && <p>{arrangement.detail}</p>}
          <p className="text-[15px]">{view.canArrange ? "We will request availability and a quote. You approve before paying." : "Quote requests are unavailable here. Your selections are saved."}</p>
          <label className="flex flex-col gap-2">Send my arrangement updates to
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email"
              className="border border-sand bg-white p-3" required />
          </label>
          {!view.canArrange && <p id="arrangement-unavailable" role="status" className="text-[14px] text-stone">Supplier email setup is incomplete. You can continue reviewing options, but cannot request a quote yet.</p>}
          <Button aria-describedby={!view.canArrange ? "arrangement-unavailable" : undefined} className="px-6 py-4" disabled={disabled || !validEmail || !view.canArrange || view.status !== 'ready' || !!view.paymentLink}
            onClick={() => void submit({ kind: 'arrange', customerEmail: email.trim(), requestId: crypto.randomUUID(), expectedVersion: view.version })}>Please arrange this</Button>
        </>}
      {!view.paymentLink && <p className="text-[14px] text-stone">Choosing a setting or requesting an arrangement does not reserve it or authorize a charge.</p>}
    </div>
  return <VenueView photoCredit={(images[venue.id] ?? []).map(image => <a key={image.url} href={image.attribution.url} target="_blank" rel="noreferrer" className="text-[12px] text-stone underline">{image.attribution.text}</a>)} embedded brief={view.brief ?? defaultBrief}
    venue={{ name: displayCopy(venue.name), neighbourhood: view.brief?.area ?? '', photos: (images[venue.id] ?? []).map(image => image.url), description: displayCopy(venue.why),
      detailFeatures: offer ? [] : venue.facts.filter(fact => /capacity|seat|guest|duration|hour|access/i.test(fact.label) && fact.value.length < 100).slice(0, 4).map(fact => ({ icon: /capacity|seat|guest/i.test(fact.label) ? 'guests' as const : 'calendar' as const, label: displayFactValue(fact.value) })) }}
    back={<button type="button" className="underline" onClick={onBack}>Back to settings</button>}
    extras={extras} receipt={receipt} action={action} onArrange={() => {}} />
}
