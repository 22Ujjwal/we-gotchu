import { Navigate, createFileRoute } from '@tanstack/react-router'
import { PreviewReceiptLink } from '#/components/hostwell/receipts-page'
import { ReceiptDetailView } from '#/components/hostwell/receipts-view'
import { previewReceipts } from '#/lib/hostwell/receipts'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/receipts/$receiptId')({ component: ReceiptPage })

function ReceiptPage() {
  const { receiptId } = Route.useParams()
  const receipt = previewReceipts.receipts.find((r) => r.id === receiptId)
  if (!localPreview) return <Navigate to="/" />
  if (!receipt) return <Navigate to="/receipts" />
  return <ReceiptDetailView data={previewReceipts} receipt={receipt} Link={PreviewReceiptLink} />
}
