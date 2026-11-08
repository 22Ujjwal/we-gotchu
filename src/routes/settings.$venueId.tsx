import { Link, createFileRoute, notFound, redirect, useNavigate } from '@tanstack/react-router'
import { VenueView } from '#/components/hostwell/venue-view'
import { buildOrder, findVenue, useHostwell } from '#/lib/hostwell/store'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/settings/$venueId')({
  loader: ({ params }) => {
    if (!localPreview) throw redirect({ to: '/' })
    const venue = findVenue(params.venueId)
    if (!venue) throw notFound()
    return venue
  },
  component: VenuePage,
})

function VenuePage() {
  const venue = Route.useLoaderData()
  const { brief, addOns, selected, setBookedVenueId } = useHostwell()
  const navigate = useNavigate()

  return (
    <VenueView
      venue={venue}
      brief={brief}
      order={buildOrder(venue, addOns, selected)}
      addOns
      back={
        <Link to="/settings" className="underline decoration-1 [text-underline-position:from-font]">
          Back to settings
        </Link>
      }
      onArrange={() => {
        sessionStorage.removeItem('demo-quotes-key')
        setBookedVenueId(venue.id)
        navigate({ to: '/party', search: { arranging: true } })
      }}
    />
  )
}
