import type { ReactNode } from 'react'
import type { PlanningView } from '../../agent/planning/contract'
import { calculateOfferCosts } from '../../agent/planning/offer-contract'

export type CustomerStage = { label: string; detail: string }
export type SavedPayment = { paymentState?: string; eventStatus?: string } | null

const stages = {
  waiting: { label: 'Waiting for venue', detail: "We're waiting for the venue to confirm the price and availability. You can close this page. We'll email you." },
  checking: { label: 'Our team is checking', detail: "Something needs a closer look on our side. You don't need to do anything. We'll email you." },
  review: { label: 'Review your offer', detail: 'Check the total and terms below, then approve to pay.' },
  processing: { label: 'Payment processing', detail: "We're waiting for the payment to clear. You can close this page." },
  paid: { label: 'Payment received', detail: "We've asked the venue to confirm your booking. You can close this page. We'll email you." },
  confirmed: { label: 'Booking confirmed', detail: "The venue confirmed your booking. We'll email you the details." },
  canceled: { label: 'Payment plan canceled', detail: 'You can ask for an updated offer below.' },
  changed: { label: 'Your choices changed', detail: 'Review your venue and supplies, then ask us to arrange them again.' },
} satisfies Record<string, CustomerStage>

/** Short labels are fixed so each one keeps one meaning; the agent writes only the option-specific text. */
export function customerStage(view: PlanningView, payment: SavedPayment, offerStale: boolean): CustomerStage | null {
  const arrangement = view.arrangement
  if (!arrangement) return null
  if (arrangement.status === 'stale') return stages.changed
  if (payment && ['canceling', 'canceled'].includes(payment.eventStatus ?? '')) return stages.canceled
  if (arrangement.status === 'vendor_confirmed' || payment?.eventStatus === 'booked') return stages.confirmed
  if (payment?.paymentState === 'paid' || arrangement.status === 'awaiting_vendor_confirmation') return stages.paid
  if (payment?.paymentState === 'pending') return stages.processing
  const offer = view.offer
  if (offer && !offerStale && !offer.missing.length && calculateOfferCosts(offer).ok) return stages.review
  if (arrangement.status === 'needs_attention') return stages.checking
  return stages.waiting
}

export function bookingStatus(status: string | undefined, payment: SavedPayment): string {
  if (status === 'vendor_confirmed' || payment?.eventStatus === 'booked') return 'Confirmed by the venue'
  if (payment?.eventStatus === 'partially_booked') return 'Partly booked. Our team is checking.'
  if (payment?.eventStatus === 'canceled') return 'Canceled'
  if (payment?.eventStatus === 'canceling') return 'Canceling'
  if (status === 'awaiting_vendor_confirmation' || payment?.eventStatus === 'executing' || payment?.paymentState === 'paid') return 'Waiting for the venue to confirm'
  return 'Starts after payment'
}

type SessionState = { pending: boolean; loading: boolean; uncertain: unknown; error: { status: number } | null; view: PlanningView | null }

export function planningBlocked(session: SessionState, saved: boolean): boolean {
  const { view } = session
  return session.pending || session.loading || !!session.uncertain || saved && !view
    || view?.inquiry?.delivery?.status === 'pending' || view?.status === 'working' || view?.status === 'uncertain' || view?.status === 'blocked'
    || !!session.error && ![409, 400, 422].includes(session.error.status)
}

export function isDemo(view: PlanningView): boolean {
  return !!view.arrangement?.controlled || view.offer?.mode === 'simulated' || view.inquiry?.delivery?.mode === 'simulated'
}

export function PlanningStatus({ stage, demo, children }: { stage: CustomerStage; demo: boolean; children?: ReactNode }) {
  return <section aria-label="Arrangement status" className="mx-auto flex w-full max-w-[900px] flex-col gap-3 border border-sand bg-cream p-6">
    {demo && <p className="text-[14px] font-semibold text-stone">Demo: venue emails go to a controlled test inbox, payment uses Stripe test mode and the booking is simulated. No real venue is contacted or charged.</p>}
    <div role="status" aria-live="polite">
      <h2 className="text-[26px] font-light">{stage.label}</h2>
      <p className="mt-2 text-[18px] leading-7">{stage.detail}</p>
    </div>
    {children}
  </section>
}
