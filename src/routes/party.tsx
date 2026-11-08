import { Link, Navigate, createFileRoute } from '@tanstack/react-router'
import { PartyView } from '#/components/hostwell/party-view'
import { Header } from '#/components/hostwell/ui'
import { buildOrder, findVenue, useHostwell } from '#/lib/hostwell/store'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/party')({ component: PartyPage })

function PartyPage() {
  return localPreview ? <PreviewPartyPage /> : <Navigate to="/" />
}

function PreviewPartyPage() {
  const { brief, addOns, selected, bookedVenueId } = useHostwell()
  const venue = bookedVenueId ? findVenue(bookedVenueId) : undefined

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
    />
  )
}
