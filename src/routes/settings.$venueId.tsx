import {
  Link,
  createFileRoute,
  notFound,
  useNavigate,
} from '@tanstack/react-router'
import { useRef } from 'react'
import { Receipt } from '#/components/hostwell/receipt'
import {
  AddOnList,
  Button,
  FeatureRow,
  Guests,
  Header,
  MetaLine,
  Photo,
} from '#/components/hostwell/ui'
import { to24h } from '#/lib/hostwell/fixture'
import { buildOrder, findVenue, useHostwell } from '#/lib/hostwell/store'

export const Route = createFileRoute('/settings/$venueId')({
  loader: ({ params }) => {
    const venue = findVenue(params.venueId)
    if (!venue) throw notFound()
    return venue
  },
  component: VenuePage,
})

function VenuePage() {
  const venue = Route.useLoaderData()
  const { brief, addOns, selected, setBookedVenueId } = useHostwell()
  const navigate = useNavigate()
  const dialog = useRef<HTMLDialogElement>(null)
  const order = buildOrder(venue, addOns, selected)
  const bookLabel = `Book for €${order.total.toFixed(2)}`

  const book = () => {
    setBookedVenueId(venue.id)
    navigate({ to: '/party' })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header step="setting" />
      <main className="flex flex-col items-center gap-10 px-6 pt-10 pb-14 md:px-12">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <h1 className="m-0 font-script text-[36px] leading-[52px] font-normal md:text-[46px] md:leading-16">
            {venue.name}
          </h1>
          <MetaLine>
            <span>
              {brief.date}, {to24h(brief.from)}
            </span>
            <span>{venue.neighbourhood}</span>
            <Guests n={brief.guests} />
            <span>≤ {brief.budget}</span>
            <Link
              to="/settings"
              className="underline decoration-1 [text-underline-position:from-font]"
            >
              Back to settings
            </Link>
          </MetaLine>
        </div>

        <div className="flex w-full max-w-[1100px] flex-col items-start gap-14 lg:flex-row">
          <div className="flex w-full min-w-0 flex-1 flex-col">
            <Photo
              photos={venue.photos}
              alt={venue.name}
              className="aspect-[664/400] w-full"
            />
            <div className="flex flex-col gap-[18px] pt-8">
              <p className="m-0 font-body text-[18px] leading-[29px] text-body">
                {venue.description}
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-3 p-0 [&>li]:gap-2">
                {venue.detailFeatures.map((f) => (
                  <FeatureRow key={f.label} feature={f} />
                ))}
              </ul>
            </div>
            <section className="flex flex-col pt-10">
              <h2 className="m-0 pb-4 text-[22px] leading-7 font-semibold">
                Add to your booking
              </h2>
              <AddOnList />
            </section>
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[380px]">
            <Receipt venue={venue} order={order} brief={brief} />
            <Button
              type="button"
              onClick={() => dialog.current?.showModal()}
              className="py-4 text-[17px] leading-[22px]"
            >
              {bookLabel}
            </Button>
          </aside>
        </div>
      </main>

      <dialog
        ref={dialog}
        aria-labelledby="anything-else"
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        className="m-auto w-[580px] max-w-[calc(100vw-32px)] bg-white p-0 shadow-[0_40px_80px_#1F1B164D] backdrop:bg-[#1F1B1673]"
      >
        <div className="flex flex-col gap-6 px-6 pt-10 pb-8 md:px-10">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <h2
              id="anything-else"
              className="m-0 font-script text-[40px] leading-14 font-normal"
            >
              Anything else?
            </h2>
            <p className="m-0 font-body text-[17px] leading-[22px] text-receipt-muted">
              Add it now and it's on the same booking.
            </p>
          </div>
          <AddOnList boxed />
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="cursor-pointer text-[16px] leading-5 font-semibold text-receipt-muted underline decoration-1 [text-underline-position:from-font] hover:text-ink"
            >
              Skip
            </button>
            <Button
              type="button"
              onClick={book}
              className="px-9 py-4 text-[17px] leading-[22px]"
            >
              {bookLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
