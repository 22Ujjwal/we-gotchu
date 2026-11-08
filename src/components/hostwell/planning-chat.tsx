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
  const venueCards = venueOptions.map(option => ({ id: option.id, name: option.name, photos: [] as string[],
    cardFeatures: option.facts.slice(0, 3).map(fact => ({ icon: (/capacity|seat|guest/i.test(fact.label) ? 'guests'
      : /cancel|date|time/i.test(fact.label) ? 'calendar' : 'fee') as Feature['icon'], label: `${fact.label}: ${fact.value}` })) }))
  const answerAlreadyShown = view?.messages.some(message => message.role === 'assistant' && message.text === proposalText)
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
      <p role="status" aria-live="polite" className="text-stone">{view.status === 'working' ? view.progress || 'Looking into your event.'
        : view.status === 'blocked' ? "Research is paused for our team's review."
        : view.status === 'failed' ? 'We could not finish this research. Send a message to try again.'
          : view.status === 'uncertain' ? 'We could not confirm the research outcome. Refresh your plan to check for an update.'
            : 'Your options are ready to explore.'}</p>
      {!!view.activity?.length && <details className="mx-auto w-full max-w-[900px]"><summary className="cursor-pointer underline">Research activity</summary><section aria-label="Research activity" className="flex flex-col gap-3">
        {view.activity.map((item, index) => <div key={`${item.name}:${index}`} className="border-l-2 border-sand pl-4">
          <p className="text-[16px] font-semibold">{item.name}</p>
          <p className="text-[16px] text-stone">{item.detail}</p>
        </div>)}
      </section></details>}
      {view.canReviewResearch && ['blocked', 'uncertain'].includes(view.status) && <details className="flex flex-col gap-4">
        <summary className="cursor-pointer underline">Operator review for local testing</summary>
        <p className="my-3">This is an internal research review, not a customer decision. Review the exact request before allowing or declining this one call.</p>
        {!view.approvals?.length && <p>This request needs operator attention. No research call can be approved here.</p>}
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
      {view.status === 'uncertain' && <Button className="self-start px-6 py-3" disabled={session.loading || session.pending} onClick={() => void session.refresh()}>Check for an update</Button>}

      {view.inquiry?.delivery?.status === 'uncertain' && <Button className="self-start px-5 py-3" disabled={session.loading || session.pending}
        onClick={() => void session.checkMail()}>Check send status</Button>}
      {view.inquiry?.delivery && <Button className="self-start px-5 py-3" disabled={session.loading || session.pending}
        onClick={() => void session.refreshSaved()}>Check for venue replies</Button>}
      {view.proposal && !venueCards.length && !answerAlreadyShown && <div className="flex flex-col gap-3 text-[18px] leading-7">
        <p>{view.proposal.summary}</p>
        {view.proposal.nextQuestion && <p>{view.proposal.nextQuestion}</p>}
      </div>}
      {!!venueCards.length && (browsingSettings || !view.selections.some(option => option.kind === 'venue')) && <SettingsView embedded brief={view.brief} featured={venueCards[0]} others={venueCards.slice(1)}
        disabled={!!blocked} editBrief={<a href="/" className="underline">Plan another event</a>}
        summary={<div className="max-w-[760px] text-center text-[18px] leading-7"><p>{view.proposal?.summary}</p>
          {view.proposal?.nextQuestion && <p className="mt-3">{view.proposal.nextQuestion}</p>}
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
      {view.inquiry && <details className="mx-auto w-full max-w-[900px]"><summary className="cursor-pointer underline">Inquiry details</summary><PlanningInquiryEditor key={view.inquiry.id} inquiry={view.inquiry} version={view.version}
        disabled={!!blocked || view.status !== 'ready'} canSend={!!view.canSendInquiry} submit={session.submit} /></details>}
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
      <p className="text-[14px] leading-6 text-stone">Selections save your preferences. Send a message when you want us to research changes. Nothing is booked or purchased.</p>
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
