import { PlanningArrangement } from './planning-arrangement'
import { SettingsView } from './settings-view'
import { ReceiptLoader } from './receipt-loader'
import type { Feature } from '../../lib/hostwell/fixture'
import { PlanningPayment } from './planning-payment'
import { calculateOfferCosts } from '../../agent/planning/offer-contract'
import { PlanningOfferReview } from './planning-offer'
import { useUser } from '@clerk/tanstack-react-start'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PlanningOption } from '../../agent/planning/contract'
import { usePlanningSession } from '../../lib/hostwell/planning-session'
import { Button } from './ui'
import { customerStage, isDemo, planningBlocked, PlanningStatus } from './planning-status'

export function PlanningIntake({ onCreated }: { onCreated: (id: string) => void }) {
  const { user, isLoaded } = useUser()
  if (!isLoaded) return <p role="status">Loading sign-in...</p>
  if (!user) return <a href="/sign-in?redirect_url=%2Fplanning" className="text-[17px] font-semibold underline">Sign in to plan your event</a>
  return <PlanningChat key={user.id} onCreated={onCreated} />
}
export function ConnectedPlanningPage({ id }: { id: string }) {
  const { user, isLoaded } = useUser()
  if (!isLoaded) return <p role="status">Loading sign-in...</p>
  if (!user) return <a href={`/sign-in?redirect_url=${encodeURIComponent(`/planning/${encodeURIComponent(id)}`)}`}
    className="text-[17px] font-semibold underline">Sign in to view your plan</a>
  return <main className="flex flex-1 justify-center px-5 pt-10 pb-8 lg:px-12">
    <PlanningChat key={`${user.id}:${id}`} id={id} />
  </main>
}
function PlanningChat({ id, onCreated }: { id?: string; onCreated?: (id: string) => void }) {
  const { user } = useUser()
  const session = usePlanningSession(id)
  const [draft, setDraft] = useState('')
  const [browsingSettings, setBrowsingSettings] = useState(false)
  const alert = useRef<HTMLParagraphElement>(null)
  const notice = session.uncertain
    ? id ? 'We could not confirm whether your request was saved. Your draft is kept. Check the saved status before taking any further action.'
      : 'We could not confirm whether your plan was created. Your draft is kept. Do not submit again or reload to retry. Please contact support to locate your plan.'
    : session.error?.message
  useEffect(() => { if (notice) alert.current?.focus() }, [notice])
  const { view } = session
  const blocked = planningBlocked(session, !!id)
  const complete = (next: typeof view, message: boolean) => {
    if (!next) return
    if (message) setDraft('')
    if (!id) onCreated?.(next.id)
  }
  async function send() {
    if (blocked || !draft.trim()) return
    complete(await session.submit(id && view ? { kind: 'message', requestId: crypto.randomUUID(), expectedVersion: view.version, message: draft.trim() }
      : { requestId: crypto.randomUUID(), message: draft.trim() }), true)
  }
  const options = new Map<string, PlanningOption>()
  for (const option of view?.proposal?.options ?? []) options.set(option.id, option)
  // Saved snapshots remain authoritative even if a later proposal changes or omits the option.
  for (const option of view?.selections ?? []) options.set(option.id, option)
  const selected = new Set(view?.selections.map(option => option.id))
  const proposalText = view?.proposal && [view.proposal.summary, view.proposal.nextQuestion].filter(Boolean).join('\n\n')
  const offer = view?.offer
  const offerStale = !!offer && (view?.inquiry?.status === 'stale'
    || view?.inquiry?.replies?.at(-1)?.id !== offer.replyId
    || offer.contextMessageIds.join('|') !== view?.messages.filter(message => message.role === 'user').map(message => message.id).join('|')
    || offer.lines.map(line => line.option.id).sort().join('|') !== view?.selections.map(option => option.id).sort().join('|')
    || !!offer.expiresAt && Date.parse(offer.expiresAt) <= Date.now())
  const offerCosts = offer && calculateOfferCosts(offer)
  const venueOptions = [...options.values()].filter(option => option.kind === 'venue')
  const venueCards = venueOptions.map(option => ({ id: option.id, name: option.name, photos: [] as string[], why: option.why,
    cardFeatures: option.facts.slice(0, 3).map(fact => ({ icon: (/capacity|seat|guest/i.test(fact.label) ? 'guests'
      : /cancel|date|time/i.test(fact.label) ? 'calendar' : 'fee') as Feature['icon'], label: `${fact.label}: ${fact.value}` })) }))
  const answerAlreadyShown = view?.messages.some(message => message.role === 'assistant' && message.text === proposalText)
  const arranged = !!view?.arrangement
  const supplierQuote = offer && view?.inquiry?.replies?.find(reply => reply.id === offer.replyId)?.message.text
  const offerReview = (approval?: ReactNode) => offer
    ? <PlanningOfferReview offer={offer} stale={offerStale} supplierQuote={supplierQuote || undefined}>{approval}</PlanningOfferReview> : null
  const stage = view && !view.paymentLink && customerStage(view, null, offerStale)
  const messageForm = <form className="flex w-full max-w-[760px] flex-col gap-3" onSubmit={event => { event.preventDefault(); void send() }}>
      <label htmlFor="planning-message" className="text-[18px] font-semibold">{id ? 'Ask for changes' : 'Tell us about your event'}</label>
      <textarea id="planning-message" rows={id ? 2 : 4} maxLength={8000} value={draft} readOnly={session.pending || !!session.uncertain}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }}
        placeholder={id ? 'Keep the venue, but find cheaper supplies...' : 'A birthday dinner for 20 in Oakland next Saturday, around $600...'}
        className="w-full resize-y border-[1.5px] border-sand bg-transparent p-4 text-[18px] leading-7 focus-visible:outline-2 focus-visible:outline-gold" />
      <p className="text-[14px] text-stone">Press Enter to send. Use Shift+Enter for a new line.</p>
      <Button type="submit" disabled={!!blocked || !draft.trim()} className="self-start px-8 py-[17px] text-[18px]">{session.pending ? 'Saving...' : id ? 'Send message' : 'Plan my event'}</Button>
    </form>
  if (id && view?.status === 'working' && !view.proposal && !notice) {
    return <div className="w-full"><ReceiptLoader brief={view.brief} label={view.progress || 'Research in progress'} />
      <p role="status" className="text-center text-stone">{view.progress || 'Finding options for your event.'}</p></div>
  }
  return <div className={`flex w-full flex-col gap-8 ${id ? 'max-w-[1400px]' : 'max-w-[900px]'}`}>
    {!id && <h1 className="text-[34px] leading-tight font-light tracking-[-0.02em] lg:text-[56px]">What are you planning?</h1>}
    {!id && <p className="text-[18px] leading-7 text-stone">Tell us about the occasion, place, budget, and anything you need. Rough dates are fine. We can work out the details together.</p>}
    {session.loading && <p role="status">Loading your plan...</p>}
    {notice && <div className="flex flex-col gap-3">
      <p role="alert" tabIndex={-1} ref={alert}>{notice}</p>
      {id && <Button className="self-start px-6 py-3" disabled={session.pending || session.loading} onClick={() => void session.refresh()}>{session.uncertain ? 'Check saved status' : 'Refresh plan'}</Button>}
      {session.error?.status === 401 && <a className="underline" href={`/sign-in?redirect_url=${encodeURIComponent(id ? `/planning/${encodeURIComponent(id)}` : '/planning')}`}>Sign in again</a>}
    </div>}
    {view && <>
      {view.messages.length > 2 && <details className="mx-auto w-full max-w-[900px]"><summary className="cursor-pointer underline">Conversation history</summary><section aria-label="Conversation" className="flex flex-col gap-4">
        {view.messages.slice(1).map(message => <div key={message.id} className={`border-l-2 pl-4 ${message.role === 'user' ? 'border-sand' : 'border-gold'}`}>
          <p className="text-[14px] font-semibold text-stone">{message.role === 'user' ? 'You' : 'Arrange'}</p>
          <p className="whitespace-pre-wrap text-[18px] leading-7">{message.text}</p>
        </div>)}
      </section></details>}
      {(!arranged || view.status !== 'ready') && <p role="status" aria-live="polite" className="text-stone">{view.status === 'working' ? view.progress || 'Looking into your event.'
        : view.status === 'blocked' ? "Research is paused for our team's review. You don't need to do anything."
        : view.status === 'failed' ? 'We could not finish this research. Send a message to try again.'
          : view.status === 'uncertain' ? 'We could not confirm the research outcome. Refresh your plan to check for an update.'
            : 'Your options are ready to explore.'}</p>}
      {!!view.activity?.length && !arranged && <details className="mx-auto w-full max-w-[900px]"><summary className="cursor-pointer underline">Research activity</summary><section aria-label="Research activity" className="flex flex-col gap-3">
        {view.activity.map((item, index) => <div key={`${item.name}:${index}`} className="border-l-2 border-sand pl-4">
          <p className="text-[16px] font-semibold">{item.name}</p>
          <p className="text-[16px] text-stone">{item.detail}</p>
        </div>)}
      </section></details>}
      {view.status === 'uncertain' && <Button className="self-start px-6 py-3" disabled={session.loading || session.pending} onClick={() => void session.refresh()}>Check for an update</Button>}
      {view.proposal && !venueCards.length && !answerAlreadyShown && <div className="flex flex-col gap-3 text-[18px] leading-7">
        <p>{view.proposal.summary}</p>
        {view.proposal.nextQuestion && <p>{view.proposal.nextQuestion}</p>}
      </div>}
      {!browsingSettings && arranged && <>
        {stage && <PlanningStatus stage={stage} demo={isDemo(view)} />}
        {view.paymentLink ? <PlanningPayment key={view.paymentLink.eventId} link={view.paymentLink} identity={user?.id ?? null} stale={offerStale}
          planning={view} renderOffer={offerReview}
          onRelease={() => { void session.submit({ kind: 'release_payment', requestId: crypto.randomUUID(), expectedVersion: view.version, eventId: view.paymentLink!.eventId }) }} />
          : offerReview(offer && !offerStale && !offer.missing.length && offerCosts?.ok && offerCosts.total > 0
            && <Button className="self-start px-6 py-4" disabled={!!blocked || view.status !== 'ready'}
              onClick={() => void session.submit({ kind: 'prepare_payment', requestId: crypto.randomUUID(), expectedVersion: view.version,
                offerId: offer.id, offerRevision: offer.revision })}>Continue to payment</Button>)}
      </>}
      {!!venueCards.length && (browsingSettings || !view.selections.some(option => option.kind === 'venue')) && <SettingsView embedded brief={view.brief} featured={venueCards[0]} others={venueCards.slice(1)}
        disabled={!!blocked} editBrief={<a href="/" className="underline">Plan another event</a>}
        summary={(view.proposal?.nextQuestion || view.status === 'working') && <div className="max-w-[760px] text-center text-[18px] leading-7">
          {view.proposal?.nextQuestion && <p>{view.proposal.nextQuestion}</p>}
          {view.status === 'working' && <p role="status">{view.progress || 'Researching your changes.'}</p>}</div>}
        followup={messageForm} onChoose={optionId => {
          setBrowsingSettings(false)
          if (selected.has(optionId)) return
          void session.submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId })
        }} />}
      {!view.selections.some(option => option.kind === 'venue') && options.size > 0 && <section aria-label="Supplies and sources" className="mx-auto grid w-full max-w-[1000px] gap-5 md:grid-cols-2">
        {[...options.values()].filter(option => option.kind === 'supply' || selected.has(option.id)).map(option => <PlanningOptionCard key={option.id} option={option} selected={selected.has(option.id)} disabled={!!blocked}
          onSelect={() => void session.submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId: option.id })} />)}
      </section>}
      {!browsingSettings && <PlanningArrangement customerEmail={user?.primaryEmailAddress?.emailAddress ?? ''} view={view} disabled={!!blocked} submit={session.submit} onBack={() => setBrowsingSettings(true)} />}
      {!browsingSettings && view.selections.some(option => option.kind === 'venue') && <div className="mx-auto w-full max-w-[760px]">{messageForm}</div>}
      {!arranged && <p className="text-[14px] leading-6 text-stone">Selections save your preferences. Send a message when you want us to research changes. Nothing is booked or purchased.</p>}
      {view.canReviewResearch && id && <a href={`/planning/${encodeURIComponent(id)}/team`} className="self-start text-[14px] text-stone underline">Team view (local development)</a>}
    </>}
    {(!id || !venueCards.length) && messageForm}
    {id && <a href="/" className="self-start text-[16px] underline">Plan another event</a>}
  </div>
}
function PlanningOptionCard({ option, selected, disabled, onSelect }: { option: PlanningOption; selected: boolean; disabled: boolean; onSelect: () => void }) {
  return <article className={`flex flex-col gap-4 border p-5 ${selected ? 'border-ink' : 'border-sand'}`}>
    <p className="text-[14px] text-stone">{option.kind === 'venue' ? 'Venue' : 'Supplies'}{selected ? ' / Selected' : ''}</p>
    <h2 className="text-[26px] leading-8 font-light">{option.name}</h2>
    <p className="text-[17px] leading-6">{option.why}</p>
    <dl className="flex flex-col gap-3">{option.facts.map((fact, index) => <div key={index}>
      <dt className="text-[14px] text-stone">{fact.label}</dt>
      <dd className="text-[17px]">{fact.value}</dd>
      <dd><a className="text-[14px] underline" href={fact.sourceUrl} target="_blank" rel="noreferrer">{fact.basis === 'published' ? 'Published source' : 'Estimate source'}</a></dd>
    </div>)}</dl>
    {option.unknowns.length > 0 && <div><p className="text-[14px] font-semibold">Still to confirm</p>
      <ul className="list-disc pl-5 text-[15px] leading-6">{option.unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul></div>}
    <details className="text-[15px] leading-6"><summary className="cursor-pointer underline">Sources and details</summary>
      <a href={option.url} target="_blank" rel="noreferrer" className="underline">View {option.name}</a>
      {option.facts.map((fact, index) => <blockquote key={index} className="mt-3 border-l border-sand pl-3">{fact.quote}</blockquote>)}
    </details>
    <Button className="mt-auto px-5 py-3" aria-pressed={selected} disabled={disabled} onClick={onSelect}>{selected ? 'Remove' : 'Select'} {option.name}</Button>
  </article>
}
