import { interiorInspiration } from '../../lib/hostwell/interior-inspiration'
import { usePlanningImages } from '../../lib/hostwell/planning-images'
import { displayCopy, displayFactValue } from '../../lib/hostwell/display-copy'
import { ArrangingView } from './arranging-view'
import { PlanningArrangement } from './planning-arrangement'
import { PlanningConversation } from './planning-conversation'
import { SettingsView } from './settings-view'
import { ReceiptLoader } from './receipt-loader'
import type { Feature } from '../../lib/hostwell/fixture'
import { PlanningPayment } from './planning-payment'
import { calculateOfferCosts } from '../../agent/planning/offer-contract'
import { PlanningOfferReview } from './planning-offer'
import { useUser } from '@clerk/tanstack-react-start'
import { useEffect, useRef, useState } from 'react'
import type { PlanningOption } from '../../agent/planning/contract'
import { usePlanningSession } from '../../lib/hostwell/planning-session'
import { Button } from './ui'

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
  return <main className="flex flex-1 justify-center">
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
    : session.error?.message ?? (session.view?.status === 'uncertain'
      ? 'We cannot confirm that research started or continued. Your brief is saved. Check the saved status before starting again.' : undefined)
  useEffect(() => { if (notice) alert.current?.focus() }, [notice])
  const { view } = session
  const blocked = session.pending || session.loading || !!session.uncertain || !!id && !view
    || view?.inquiry?.delivery?.status === 'pending' || view?.status === 'working' || view?.status === 'uncertain' || view?.status === 'blocked'
    || !!session.error && session.error.status !== 409 && session.error.status !== 400 && session.error.status !== 422
  const complete = (next: typeof view, message: boolean) => {
    if (!next) return
    if (message) setDraft('')
    if (!id) onCreated?.(next.id)
  }
  async function send() {
    if (blocked || !draft.trim()) return
    if (view?.supplierQuestion && !view.supplierQuestion.answer) {
      complete(await session.submit({ kind: 'answer_supplier', requestId: crypto.randomUUID(), expectedVersion: view.version,
        replyId: view.supplierQuestion.replyId, answer: draft.trim() }), true)
      return
    }
    complete(await session.submit(id && view ? { kind: 'message', requestId: crypto.randomUUID(), expectedVersion: view.version, message: draft.trim() }
      : { requestId: crypto.randomUUID(), message: draft.trim() }), true)
  }
  const options = new Map<string, PlanningOption>()
  for (const option of view?.proposal?.options ?? []) options.set(option.id, option)
  // Saved snapshots remain authoritative even if a later proposal changes or omits the option.
  for (const option of view?.selections ?? []) options.set(option.id, option)
  const { images: venueImages, attempted: attemptedImages, canRetry: canRetryPhotos, retry: retryPhotos } = usePlanningImages(view?.id, [...options.values()], view?.version ?? 0)
  const selected = new Set(view?.selections.map(option => option.id))
  const offer = view?.offer
  const supplierConfirmed = !!offer && view?.offerApproval?.offerId === offer.id && view.offerApproval.offerRevision === offer.revision
    && !!view.offerApproval.confirmedReplyId && view.offerApproval.confirmedReplyId === view.inquiry?.replies?.at(-1)?.id
  const approvalWaiting = !!offer && view?.offerApproval?.offerId === offer.id && view.offerApproval.offerRevision === offer.revision && !supplierConfirmed
  const offerStale = !!offer && (view?.inquiry?.status === 'stale'
    || view?.inquiry?.replies?.at(-1)?.id !== offer.replyId && !supplierConfirmed
    || offer.contextMessageIds.join('|') !== view?.messages.filter(message => message.role === 'user').map(message => message.id).join('|')
    || offer.lines.map(line => line.option.id).sort().join('|') !== view?.selections.map(option => option.id).sort().join('|')
    || !!offer.expiresAt && Date.parse(offer.expiresAt) <= Date.now())
  const offerCosts = offer && calculateOfferCosts(offer)
  const venueOptions = [...options.values()].filter(option => option.kind === 'venue')
  const venueCards = venueOptions.map(option => ({ id: option.id, photoFallback: attemptedImages.includes(option.id) ? interiorInspiration(option.id) : undefined, name: displayCopy(option.name), photos: (venueImages[option.id] ?? []).map(image => image.url),
    photoCredit: (venueImages[option.id] ?? []).map(image => <a key={image.url} href={image.attribution.url} target="_blank" rel="noreferrer" className="text-[12px] text-stone underline">{image.attribution.text}</a>),
    cardFeatures: option.facts.slice(0, 3).map(fact => ({ icon: (/capacity|seat|guest/i.test(fact.label) ? 'guests'
      : /cancel|date|time/i.test(fact.label) ? 'calendar' : 'fee') as Feature['icon'], label: displayFactValue(fact.value).split(/(?<=[.!?])\s/)[0] })) }))
  const supplierQuestion = view?.supplierQuestion && !view.supplierQuestion.answer ? view.supplierQuestion.text : undefined
  const needsAnswer = !!supplierQuestion || !!view?.proposal?.nextQuestion
  const messageForm = <form className="flex w-full max-w-[760px] flex-col gap-3" onSubmit={event => { event.preventDefault(); void send() }}>
      {(supplierQuestion || view?.proposal?.nextQuestion && !view.arrangement) && venueCards.length > 0 && <p className="text-[18px] leading-7">{supplierQuestion || view?.proposal?.nextQuestion}</p>}
      <label htmlFor="planning-message" className={id ? 'sr-only' : 'text-[18px] font-semibold'}>{id ? 'Ask for changes' : 'Tell us about your event'}</label>
      <div className="flex items-end gap-3 border border-line-strong bg-white p-3 shadow-sm focus-within:border-ink">
      <textarea id="planning-message" rows={id ? 2 : 4} maxLength={8000} value={draft} readOnly={session.pending || !!session.uncertain}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }}
        placeholder={needsAnswer ? 'Type your answer...' : id ? 'Keep the venue, but find cheaper supplies...' : 'A birthday dinner for 20 in Oakland next Saturday, around $600...'}
        className="min-w-0 flex-1 resize-y bg-transparent p-2 text-[17px] leading-6 focus-visible:outline-2 focus-visible:outline-gold" />
      <Button type="submit" aria-label={id ? 'Send message' : 'Plan my event'} disabled={!!blocked || !draft.trim()} className="shrink-0 px-4 py-3 text-[16px]">{session.pending ? 'Saving...' : id ? 'Send' : 'Plan my event'}</Button>
      </div>
      <p className="text-[13px] text-stone">Press Enter to send. Use Shift+Enter for a new line.</p>
    </form>
  const errorNotice = notice && <div className="flex flex-col items-start gap-3">
    <p role="alert" tabIndex={-1} ref={alert}>{notice}</p>
    {id && <Button className="px-5 py-3" disabled={session.pending || session.loading} onClick={() => void session.refresh()}>Check saved status</Button>}
  </div>
  if (id && view?.status === 'working' && !view.proposal && !notice) {
    return <div className="w-full"><ReceiptLoader brief={view.brief}
      activity={view.progress || view.activity?.find(item => item.status === 'working')?.detail || 'Starting your research'} /></div>
  }
  if (view?.arrangement && !supplierQuestion && !notice && !view.offer && !view.paymentLink
    && ['requested', 'preparing', 'awaiting_reply'].includes(view.arrangement.status)) {
    return <ArrangingView embedded email={view.arrangement.customerEmail}
      message={view.arrangement.status === 'awaiting_reply'
        ? 'Your inquiry was accepted for sending. We are waiting for the supplier reply.'
        : 'Your request is saved. We are preparing the inquiry; no supplier email is confirmed sent yet.'}
      items={view.selections.map(option => ({ label: option.kind === 'venue' ? 'Venue' : 'Extras', title: option.name }))} />
  }
  if (id && view && !venueCards.length && !view.arrangement) {
    return <PlanningConversation view={view} form={view.status === 'failed' && !view.proposal ? null : messageForm} notice={errorNotice} />
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
      {view.paymentLink && <PlanningPayment key={view.paymentLink.eventId} link={view.paymentLink} identity={user?.id ?? null} stale={offerStale}
        onRelease={() => { void session.submit({ kind: 'release_payment', requestId: crypto.randomUUID(), expectedVersion: view.version, eventId: view.paymentLink!.eventId }) }} />}

      {!view.arrangement && view.status !== 'ready' && <p role="status" aria-live="polite" className="text-stone">{view.status === 'working' ? 'Updating your options...'
        : view.status === 'blocked' ? "Research is paused for our team's review."
        : view.status === 'failed' ? 'Research could not finish. Please try again.'
        : 'Reconnecting to your plan...'}</p>}
      {view.status === 'uncertain' && <Button className="self-start px-6 py-3" disabled={session.loading || session.pending} onClick={() => void session.refresh()}>Check for an update</Button>}

      {view.proposal && !venueCards.length && <div className="flex flex-col gap-3 text-[18px] leading-7">
        <p>{view.proposal.summary}</p>
        {view.proposal.nextQuestion && <p>{view.proposal.nextQuestion}</p>}
      </div>}
      {!!venueCards.length && (browsingSettings || !view.selections.some(option => option.kind === 'venue')) && <SettingsView embedded brief={view.brief} featured={venueCards[0]} others={venueCards.slice(1)}
        disabled={!!blocked} editBrief={null}
        followup={messageForm} onChoose={optionId => {
          setBrowsingSettings(false)
          if (selected.has(optionId)) return
          void session.submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId })
        }} />}
      {canRetryPhotos && <Button className="self-center px-5 py-3" onClick={retryPhotos}>Retry photos</Button>}
      {!view.selections.some(option => option.kind === 'venue') && options.size > 0 && <section aria-label="Supplies and sources" className="mx-auto grid w-full max-w-[1000px] gap-5 md:grid-cols-2">
        {[...options.values()].filter(option => option.kind === 'supply' || selected.has(option.id)).map(option => <PlanningOptionCard key={option.id} option={option} selected={selected.has(option.id)} disabled={!!blocked}
          onSelect={() => void session.submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId: option.id })} />)}
      </section>}
      {!browsingSettings && <PlanningArrangement attemptedImages={attemptedImages} images={venueImages} customerEmail={user?.primaryEmailAddress?.emailAddress ?? ''} view={view} disabled={!!blocked} submit={session.submit} onBack={() => setBrowsingSettings(true)} />}
      {!view.paymentLink && !browsingSettings && view.selections.some(option => option.kind === 'venue') && <div className="mx-auto w-full max-w-[760px]">{messageForm}</div>}
      {view.offer && (view.paymentLink ? <details><summary className="cursor-pointer underline">Quoted terms and sources</summary><PlanningOfferReview offer={view.offer} stale={offerStale} /></details>
        : <PlanningOfferReview offer={view.offer} stale={offerStale} />)}
      {view.offer && !view.paymentLink && !offerStale && !view.offer.missing.length && offerCosts?.ok && offerCosts.total > 0
        && <Button className="self-start px-5 py-3" disabled={!!blocked || view.status !== 'ready' || approvalWaiting}
          onClick={() => void session.submit({ kind: view.arrangement?.controlled && !supplierConfirmed ? 'approve_offer' : 'prepare_payment', requestId: crypto.randomUUID(), expectedVersion: view.version,
            offerId: view.offer!.id, offerRevision: view.offer!.revision })}>{approvalWaiting ? 'Waiting for supplier confirmation' : view.arrangement?.controlled && !supplierConfirmed ? 'Approve offer and request confirmation' : 'Review sandbox payment'}</Button>}
    </>}
    {(!id || !venueCards.length && view?.status === 'ready') && messageForm}
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
