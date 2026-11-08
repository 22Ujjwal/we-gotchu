import { useState, type ReactNode } from 'react'
import type { PlanningView } from '../../agent/planning/contract'
import type { PlanningPaymentLink } from '../../agent/planning/offer-contract'
import { useEventSession } from '../../lib/hostwell/use-event-session'
import { Button } from './ui'
import { formatPaymentAmount } from '../../lib/payment-money'
import { bookingStatus, customerStage, isDemo, PlanningStatus } from './planning-status'

export function PlanningPayment({ link, identity, stale, planning, renderOffer, onRelease, onCheckout = url => window.location.assign(url) }: {
  link: PlanningPaymentLink; identity: string | null; stale: boolean; planning?: PlanningView
  /** Places the approval control inside the offer, next to the terms it approves. */
  renderOffer?: (approval: ReactNode) => ReactNode
  onRelease?: () => void; onCheckout?: (url: string) => void;
}) {
  const session = useEventSession({ eventId: link.eventId, identity })
  const [approved, setApproved] = useState(false)
  const view = session.view
  if (!identity) return <p>Sign in to review payment.</p>
  const matches = view?.plan?.planId === link.planId && view.plan.revision === link.planRevision
  const canApprove = matches && !stale && !view?.event.cancelRequestedAt
    && ['plan_ready', 'awaiting_payment'].includes(view?.event.status ?? '') && view?.payment?.state !== 'paid'
  const total = view?.plan && formatPaymentAmount(view.plan.total, view.plan.currency)
  const saved = view ? { paymentState: view.payment?.state, eventStatus: view.event.status } : null
  const stage = planning && customerStage(planning, saved, stale)
  const approval = view && canApprove ? <div className="flex flex-col gap-3">
    <label className="flex items-start gap-3"><input type="checkbox" checked={approved} disabled={session.pending}
      onChange={event => setApproved(event.target.checked)} />
      I approve this selected plan, its quantities, quoted terms and {total} total for sandbox payment.
    </label>
    <Button className="self-start px-6 py-4" disabled={!approved || session.pending || session.loading || !!session.error}
      onClick={() => { void session.approve().then(onCheckout).catch(() => undefined) }}>Approve and pay</Button>
  </div> : null
  return <>
    {planning && stage && <PlanningStatus stage={stage} demo={isDemo(planning)} />}
    {renderOffer ? renderOffer(approval) : approval}
    <section aria-label="Payment and booking" className="mx-auto flex w-full max-w-[900px] flex-col gap-4 border border-sand p-6">
      {session.loading && <p role="status">Loading saved payment status...</p>}
      {session.error && <p role="alert">{session.error.message}</p>}
      {view && <>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-[14px] text-stone">Payment</dt><dd className="text-[18px]">{view.payment?.state === 'paid'
            ? view.payment.mode === 'test' ? 'Received (Stripe test mode)' : 'Received (simulated)'
            : view.payment?.state === 'pending' ? 'Processing'
              : view.payment?.state === 'expired' ? 'Checkout expired. Nothing was charged.' : 'Not paid yet'}</dd></div>
          <div><dt className="text-[14px] text-stone">Booking</dt><dd className="text-[18px]">{bookingStatus(planning?.arrangement?.status, saved)}</dd></div>
        </dl>
        {view.payment?.refundState !== undefined && view.payment.refundState !== 'none' && <p>Refund: {view.payment.refundState}.</p>}
        {stale && <p role="alert">The offer changed. This payment plan cannot be approved.</p>}
        {view.event.cancelRequestedAt && <p>{view.event.status === 'canceled' ? 'This payment plan was canceled.'
          : 'Cancellation is in progress. Supplier settlement and any refund may still be pending.'}</p>}
        {(!view.event.cancelRequestedAt || view.event.status === 'canceling') && <Button className="self-start px-5 py-3" disabled={session.pending || session.loading}
          onClick={() => { void session.cancel().catch(() => undefined) }}>
          {view.event.cancelRequestedAt ? 'Continue cancellation' : 'Cancel payment plan'}
        </Button>}
        {view.event.status === 'canceled' && onRelease && (!view.payment || view.payment.state === 'expired'
          || view.payment.state === 'paid' && view.payment.refundState === 'succeeded')
          && <Button className="self-start px-5 py-3" disabled={session.pending || session.loading} onClick={onRelease}>
            Update offer after cancellation
          </Button>}
      </>}
    </section>
  </>
}
