import { useUser } from '@clerk/tanstack-react-start'
import { useEffect, useRef, useState } from 'react'
import type { Brief } from '../../contracts'
import { briefFromDraft, draftFromBrief } from '../../lib/hostwell/brief-adapter'
import { useEventSession } from '../../lib/hostwell/use-event-session'
import { BriefForm } from './brief-form'
import { EventDetails } from './event-details'
import { Button } from './ui'

export function ConnectedEventPage({ eventId }: { eventId: string }) {
  const { user, isLoaded } = useUser()
  if (!isLoaded) return <p role="status">Loading sign-in...</p>
  return <EventPage key={`${user?.id ?? 'signed-out'}:${eventId}`} eventId={eventId} identity={user?.id ?? null} />
}

// Used by the canonical route; explicit identity also supports controlled HTTP journey tests.
export function EventPage({ eventId, identity, onCheckout = url => window.location.assign(url) }: {
  eventId: string; identity: string | null; onCheckout?: (url: string) => void;
}) {
  return <EventSessionPage key={`${identity}:${eventId}`} eventId={eventId} identity={identity} onCheckout={onCheckout} />
}

function EventSessionPage({ eventId, identity, onCheckout }: {
  eventId: string; identity: string | null; onCheckout: (url: string) => void;
}) {
  const session = useEventSession({ eventId, identity })
  const [editing, setEditing] = useState<Brief | null>(null)
  const [actionError, setActionError] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const error = actionError || session.error?.message
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  if (!identity) return <a href={`/sign-in?redirect_url=${encodeURIComponent(`/events/${encodeURIComponent(eventId)}`)}`}
    className="text-[17px] font-semibold underline">Sign in to view your event</a>
  const act = async (operation: () => Promise<void>) => {
    setActionError('')
    try { await operation() }
    catch (cause) { if (active.current) setActionError(cause instanceof Error ? cause.message : 'The action failed. Refresh before trying again.') }
  }
  return <main className="flex flex-col items-center gap-6 px-5 pt-8 pb-10 lg:gap-10 lg:px-12 lg:pt-10 lg:pb-14">
    {session.loading && <p role="status">Loading your event...</p>}
    {error && <p role="alert" tabIndex={-1} ref={errorRef} className="text-[16px] leading-6 text-body">{error}</p>}
    {session.error?.status === 401 && <a href={`/sign-in?redirect_url=${encodeURIComponent(`/events/${encodeURIComponent(eventId)}`)}`} className="underline">Sign in again</a>}
    {session.error && <Button disabled={session.pending || session.loading} onClick={() => void act(session.refresh)} className="px-6 py-[13px]">Refresh event</Button>}
    {session.view && <>
      {editing && <section aria-label="Edit event brief" className="flex w-full flex-col items-center gap-6">
        <BriefForm initial={draftFromBrief(editing)} edit submitLabel="Update brief" pending={session.pending} onSubmit={async next => {
          // Compare normalized form values so unchanged timestamps and supply text are not rewritten.
          const baseline = briefFromDraft(draftFromBrief(editing))
          const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) =>
            JSON.stringify(value) !== JSON.stringify(baseline[key as keyof Brief]))) as Partial<Brief>
          await session.update(changes)
          if (active.current) setEditing(null)
        }} />
        <button type="button" disabled={session.pending} onClick={() => setEditing(null)} className="underline">Close editor</button>
        {session.error?.code === 'stale_brief' && <p>Your edits are retained. Review the latest event before submitting again.</p>}
      </section>}
      <EventDetails view={session.view} pending={session.pending || !!session.error} onEdit={() => setEditing(session.view!.event.brief)}
        onApprove={() => void act(async () => {
          const url = await session.approve()
          if (active.current) onCheckout(url)
        })}
        onCancel={() => void act(session.cancel)} />
    </>}
  </main>
}
