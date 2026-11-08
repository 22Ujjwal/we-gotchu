import { Navigate, createFileRoute } from '@tanstack/react-router'
import { ConnectedReceiptsPage } from '#/components/hostwell/receipts-page'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/events/$eventId_/receipts/')({ component: ReceiptsRoute })

function ReceiptsRoute() {
  const { eventId } = Route.useParams()
  return localPreview ? <Navigate to="/receipts" /> : <ConnectedReceiptsPage eventId={eventId} />
}
