import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Receipt } from './receipt'
import { AddOnList, Button, FeatureRow, Guests, Header, MetaLine, Photo } from './ui'
import { to24h } from '#/lib/hostwell/fixture'
import type { Brief, Venue } from '#/lib/hostwell/fixture'
import type { Order } from '#/lib/hostwell/store'

export function VenueView({
  venue,
  photoCredit,
  brief,
  order,
  back,
  addOns = false,
  onArrange,
  disabled = false,
  error,
  embedded = false,
  extras,
  receipt,
  action,
}: {
  photoCredit?: ReactNode
  venue: Pick<Venue, 'name' | 'neighbourhood' | 'photos' | 'description' | 'detailFeatures'> & Partial<Venue>
  brief: Brief
  order?: Order
  /** The "Back to settings" link or button. */
  back: ReactNode
  /** Offer extras before booking. */
  addOns?: boolean
  onArrange: () => void
  disabled?: boolean
  error?: string
  embedded?: boolean
  extras?: ReactNode
  receipt?: ReactNode
  action?: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const bookLabel = 'Arrange'

  return (
    <div className={`flex flex-col ${embedded ? 'w-full' : 'min-h-screen'}`}>
      {!embedded && <Header step="setting" />}
      <main className="flex flex-col items-center gap-6 px-5 pt-7 pb-10 lg:gap-10 lg:px-12 lg:pt-10 lg:pb-14">
        <div className="flex flex-col items-center gap-2 text-center lg:gap-3.5">
          <h1 className="m-0 font-script text-[34px] leading-[48px] font-normal lg:text-[46px] lg:leading-16">
            {venue.name}
          </h1>
          {!embedded && <MetaLine>
            <span>
              {brief.date}, {to24h(brief.from)}
            </span>
            <span>{venue.neighbourhood}</span>
            <Guests n={brief.guests} />
            <span className="hidden lg:inline">≤ ${brief.budget.replace(/^\$/, '')}</span>
            {back}
          </MetaLine>}
        </div>

        <div className="flex w-full max-w-[1100px] flex-col items-start gap-8 lg:flex-row lg:gap-14">
          <div className="flex w-full min-w-0 flex-1 flex-col">
            {venue.photos.length ? <Photo
              photos={venue.photos}
              alt={venue.name}
              className="-mx-5 aspect-[390/260] w-[calc(100%+40px)] lg:mx-0 lg:aspect-[664/400] lg:w-full"
            /> : <p className="border-b border-sand py-5 text-[14px] text-stone">Photo not available</p>}
            {photoCredit && <div className="mt-2 flex flex-wrap gap-2">{photoCredit}</div>}
            <div className="flex flex-col gap-4 pt-6 lg:gap-[18px] lg:pt-8">
              <p className="m-0 font-body text-[16px] leading-[26px] text-body lg:text-[18px] lg:leading-[29px]">
                {venue.description}
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2.5 p-0 lg:gap-x-6 lg:gap-y-3 [&>li]:gap-2">
                {venue.detailFeatures.map((f) => (
                  <FeatureRow key={f.label} feature={f} />
                ))}
              </ul>
            </div>
            {extras}
            {addOns && (
              <section className="flex flex-col pt-8 lg:pt-10">
                <h2 className="m-0 pb-4 text-[22px] leading-7 font-semibold">
                  Add to your booking
                </h2>
                <AddOnList />
              </section>
            )}
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[380px]">
            {receipt ?? (order && <Receipt venue={venue as Venue} order={order} brief={brief} />)}
            {action ?? <Button
              type="button"
              disabled={disabled}
              onClick={() => (addOns ? dialog.current?.showModal() : onArrange())}
              className="py-4 text-[17px] leading-[22px]"
            >
              {bookLabel}
            </Button>}
            {error && (
              <p role="alert" className="m-0 text-center font-body text-[16px] leading-6 text-body">
                {error}
              </p>
            )}
          </aside>
        </div>
      </main>

      {addOns && (
        <dialog
          ref={dialog}
          aria-labelledby="anything-else"
          onClick={(e) => e.target === dialog.current && dialog.current.close()}
          className="mx-0 mt-auto mb-0 max-h-[90dvh] w-full max-w-none bg-white p-0 shadow-[0_-20px_50px_#1F1B1640] backdrop:bg-[#1F1B1673] lg:m-auto lg:w-[580px] lg:max-w-[calc(100vw-32px)] lg:shadow-[0_40px_80px_#1F1B164D]"
        >
          <div className="flex flex-col gap-5 px-5 pt-3 pb-8 lg:gap-6 lg:px-10 lg:pt-10">
            <div aria-hidden className="mx-auto h-1 w-10 bg-[#D6CCBA] lg:hidden" />
            <div className="flex flex-col items-center gap-1 text-center lg:gap-1.5">
              <h2
                id="anything-else"
                className="m-0 font-script text-[34px] leading-[48px] font-normal lg:text-[40px] lg:leading-14"
              >
                Anything else?
              </h2>
              <p className="m-0 font-body text-[16px] leading-5 text-receipt-muted lg:text-[17px] lg:leading-[22px]">
                Add it now and it's on the same booking.
              </p>
            </div>
            <AddOnList boxed />
            <div className="flex flex-col-reverse gap-3 pt-2 lg:flex-row lg:items-center lg:justify-between lg:gap-0">
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="cursor-pointer text-[16px] leading-5 font-semibold text-receipt-muted underline decoration-1 [text-underline-position:from-font] hover:text-ink"
              >
                Skip
              </button>
              <Button
                type="button"
                onClick={onArrange}
                className="py-4 text-[17px] leading-[22px] lg:px-9"
              >
                {bookLabel}
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  )
}
