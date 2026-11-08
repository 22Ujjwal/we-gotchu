import { useUser } from '@clerk/tanstack-react-start'
import { useEffect, useRef, useState } from 'react'
import type { Brief } from '../../contracts'
import { briefFromDraft, draftFromBrief } from '../../lib/hostwell/brief-adapter'
import { EventApiError } from '../../lib/hostwell/event-api'
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
  const [editing, setEditing] = useState<{ brief: Brief; revision: number; conflicted?: boolean } | null>(null)
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
        <BriefForm initial={draftFromBrief(editing.brief)} edit submitLabel="Update brief" pending={session.pending} onSubmit={async next => {
          // Compare normalized form values so unchanged timestamps and supply text are not rewritten.
          const baseline = briefFromDraft(draftFromBrief(editing.brief))
          const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) =>
            JSON.stringify(value) !== JSON.stringify(baseline[key as keyof Brief]))) as Partial<Brief>
          if (Object.keys(changes).length === 0) { setEditing(null); return }
          try { await session.update(changes, editing.revision) }
          catch (cause) {
            if (active.current && cause instanceof EventApiError && cause.code === 'stale_brief') {
              setEditing(current => current && { ...current, conflicted: true })
            }
            throw cause
          }
          if (active.current) setEditing(null)
        }} />
        <button type="button" disabled={session.pending} onClick={() => setEditing(null)} className="underline">Close editor</button>
        {editing.conflicted && <>
          <p>Your edits are retained. Review the latest saved answers below. Applying your edits will replace only the fields you changed.</p>
          <details><summary>Latest saved answers</summary>
            <dl>{Object.entries(session.view.event.brief).map(([field, value]) => <div key={field}>
              <dt>{field.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt>
              <dd>{Array.isArray(value) ? value.join(', ') || 'None' : String(value)}</dd>
            </div>)}</dl>
            <p>Budget and cancellation loss are shown in minor currency units.</p>
          </details>
          <button type="button" className="underline"
            disabled={session.pending || session.loading || session.view.event.briefRevision <= editing.revision}
            onClick={() => setEditing({ ...editing, revision: session.view!.event.briefRevision, conflicted: false })}>
            Apply my edits to the latest revision
          </button>
        </>}
      </section>}
      <EventDetails view={session.view} pending={session.pending || !!session.error} onEdit={() => void act(async () => {
        if (editing) return
        const brief = session.view!.event.brief
        draftFromBrief(brief)
        setEditing({ brief, revision: session.view!.event.briefRevision })
      })}
        onApprove={() => void act(async () => {
          const url = await session.approve()
          if (active.current) onCheckout(url)
        })}
        onCancel={() => void act(session.cancel)} />
    </>}
  </main>
}
