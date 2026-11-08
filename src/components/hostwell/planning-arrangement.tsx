import { displayCopy, displayFactLabel, displayFactValue } from '../../lib/hostwell/display-copy'
import type { PlanningVenueImage } from '../../lib/hostwell/planning-images'
import { useState } from 'react'
import type { PlanningCommand, PlanningOption, PlanningView } from '../../agent/planning/contract'
import { Button } from './ui'
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
  const venueName = displayCopy(venue.name.replace(/\s*\(budget mismatch[^)]*\)/gi, ''))
  const supplies = new Map<string, PlanningOption>()
  for (const option of [...(view.proposal?.options ?? []), ...view.selections]) if (option.kind === 'supply') supplies.set(option.id, option)
  const selected = new Set(view.selections.map(option => option.id))
  const arrangement = view.arrangement
  const active = arrangement && arrangement.status !== 'stale'
  const extras = <div className="flex flex-col gap-5 pt-8">
      <dl aria-label="Venue essentials" className="flex flex-col gap-3 text-[16px] leading-6">
        {venue.facts.slice(0, 3).map((fact, index) => <div key={index}>
          <dt className="font-semibold">{displayFactLabel(fact.label)}</dt>
          <dd className="text-stone">{displayFactValue(fact.value)}</dd>
        </div>)}
      </dl>
      <button type="button" className="self-start underline" onClick={onBack}>Change venue</button>
      <Button className="self-start px-5 py-3" aria-label={`Remove ${venueName}`} aria-pressed="true" disabled={disabled || !!view.paymentLink}
        onClick={() => void submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId: venue.id })}>Remove venue</Button>
      <h3 className="text-[22px]">Extras</h3>
      {[...supplies.values()].map(option => <label key={option.id} className="flex items-start gap-3 border-b border-sand pb-4">
        <input type="checkbox" checked={selected.has(option.id)} disabled={disabled || !!view.paymentLink}
          onChange={() => void submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId: option.id })} />
        <span><span className="block font-semibold" title={displayCopy(option.name)}>{displayCopy(option.name)}</span>
          {option.facts.filter(fact => /price|cost|subtotal|pack|quantity|size|capacity/i.test(fact.label)).slice(0, 3).map((fact, index) => <span key={index} className="mt-1 block text-[15px]">{displayFactValue(fact.value)}</span>)}
        </span>
      </label>)}
      {!supplies.size && <p className="text-stone">No extras yet.</p>}
      <details><summary className="cursor-pointer underline">Venue details</summary>
        <p className="mt-3">{displayCopy(venue.why)}</p>
        {venue.unknowns.map((unknown, index) => <p key={index} className="mt-2">{displayCopy(unknown)}</p>)}
        {venue.facts.map((fact, index) => <p key={index} className="mt-3">{displayFactValue(fact.value)} <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="underline">Source</a></p>)}
      </details>
    </div>
  const receipt = <div className="flex flex-col gap-5 border border-sand bg-cream p-6">
      <h3 className="font-script text-[30px]">Your event</h3>
      {view.selections.map(option => <div key={option.id} className="border-b border-sand pb-3">
        <p className="font-semibold">{option.kind === 'venue' ? venueName : displayCopy(option.name)}</p>
        {option.facts.filter(fact => /price|cost|subtotal/i.test(fact.label)).slice(0, 1).map((fact, index) => <p key={index} className="mt-1 text-[15px]">{displayFactValue(fact.value)}</p>)}
      </div>)}
      <p>Quote needed</p>
      {arrangement?.controlled && <p className="font-semibold">Test mode. No supplier contact.</p>}
      {active ? <div role="status" aria-live="polite"><p className="font-semibold">Request saved</p><p className="mt-2">{arrangement.detail}</p></div>
        : <>
          {arrangement?.status === 'stale' && <p>{arrangement.detail}</p>}
          <p className="text-[15px]">We’ll contact the venue for a quote. You approve before paying.</p>
          <label className="flex flex-col gap-2">Email for updates
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email"
              className="border border-sand bg-white p-3" required />
          </label>
          <Button className="px-6 py-4" disabled={disabled || !validEmail || !view.canArrange || view.status !== 'ready' || !!view.paymentLink || !!view.inquiry?.delivery}
            onClick={() => void submit({ kind: 'arrange', customerEmail: email.trim(), requestId: crypto.randomUUID(), expectedVersion: view.version })}>Please arrange this</Button>
          {view.inquiry?.delivery && <p className="text-[14px] text-stone">Review existing inquiry.</p>}
          {!view.canArrange && <p className="text-[14px] text-stone">Requests unavailable.</p>}
        </>}
    </div>
  return <VenueView embedded brief={view.brief ?? defaultBrief}
    venue={{ name: venueName, neighbourhood: view.brief?.area ?? '', photos: (images[venue.id] ?? []).map(image => image.url), description: '',
      detailFeatures: [] }}
    back={null}
    extras={extras} receipt={receipt} action={<span />} onArrange={() => {}} />
}
