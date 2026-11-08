import { Navigate, createFileRoute } from '@tanstack/react-router'
import { ConnectedReceiptsPage } from '#/components/hostwell/receipts-page'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/events/$eventId_/receipts/$receiptId')({ component: ReceiptRoute })

function ReceiptRoute() {
  const { eventId, receiptId } = Route.useParams()
  return localPreview ? <Navigate to="/receipts" /> : <ConnectedReceiptsPage eventId={eventId} receiptId={receiptId} />
}
