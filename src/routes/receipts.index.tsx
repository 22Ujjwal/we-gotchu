import { Navigate, createFileRoute } from '@tanstack/react-router'
import { PreviewReceiptLink } from '#/components/hostwell/receipts-page'
import { ReceiptsView } from '#/components/hostwell/receipts-view'
import { previewReceipts } from '#/lib/hostwell/receipts'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/receipts/')({ component: ReceiptsPage })

function ReceiptsPage() {
  return localPreview ? <ReceiptsView data={previewReceipts} Link={PreviewReceiptLink} /> : <Navigate to="/" />
}

