import { Navigate, createFileRoute } from '@tanstack/react-router'
import { ConnectedEventPage } from '#/components/hostwell/event-page'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/events/$eventId')({
  // Stripe sends people back with ?checkout=success or ?checkout=canceled.
  validateSearch: (search: Record<string, unknown>): { checkout?: string } =>
    typeof search.checkout === 'string' ? { checkout: search.checkout } : {},
  component: EventRoute,
})

function EventRoute() {
  const { eventId } = Route.useParams()
  const { checkout } = Route.useSearch()
  return localPreview ? <Navigate to="/" />
    : <ConnectedEventPage eventId={eventId} paid={checkout === 'success'} />
}
