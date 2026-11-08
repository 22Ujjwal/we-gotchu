import { displayCopy } from '../../lib/hostwell/display-copy'
import { usePlanningImages } from '../../lib/hostwell/planning-images'
import { ProposalSummary } from './proposal-summary'
import { PlanningArrangement } from './planning-arrangement'
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
import { PlanningInquiryEditor } from './planning-inquiry'

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
    complete(await session.submit(id && view ? { kind: 'message', requestId: crypto.randomUUID(), expectedVersion: view.version, message: draft.trim() }
      : { requestId: crypto.randomUUID(), message: draft.trim() }), true)
  }
  const options = new Map<string, PlanningOption>()
  for (const option of view?.proposal?.options ?? []) options.set(option.id, option)
  // Saved snapshots remain authoritative even if a later proposal changes or omits the option.
  for (const option of view?.selections ?? []) options.set(option.id, option)
  const { images: venueImages, canRetry: canRetryPhotos, retry: retryPhotos } = usePlanningImages(view?.id, [...options.values()], view?.version ?? 0)
  const selected = new Set(view?.selections.map(option => option.id))
  const offer = view?.offer
  const offerStale = !!offer && (view?.inquiry?.status === 'stale'
    || view?.inquiry?.replies?.at(-1)?.id !== offer.replyId
    || offer.contextMessageIds.join('|') !== view?.messages.filter(message => message.role === 'user').map(message => message.id).join('|')
    || offer.lines.map(line => line.option.id).sort().join('|') !== view?.selections.map(option => option.id).sort().join('|')
    || !!offer.expiresAt && Date.parse(offer.expiresAt) <= Date.now())
  const offerCosts = offer && calculateOfferCosts(offer)
  const venueOptions = [...options.values()].filter(option => option.kind === 'venue')
  const supplyOptions = [...options.values()].filter(option => option.kind === 'supply' || selected.has(option.id))
  const venueCards = venueOptions.map(option => ({ id: option.id, name: displayCopy(option.name), photos: (venueImages[option.id] ?? []).map(image => image.url),
    photoCredit: <>{(venueImages[option.id] ?? []).map(image => <a key={image.url} href={image.attribution.url} target="_blank" rel="noreferrer" className="text-[13px] underline">Photo source: {displayCopy(image.attribution.text)}</a>)}</>,
    evidence: <details className="text-[15px] leading-6"><summary className="cursor-pointer underline">Budget sources and details</summary>
      <p className="mt-3">{displayCopy(option.why)}</p>
      {option.facts.map((fact, index) => <p key={index} className="mt-2">{displayCopy(fact.label)}: {displayCopy(fact.value)} <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="underline">{fact.basis === 'published' ? 'Published source' : 'Estimate source'}</a></p>)}
      {option.unknowns.length > 0 && <div className="mt-3"><p className="font-semibold">Still to confirm</p><ul className="list-disc pl-5">{option.unknowns.map((unknown, index) => <li key={index}>{displayCopy(unknown)}</li>)}</ul></div>}
    </details>,
    cardFeatures: option.facts.slice(0, 3).map(fact => ({ icon: (/capacity|seat|guest/i.test(fact.label) ? 'guests'
      : /cancel|date|time/i.test(fact.label) ? 'calendar' : 'fee') as Feature['icon'], label: `${displayCopy(fact.label)}: ${displayCopy(fact.value)}` })) }))
  const messageForm = <section aria-label={id ? 'Plan changes' : 'Event details'} className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
      {view && view.status !== 'ready' && <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-3 text-center">{view.status !== 'uncertain' && <p role="status" aria-live="polite" className="text-stone">{view.status === 'working' ? view.progress || 'Looking into your event.'
        : view.status === 'blocked' ? "Research is paused for our team's review."
        : view.status === 'failed' ? 'We could not finish this research. Send a message to try again.'
            : null}</p>}
        {view.status === 'uncertain' && <Button className="px-6 py-3" disabled={session.loading || session.pending} onClick={() => void session.refresh()}>Check for an update</Button>}
        {view.status === 'blocked' && !(view.canReviewResearch && view.approvals?.length) && <Button className="px-5 py-3" disabled={session.loading || session.pending} onClick={() => void session.refresh()}>Check for research updates</Button>}
      </div>}
    <form className="flex w-full max-w-[760px] flex-col gap-3" onSubmit={event => { event.preventDefault(); void send() }}>
      <label htmlFor="planning-message" className="text-[18px] font-semibold">{id ? 'Ask for changes' : 'Tell us about your event'}</label>
      <textarea id="planning-message" rows={id ? 2 : 4} maxLength={8000} value={draft} readOnly={session.pending || !!session.uncertain}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }}
        placeholder={id ? 'Keep the venue, but find cheaper supplies...' : 'A birthday dinner for 20 in Oakland next Saturday, around $600...'}
        className="w-full resize-y border-[1.5px] border-sand bg-transparent p-4 text-[18px] leading-7 focus-visible:outline-2 focus-visible:outline-gold" />
      <Button type="submit" disabled={!!blocked || !draft.trim()} className="self-start px-8 py-[17px] text-[18px]">{session.pending ? 'Saving...' : id ? 'Send message' : 'Plan my event'}</Button>
    </form>
  </section>
  if (id && view?.status === 'working' && !view.proposal && !view.inquiry && !view.selections.length && !notice) {
    return <div className="w-full"><ReceiptLoader brief={view.brief} label={view.progress || 'Research in progress'} activity={view.progress || 'Finding options for your event.'} /></div>
  }
  return <div className={`flex w-full flex-col gap-8 ${id ? 'max-w-[1400px]' : 'max-w-[900px]'}`}>
    {!id && <h1 className="text-[34px] leading-tight font-light tracking-[-0.02em] lg:text-[56px]">What are you planning?</h1>}
    {!id && <p className="text-[18px] leading-7 text-stone">Add your occasion, location, budget and any supplies you need.</p>}
    {session.loading && <p role="status">Loading your plan...</p>}
    {notice && <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-3 text-center">
      <p role="alert" tabIndex={-1} ref={alert}>{notice}</p>
      {id && <Button className="px-6 py-3" disabled={session.pending || session.loading} onClick={() => void session.refresh()}>{session.uncertain ? 'Check saved status' : 'Refresh plan'}</Button>}
      {session.error?.status === 401 && <a className="underline" href={`/sign-in?redirect_url=${encodeURIComponent(id ? `/planning/${encodeURIComponent(id)}` : '/planning')}`}>Sign in again</a>}
    </div>}
    {view && <>
      {view.canReviewResearch && !!view.approvals?.length && ['blocked', 'uncertain'].includes(view.status) && <details className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <summary className="cursor-pointer underline">Operator review for local testing</summary>
        <p className="my-3">This is an internal research review, not a customer decision. Review the exact request before allowing or declining this one call.</p>
        {view.approvals?.map(approval => <div key={approval.id} className="flex flex-col gap-3 border border-sand p-4">
          <p>{approval.tool === 'monid.monid_discover' ? 'Find a research source'
            : approval.tool === 'monid.monid_inspect' ? "Check a research source's inputs"
              : approval.tool === 'monid.monid_get_run' ? 'Read a research result' : 'Request supplier research'}</p>
          <pre className="whitespace-pre-wrap break-words text-[14px]">{JSON.stringify(approval.arguments, null, 2)}</pre>
          <div className="flex flex-wrap gap-3">{(['allow', 'deny'] as const).map(decision => <Button key={decision}
            disabled={session.pending || session.loading || !!session.uncertain || view.status !== 'blocked'}
            className="px-5 py-3" onClick={() => void session.submit({ kind: 'confirm', requestId: crypto.randomUUID(),
              expectedVersion: view.version, approvalId: approval.id, decision })}>
            {decision === 'allow' ? 'Approve this research call' : 'Decline this research call'}
          </Button>)}</div>
        </div>)}
        <Button className="self-start px-5 py-3" disabled={session.pending || session.loading} onClick={() => void session.refresh()}>Check research status</Button>
      </details>}

      {view.inquiry?.delivery?.status === 'uncertain' && <section aria-label="Inquiry send status" className="flex flex-col gap-3 border-l-2 border-gold pl-4">
        <p role="status">We could not confirm whether your inquiry was sent. Check the saved send status before making another request.</p>
        <Button className="self-start px-5 py-3" disabled={session.loading || session.pending}
          onClick={() => void session.checkMail()}>Check send status</Button>
      </section>}
      {view.inquiry?.delivery && <Button className="self-start px-5 py-3" disabled={session.loading || session.pending}
        onClick={() => void session.refreshSaved()}>Check for venue replies</Button>}
      {view.proposal && (!venueCards.length || !browsingSettings && view.selections.some(option => option.kind === 'venue')) && <ProposalSummary summary={view.proposal.summary} nextQuestion={view.proposal.nextQuestion} />}
      {!!venueCards.length && (browsingSettings || !view.selections.some(option => option.kind === 'venue')) && <SettingsView embedded brief={view.brief} featured={venueCards[0]} others={venueCards.slice(1)}
        disabled={!!blocked} editBrief={null}
        summary={view.proposal && <ProposalSummary summary={view.proposal.summary} nextQuestion={view.proposal.nextQuestion} />}
        followup={messageForm} onChoose={optionId => {
          setBrowsingSettings(false)
          if (selected.has(optionId)) return
          void session.submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId })
        }} />}
      {canRetryPhotos && <Button className="self-start px-5 py-3" onClick={retryPhotos}>Retry photos</Button>}
      {!view.selections.some(option => option.kind === 'venue') && supplyOptions.length > 0 && <section aria-label="Supplies and sources" className={`mx-auto grid w-full gap-5 ${supplyOptions.length === 1 ? 'max-w-[760px]' : 'max-w-[1000px] md:grid-cols-2'}`}>
        {supplyOptions.map(option => <PlanningOptionCard key={option.id} option={option} selected={selected.has(option.id)} disabled={!!blocked}
          onSelect={() => void session.submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId: option.id })} />)}
      </section>}
      {!browsingSettings && <PlanningArrangement images={venueImages} customerEmail={user?.primaryEmailAddress?.emailAddress ?? ''} view={view} disabled={!!blocked} submit={session.submit} onBack={() => setBrowsingSettings(true)} />}
      {!browsingSettings && venueCards.length > 0 && view.selections.some(option => option.kind === 'venue') && <div className="mx-auto w-full max-w-[760px]">{messageForm}</div>}
      {view.inquiry && <div className="mx-auto w-full max-w-[900px]"><PlanningInquiryEditor key={view.inquiry.id} inquiry={view.inquiry} version={view.version}
        disabled={!!blocked || view.status !== 'ready'} canSend={!!view.canSendInquiry} submit={session.submit} /></div>}
      {view.offer && <PlanningOfferReview offer={view.offer} stale={offerStale} />}
      {view.paymentLink && <PlanningPayment key={view.paymentLink.eventId} link={view.paymentLink} identity={user?.id ?? null} stale={offerStale}
        onRelease={() => { void session.submit({ kind: 'release_payment', requestId: crypto.randomUUID(), expectedVersion: view.version, eventId: view.paymentLink!.eventId }) }} />}
      {view.offer && !view.paymentLink && !offerStale && !view.offer.missing.length && offerCosts?.ok && offerCosts.total > 0
        && <Button className="self-start px-5 py-3" disabled={!!blocked || view.status !== 'ready'}
          onClick={() => void session.submit({ kind: 'prepare_payment', requestId: crypto.randomUUID(), expectedVersion: view.version,
            offerId: view.offer!.id, offerRevision: view.offer!.revision })}>Review sandbox payment</Button>}
      {!view.paymentLink && view.inquiry?.status === 'draft' && view.inquiry.replies?.at(-1)?.status === 'ready'
        && ['quote', 'confirmation'].includes(view.inquiry.replies.at(-1)?.interpretation?.kind ?? '')
        && <Button className="self-start px-5 py-3" disabled={!!blocked || view.status !== 'ready'}
          onClick={() => void session.submit({ kind: 'prepare_offer', requestId: crypto.randomUUID(), expectedVersion: view.version })}>
          {view.offer ? 'Update selected offer' : 'Prepare selected offer'}
        </Button>}
      {view.selections.some(option => option.kind === 'venue') && (!view.inquiry || view.inquiry.status === 'stale' || view.inquiry.delivery?.status === 'failed')
        && <Button className="self-start px-5 py-3" disabled={!!blocked || view.status !== 'ready'}
          onClick={() => void session.submit({ kind: 'prepare_inquiry', requestId: crypto.randomUUID(), expectedVersion: view.version })}>
          {view.inquiry?.delivery?.status === 'failed' ? 'Prepare a replacement inquiry' : view.inquiry ? 'Replace outdated inquiry draft' : 'Prepare venue inquiry'}
        </Button>}
    </>}
    {(!id || !venueCards.length) && messageForm}
  </div>
}
function PlanningOptionCard({ option, selected, disabled, onSelect }: { option: PlanningOption; selected: boolean; disabled: boolean; onSelect: () => void }) {
  return <article className={`flex flex-col gap-4 border p-5 ${selected ? 'border-ink' : 'border-sand'}`}>
    <p className="text-[14px] text-stone">{option.kind === 'venue' ? 'Venue' : 'Supplies'}{selected ? ' / Selected' : ''}</p>
    <h2 className="text-[26px] leading-8 font-light">{displayCopy(option.name)}</h2>
    <p className="text-[17px] leading-6">{displayCopy(option.why)}</p>
    <dl className="flex flex-col gap-3">{option.facts.map((fact, index) => <div key={index}>
      <dt className="text-[14px] text-stone">{displayCopy(fact.label)}</dt>
      <dd className="text-[17px]">{displayCopy(fact.value)}</dd>
      <dd><a className="text-[14px] underline" href={fact.sourceUrl} target="_blank" rel="noreferrer">{fact.basis === 'published' ? 'Published source' : 'Estimate source'}</a></dd>
    </div>)}</dl>
    {option.unknowns.length > 0 && <div><p className="text-[14px] font-semibold">Still to confirm</p>
      <ul className="list-disc pl-5 text-[15px] leading-6">{option.unknowns.map((unknown, index) => <li key={index}>{displayCopy(unknown)}</li>)}</ul></div>}
    <details className="text-[15px] leading-6"><summary className="cursor-pointer underline">Sources and details</summary>
      <a href={option.url} target="_blank" rel="noreferrer" className="underline">View {displayCopy(option.name)}</a>
      {option.facts.map((fact, index) => <blockquote key={index} className="mt-3 border-l border-sand pl-3">{displayCopy(fact.quote)}</blockquote>)}
    </details>
    <Button className="mt-auto px-5 py-3" aria-pressed={selected} disabled={disabled} onClick={onSelect}>{selected ? 'Remove' : 'Select'} {displayCopy(option.name)}</Button>
  </article>
}
