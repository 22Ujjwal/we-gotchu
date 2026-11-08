import { Link, Navigate, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ArrangingView } from '#/components/hostwell/arranging-view'
import { PartyView } from '#/components/hostwell/party-view'
import { Header } from '#/components/hostwell/ui'
import { to24h } from '#/lib/hostwell/fixture'
import { buildOrder, findVenue, useHostwell } from '#/lib/hostwell/store'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/party')({
  // Right after Arrange, the preview first shows the "we're on it" screen.
  validateSearch: (search: Record<string, unknown>): { arranging?: boolean } =>
    search.arranging === true || search.arranging === 'true' ? { arranging: true } : {},
  component: PartyPage,
})

/** How long the preview pretends suppliers take to confirm. */
const ARRANGING_MS = 5000

function PartyPage() {
  return localPreview ? <PreviewPartyPage /> : <Navigate to="/" />
}

function PreviewPartyPage() {
  const { brief, addOns, selected, bookedVenueId } = useHostwell()
  const venue = bookedVenueId ? findVenue(bookedVenueId) : undefined
  const { arranging } = Route.useSearch()
  const navigate = useNavigate()
  useEffect(() => {
    if (!arranging || !venue) return
    const done = setTimeout(() => navigate({ to: '/party', replace: true }), ARRANGING_MS)
    return () => clearTimeout(done)
  }, [arranging, venue, navigate])

  if (!venue) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header step="party" />
        <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <p className="m-0 font-script text-[40px] leading-14">Nothing booked yet</p>
          <Link to="/settings" className="text-[17px] font-semibold underline">
            Pick a setting
          </Link>
        </main>
      </div>
    )
  }

  if (arranging) {
    const when = [brief.date, [brief.from, brief.till].filter(Boolean).map(to24h).join('–')]
      .filter(Boolean)
      .join(', ')
    return (
      <ArrangingView
        email="you@example.com"
        items={[
          { label: 'Venue', title: venue.name, detail: when },
          ...addOns
            .filter((a) => selected.has(a.id))
            .map((a) => ({ label: 'Extras', title: a.label })),
        ]}
      />
    )
  }

  const extras = [
    selected.has('candles') && 'Candles on the table',
    ...addOns
      .filter((a) => a.id !== 'candles' && selected.has(a.id))
      .map((a) => a.label),
  ].filter((e): e is string => !!e)
  return (
    <PartyView
      brief={brief}
      venue={venue}
      order={buildOrder(venue, addOns, selected)}
      extras={extras}
      place={`${venue.neighbourhood}, Berlin`}
      timezone="Europe/Berlin"
      receiptsHref="/receipts"
    />
  )
}
