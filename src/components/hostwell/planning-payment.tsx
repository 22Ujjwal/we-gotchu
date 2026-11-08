import { useState } from 'react'
import type { PlanningPaymentLink } from '../../agent/planning/offer-contract'
import { useEventSession } from '../../lib/hostwell/use-event-session'
import { Button } from './ui'

export function PlanningPayment({ link, identity, stale, onRelease, onCheckout = url => window.location.assign(url) }: {
  link: PlanningPaymentLink; identity: string | null; stale: boolean; onRelease?: () => void; onCheckout?: (url: string) => void;
}) {
  const session = useEventSession({ eventId: link.eventId, identity })
  const [approved, setApproved] = useState(false)
  const view = session.view
  if (!identity) return <p>Sign in to review payment.</p>
  const matches = view?.plan?.planId === link.planId && view.plan.revision === link.planRevision
  const canApprove = matches && !stale && !view?.event.cancelRequestedAt
    && ['plan_ready', 'awaiting_payment'].includes(view?.event.status ?? '') && view?.payment?.state !== 'paid'
  const total = view?.plan && new Intl.NumberFormat('en-US', { style: 'currency', currency: view.plan.currency.toUpperCase() }).format(view.plan.total / 100)
  return <section aria-label="Sandbox payment" className="flex flex-col gap-4 border border-sand p-5">
    <h2 className="text-[26px] font-light">Sandbox payment</h2>
    {session.loading && <p role="status">Loading saved payment status...</p>}
    {session.error && <p role="alert">{session.error.message}</p>}
    {view && <>
      <p>Supplier execution is simulated. No real reservation or purchase will be made.</p>
      {view.payment?.state === 'paid' ? <p role="status">{view.payment.mode === 'test' ? 'Sandbox payment received.' : 'Simulated payment recorded.'}</p>
        : view.payment?.state === 'pending' ? <p role="status">Payment is pending. We wait for the payment provider's confirmation.</p>
          : view.payment?.state === 'expired' ? <p role="status">The previous Checkout expired without a confirmed payment.</p>
            : <p>No payment recorded.</p>}
      {view.payment?.refundState !== undefined && view.payment.refundState !== 'none' && <p>Sandbox refund: {view.payment.refundState}.</p>}
      {canApprove && <>
        <p>Selected plan total: {total}</p>
        <label className="flex items-start gap-3"><input type="checkbox" checked={approved} disabled={session.pending}
          onChange={event => setApproved(event.target.checked)} />
          I approve this selected plan, its quantities, quoted terms and {total} total for sandbox payment.
        </label>
        <Button className="self-start px-5 py-3" disabled={!approved || session.pending || session.loading || !!session.error}
          onClick={() => { void session.approve().then(onCheckout).catch(() => undefined) }}>Approve and open sandbox Checkout</Button>
      </>}
      {stale && <p role="alert">The offer changed. This payment plan cannot be approved.</p>}
      {view.event.cancelRequestedAt && <p>{view.event.status === 'canceled' ? 'This payment plan was canceled.'
        : 'Cancellation is in progress. Supplier settlement and any refund may still be pending.'}</p>}
      {(!view.event.cancelRequestedAt || view.event.status === 'canceling') && <Button className="self-start px-5 py-3" disabled={session.pending || session.loading}
        onClick={() => { void session.cancel().catch(() => undefined) }}>
        {view.event.cancelRequestedAt ? 'Continue cancellation' : 'Cancel sandbox payment plan'}
      </Button>}
      {view.event.status === 'canceled' && onRelease && (!view.payment || view.payment.state === 'expired'
        || view.payment.state === 'paid' && view.payment.refundState === 'succeeded')
        && <Button className="self-start px-5 py-3" disabled={session.pending || session.loading} onClick={onRelease}>
          Update offer after cancellation
        </Button>}
    </>}
    <Button className="self-start px-5 py-3" disabled={session.loading || session.pending}
      onClick={() => void session.refresh()}>Check payment status</Button>
  </section>
}
