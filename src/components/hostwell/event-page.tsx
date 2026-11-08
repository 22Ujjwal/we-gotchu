import { useUser } from '@clerk/tanstack-react-start'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { settingsFromView } from '../../lib/hostwell/brief-adapter'
import { useEventSession } from '../../lib/hostwell/use-event-session'
import { PartyView } from './party-view'
import { ReceiptLoader } from './receipt-loader'
import { SettingsView } from './settings-view'
import { Header } from './ui'
import { VenueView } from './venue-view'

export function ConnectedEventPage({ eventId, paid = false }: { eventId: string; paid?: boolean }) {
  const { user, isLoaded } = useUser()
  if (!isLoaded) return <Loading />
  return <EventPage key={`${user?.id ?? 'signed-out'}:${eventId}`} eventId={eventId} identity={user?.id ?? null} paid={paid} />
}

// Used by the canonical route; explicit identity also supports controlled HTTP journey tests.
export function EventPage({ eventId, identity, paid = false, onCheckout = (url) => window.location.assign(url) }: {
  eventId: string
  identity: string | null
  /** Back from a completed Stripe checkout. */
  paid?: boolean
  onCheckout?: (url: string) => void
}) {
  const signIn = `/sign-in?redirect_url=${encodeURIComponent(`/events/${encodeURIComponent(eventId)}`)}`
  if (!identity) return <Notice title="Sign in to see your event" action={<a href={signIn}>Sign in</a>} />
  return <EventSessionPage key={`${identity}:${eventId}`} eventId={eventId} identity={identity} onCheckout={onCheckout} signIn={signIn} paid={paid} />
}

export function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header step="setting" />
      <ReceiptLoader />
    </div>
  )
}

export function Notice({ title, action, step = 'setting' }: { title: string; action: ReactNode; step?: 'setting' | 'party' }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header step={step} />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="m-0 font-script text-[40px] leading-14 font-normal">{title}</h1>
        <div className="text-[17px] font-semibold underline">{action}</div>
      </main>
    </div>
  )
}

function EventSessionPage({ eventId, identity, onCheckout, signIn, paid }: {
  eventId: string
  paid: boolean
  identity: string
  onCheckout: (url: string) => void
  signIn: string
}) {
  const session = useEventSession({ eventId, identity })
  const [chosen, setChosen] = useState<string | null>(null)
  const [error, setError] = useState('')
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  const { view } = session
  if (!view) {
    if (!session.error) return <Loading />
    return (
      <Notice
        title={session.error.status === 401 ? 'Sign in again' : 'We could not load your event'}
        action={session.error.status === 401 ? <a href={signIn}>Sign in</a>
          : <button type="button" disabled={session.loading} onClick={() => void session.refresh().catch(() => {})}>Try again</button>}
      />
    )
  }

  const { event, payment } = view
  const settings = settingsFromView(view)
  const booked = payment?.state === 'paid' || ['executing', 'booked', 'partially_booked'].includes(event.status)

  if (event.status === 'canceled' || event.status === 'canceling') {
    return <Notice title="This event is canceled" action={<a href="/">Plan another</a>} />
  }
  // Payment is confirmed by Stripe's webhook a few seconds after checkout.
  if (paid && payment?.state === 'pending' && !booked) return <Loading />
  if (booked && settings.planned) {
    return (
      <PartyView
        brief={settings.brief}
        venue={settings.planned}
        order={settings.order(settings.planned)}
        place={event.brief.location}
        timezone={event.brief.timezone}
        receiptsHref={`/events/${encodeURIComponent(eventId)}/receipts`}
        incomplete={event.status !== 'booked' ||
          view.attempts.some((a) => a.kind === 'commit' && a.state !== 'succeeded')}
      />
    )
  }
  if (settings.venues.length === 0) {
    if (event.status === 'researching' || view.run?.state === 'running') return <Loading />
    return <Notice title="We couldn't find a setting" action={<a href="/">Edit brief</a>} />
  }

  const venue = settings.venues.find((v) => v.id === chosen)
  if (!venue) {
    const [featured, ...others] = settings.venues
    return (
      <SettingsView
        brief={settings.brief}
        featured={featured}
        others={others}
        editBrief={<a href="/" className="underline decoration-1 [text-underline-position:from-font]">Edit brief</a>}
        onChoose={(id) => {
          setError('')
          setChosen(id)
          window.scrollTo(0, 0)
        }}
      />
    )
  }

  const bookable = settings.approvable && settings.planned?.id === venue.id
  return (
    <VenueView
      venue={venue}
      brief={settings.brief}
      order={settings.order(venue)}
      disabled={!bookable || session.pending || !!session.error}
      error={error}
      back={
        <button
          type="button"
          onClick={() => setChosen(null)}
          className="cursor-pointer underline decoration-1 [text-underline-position:from-font]"
        >
          Back to settings
        </button>
      }
      onArrange={() => {
        setError('')
        session.approve().then(
          (url) => { if (active.current) onCheckout(url) },
          (cause: unknown) => {
            if (active.current) setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.')
          },
        )
      }}
    />
  )
}
