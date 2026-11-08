import { useUser } from '@clerk/tanstack-react-start'
import { Link, useParams } from '@tanstack/react-router'
import { receiptsFromView } from '../../lib/hostwell/receipts'
import { useEventSession } from '../../lib/hostwell/use-event-session'
import { Loading, Notice } from './event-page'
import { ReceiptDetailView, ReceiptsView } from './receipts-view'
import type { ReceiptLink } from './receipts-view'

/** All of an event's receipts, or one of them with what the agent did for it. */
export function ConnectedReceiptsPage({ eventId, receiptId }: { eventId: string; receiptId?: string }) {
  const { user, isLoaded } = useUser()
  if (!isLoaded) return <Loading />
  const back = receiptId ? `/events/${encodeURIComponent(eventId)}/receipts/${encodeURIComponent(receiptId)}`
    : `/events/${encodeURIComponent(eventId)}/receipts`
  const signIn = `/sign-in?redirect_url=${encodeURIComponent(back)}`
  if (!user) return <Notice step="party" title="Sign in to see your receipts" action={<a href={signIn}>Sign in</a>} />
  return <ReceiptsSession key={`${user.id}:${eventId}`} eventId={eventId} identity={user.id} receiptId={receiptId} signIn={signIn} />
}

function ReceiptsSession({ eventId, identity, receiptId, signIn }: {
  eventId: string
  identity: string
  receiptId?: string
  signIn: string
}) {
  const session = useEventSession({ eventId, identity })
  if (!session.view) {
    if (!session.error) return <Loading />
    return (
      <Notice
        step="party"
        title={session.error.status === 401 ? 'Sign in again' : 'We could not load your receipts'}
        action={session.error.status === 401 ? <a href={signIn}>Sign in</a>
          : <button type="button" disabled={session.loading} onClick={() => void session.refresh().catch(() => {})}>Try again</button>}
      />
    )
  }

  const data = receiptsFromView(session.view)
  if (!receiptId) return <ReceiptsView data={data} Link={EventReceiptLink} />
  const receipt = data.receipts.find((r) => r.id === receiptId)
  if (!receipt) {
    return <Notice step="party" title="We couldn't find that receipt" action={<EventReceiptLink>Back to receipts</EventReceiptLink>} />
  }
  return <ReceiptDetailView data={data} receipt={receipt} Link={EventReceiptLink} />
}

const EventReceiptLink: ReceiptLink = ({ receiptId, className, children }) => {
  const { eventId = '' } = useParams({ strict: false })
  return receiptId
    ? <Link to="/events/$eventId/receipts/$receiptId" params={{ eventId, receiptId }} className={className}>{children}</Link>
    : <Link to="/events/$eventId/receipts" params={{ eventId }} className={className}>{children}</Link>
}

/** Links between the UI-only preview's receipts. */
export const PreviewReceiptLink: ReceiptLink = ({ receiptId, className, children }) =>
  receiptId
    ? <Link to="/receipts/$receiptId" params={{ receiptId }} className={className}>{children}</Link>
    : <Link to="/receipts" className={className}>{children}</Link>
