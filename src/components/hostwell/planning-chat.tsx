import { useUser } from '@clerk/tanstack-react-start'
import { useEffect, useRef, useState } from 'react'
import type { PlanningOption } from '../../agent/planning/contract'
import { usePlanningSession } from '../../lib/hostwell/planning-session'
import { Button } from './ui'

export function PlanningIntake({ onCreated }: { onCreated: (id: string) => void }) {
  const { user, isLoaded } = useUser()
  if (!isLoaded) return <p role="status">Loading sign-in...</p>
  if (!user) return <a href="/sign-in?redirect_url=%2F" className="text-[17px] font-semibold underline">Sign in to plan your event</a>
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
  const session = usePlanningSession(id)
  const [draft, setDraft] = useState('')
  const alert = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (session.error) alert.current?.focus() }, [session.error])
  const { view } = session
  const blocked = session.pending || session.loading || !!session.uncertain || !!id && !view
    || view?.status === 'working' || view?.status === 'uncertain'
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
  return <div className="flex w-full max-w-[900px] flex-col gap-8">
    <h1 className="text-[34px] leading-tight font-light tracking-[-0.02em] lg:text-[56px]">{id ? 'Your event, coming together.' : "What are you planning?"}</h1>
    {!id && <p className="text-[18px] leading-7 text-stone">Tell us about the occasion, place, budget, and anything you need. Rough dates are fine. We can work out the details together.</p>}
    {session.loading && <p role="status">Loading your plan...</p>}
    {session.error && <div className="flex flex-col gap-3">
      <p role="alert" tabIndex={-1} ref={alert}>{session.error.message}</p>
      {id && <Button className="self-start px-6 py-3" disabled={session.pending || session.loading} onClick={() => void session.refresh()}>{session.uncertain ? 'Check saved status' : 'Refresh plan'}</Button>}
      {session.error.status === 401 && <a className="underline" href={`/sign-in?redirect_url=${encodeURIComponent(id ? `/planning/${encodeURIComponent(id)}` : '/')}`}>Sign in again</a>}
    </div>}
    {view && <>
      <section aria-label="Conversation" className="flex flex-col gap-4">
        {view.messages.map(message => <div key={message.id} className={`border-l-2 pl-4 ${message.role === 'user' ? 'border-sand' : 'border-gold'}`}>
          <p className="text-[14px] font-semibold text-stone">{message.role === 'user' ? 'You' : 'Arrange'}</p>
          <p className="whitespace-pre-wrap text-[18px] leading-7">{message.text}</p>
        </div>)}
      </section>
      <p role="status" aria-live="polite" className="text-stone">{view.status === 'working' ? view.progress || 'Looking into your event.'
        : view.status === 'failed' ? 'We could not finish this research. Send a message to try again.'
          : view.status === 'uncertain' ? 'We could not confirm the research outcome. Refresh your plan to check for an update.'
            : 'Your options are ready to explore.'}</p>
      {view.status === 'uncertain' && <Button className="self-start px-6 py-3" disabled={session.loading || session.pending} onClick={() => void session.refresh()}>Check for an update</Button>}
      {view.proposal && <div className="flex flex-col gap-3 text-[18px] leading-7">
        <p>{view.proposal.summary}</p>
        {view.proposal.nextQuestion && <p>{view.proposal.nextQuestion}</p>}
      </div>}
      {options.size > 0 && <section aria-label="Your options" className="grid gap-5 md:grid-cols-2">
        {[...options.values()].map(option => <PlanningOptionCard key={option.id} option={option} selected={selected.has(option.id)} disabled={!!blocked}
          onSelect={() => void session.submit({ kind: 'select', requestId: crypto.randomUUID(), expectedVersion: view.version, optionId: option.id })} />)}
      </section>}
      <p className="text-[14px] leading-6 text-stone">Selections save your preferences. Send a message when you want us to research changes. Nothing is booked or purchased.</p>
    </>}
    <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void send() }}>
      <label htmlFor="planning-message" className="text-[18px] font-semibold">{id ? 'Message' : 'Tell us about your event'}</label>
      <textarea id="planning-message" rows={4} maxLength={8000} value={draft} readOnly={session.pending || !!session.uncertain}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }}
        placeholder={id ? 'Keep the venue, but find cheaper supplies...' : 'A birthday dinner for 20 in Oakland next Saturday, around $600...'}
        className="w-full resize-y border-[1.5px] border-sand bg-transparent p-4 text-[18px] leading-7 focus-visible:outline-2 focus-visible:outline-gold" />
      <p className="text-[14px] text-stone">Press Enter to send. Use Shift+Enter for a new line.</p>
      <Button type="submit" disabled={!!blocked || !draft.trim()} className="self-start px-8 py-[17px] text-[18px]">{session.pending ? 'Saving...' : id ? 'Send message' : 'Plan my event'}</Button>
    </form>
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
