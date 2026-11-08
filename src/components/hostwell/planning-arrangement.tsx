import { interiorInspiration } from '../../lib/hostwell/interior-inspiration'
import { PlanningEstimate } from './planning-estimate'
import type { Feature } from '../../lib/hostwell/fixture'
import { displayCopy, displayFactValue } from '../../lib/hostwell/display-copy'
import type { PlanningVenueImage } from '../../lib/hostwell/planning-images'
import { useState } from 'react'
import type { PlanningCommand, PlanningOption, PlanningView } from '../../agent/planning/contract'
import { Button } from './ui'
import { VenueView } from './venue-view'
import { defaultBrief } from '../../lib/hostwell/fixture'

export function PlanningArrangement({ view, disabled, submit, onBack, customerEmail, images = {}, attemptedImages = [] }: {
  attemptedImages?: string[]
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
      <h3 className="text-[22px] leading-7 font-semibold">Add to your event</h3>
      {[...supplies.values()].map(option => <label key={option.id} className="flex items-start gap-4 py-2 text-[17px] leading-6">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-ink" checked={selected.has(option.id)} disabled={disabled || !!view.paymentLink}
          onChange={() => void submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId: option.id })} />
        <span className="min-w-0 flex-1"><span className="block font-medium" title={displayCopy(option.name)}>{displayCopy(option.name)}</span>
          {option.facts.filter(fact => /pack|quantity|size|capacity/i.test(fact.label) && !/price|cost/i.test(fact.label)).slice(0, 2).map((fact, index) => <span key={index} className="mt-1 block text-[15px]">{displayFactValue(fact.value)}</span>)}
        </span>
        <span className="max-w-[36%] text-right font-mono text-receipt-muted">{displayFactValue(option.facts.find(fact => /price|cost|subtotal/i.test(fact.label))?.value ?? 'Quote needed')}</span>
      </label>)}
      {!supplies.size && <p className="text-stone">No extras yet.</p>}
      <details><summary className="cursor-pointer underline">Venue details</summary>
        {venue.unknowns.map((unknown, index) => <p key={index} className="mt-2">{displayCopy(unknown)}</p>)}
        {venue.facts.map((fact, index) => <p key={index} className="mt-3">{displayFactValue(fact.value)} <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="underline">Source</a></p>)}
      </details>
      <button type="button" className="self-start border border-sand px-3 py-1.5 text-[14px] font-medium text-ink hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Remove ${venueName}`} aria-pressed="true" disabled={disabled || !!view.paymentLink}
        onClick={() => void submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId: venue.id })}>Remove venue</button>
    </div>
  const receipt = <PlanningEstimate view={view} />
  const action = <div className="flex flex-col gap-4">
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
  return <VenueView photoFallback={attemptedImages.includes(venue.id) ? interiorInspiration(venue.id) : undefined} embedded brief={view.brief ?? defaultBrief}
    venue={{ name: venueName, neighbourhood: view.brief?.area ?? '', photos: (images[venue.id] ?? []).map(image => image.url), description: displayCopy(venue.why),
      detailFeatures: venue.facts.filter(fact => /capacity|seat|guest|duration|hour|access/i.test(fact.label) && fact.value.length < 100).slice(0, 4).map(fact => ({
        icon: (/capacity|seat|guest/i.test(fact.label) ? 'guests' : 'calendar') as Feature['icon'], label: displayFactValue(fact.value),
      })) }}
    back={<button type="button" className="underline" onClick={onBack}>Change venue</button>}
    extras={extras} receipt={receipt} action={action} onArrange={() => {}} />
}
