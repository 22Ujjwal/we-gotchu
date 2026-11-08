import { Link, createFileRoute } from '@tanstack/react-router'
import { useRef } from 'react'
import { FeatureIcon, GoldSeal, Ticket } from '#/components/hostwell/icons'
import { Receipt } from '#/components/hostwell/receipt'
import { Button, Header } from '#/components/hostwell/ui'
import { to24h } from '#/lib/hostwell/fixture'
import { buildOrder, findVenue, useHostwell } from '#/lib/hostwell/store'

export const Route = createFileRoute('/party')({ component: PartyPage })

// [left, top, width, height, colour, rotate, round]
const confetti: Array<[number, number, number, number, string, number, boolean?]> = [
  [560, 110, 6, 16, '#C99A3B', -30], [600, 70, 8, 8, '#E8B4A8', 0, true],
  [640, 96, 5, 14, '#1F1B16', 25], [668, 60, 6, 16, '#9DB38A', -12],
  [770, 58, 7, 7, '#C99A3B', 0, true], [800, 92, 6, 16, '#A9C1D9', 40],
  [842, 68, 5, 14, '#E8B4A8', -45], [872, 120, 8, 8, '#1F1B16', 0, true],
  [520, 160, 7, 7, '#A9C1D9', 0, true], [900, 170, 6, 16, '#F0D58C', 15],
  [470, 220, 5, 14, '#9DB38A', 60], [955, 235, 7, 7, '#C99A3B', 0, true],
  [420, 120, 6, 16, '#F0D58C', -60], [1010, 100, 6, 16, '#E8B4A8', 35],
  [700, 40, 5, 12, '#C99A3B', 10], [735, 28, 6, 6, '#9DB38A', 0, true],
  [380, 260, 7, 7, '#E8B4A8', 0, true], [1050, 280, 5, 14, '#1F1B16', -25],
]

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }

/** Parses "Sat 12 Dec" loosely; returns nulls when it can't. */
function parseDate(s: string) {
  const m = s.match(/(?:(\w{3})\w*\s+)?(\d{1,2})\s+(\w{3})/i)
  const month = m ? MONTHS.indexOf(m[3].toUpperCase()) : -1
  if (!m || month < 0) return null
  return {
    day: Number(m[2]),
    month,
    weekday: m[1] ? DAYS[m[1].toLowerCase()] : undefined,
  }
}

function PartyPage() {
  const { brief, addOns, selected, bookedVenueId } = useHostwell()
  const receipt = useRef<HTMLDialogElement>(null)
  const venue = bookedVenueId ? findVenue(bookedVenueId) : undefined

  if (!venue) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header step="party" />
        <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <p className="m-0 font-script text-[40px] leading-14">Nothing booked yet</p>
          <Link to="/settings" className="text-[17px] font-semibold underline">
            Pick a setting
          </Link>
        </main>
      </div>
    )
  }

  const order = buildOrder(venue, addOns, selected)
  const date = parseDate(brief.date)
  const start = to24h(brief.from)
  const end = to24h(brief.till)
  const extras = [
    selected.has('candles') && 'Candles on the table',
    ...addOns
      .filter((a) => a.id !== 'candles' && selected.has(a.id))
      .map((a) => a.label),
  ].filter(Boolean)
  const occasionShort = brief.occasion.replace(/\s+birthday$/i, '')

  const downloadIcs = () => {
    if (!date) return
    const year = new Date().getMonth() > date.month ? new Date().getFullYear() + 1 : new Date().getFullYear()
    const stamp = (t: string) =>
      `${year}${String(date.month + 1).padStart(2, '0')}${String(date.day).padStart(2, '0')}T${t.replace(':', '')}00`
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//hostwell//EN',
      'BEGIN:VEVENT',
      `UID:${venue.id}-${stamp(start)}@hostwell`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;TZID=Europe/Berlin:${stamp(start)}`,
      `DTEND;TZID=Europe/Berlin:${stamp(end)}`,
      `SUMMARY:${brief.occasion}`,
      `LOCATION:${venue.name}, ${venue.neighbourhood}, Berlin`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'party.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="confetti pointer-events-none absolute top-0 left-1/2 h-[420px] w-[1440px] -translate-x-1/2"
      >
        {confetti.map(([left, top, width, height, bg, rotate, round], i) => (
          <span
            key={i}
            className="absolute origin-top-left"
            style={{
              left,
              top,
              width,
              height,
              backgroundColor: bg,
              rotate: `${rotate}deg`,
              borderRadius: round ? 4 : 0,
              animationDelay: `${(i % 6) * 60}ms`,
            }}
          />
        ))}
      </div>

      <Header step="party" />
      <main className="relative flex flex-1 flex-col items-center gap-7 px-6 pt-14 pb-12 md:px-12">
        <GoldSeal />
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="m-0 font-script text-[44px] leading-[60px] font-normal md:text-[52px] md:leading-[72px]">
            It's happening!
          </h1>
          <p className="m-0 font-body text-[18px] leading-[22px] text-receipt-muted">
            Everything is booked for {occasionShort}.
          </p>
        </div>

        <div className="flex w-full max-w-[820px] flex-col shadow-[0_24px_56px_#1F1B161A]">
          <div className="flex flex-col gap-9 border border-line bg-white p-6 md:flex-row">
            <img
              src={venue.photo}
              alt={venue.name}
              className="aspect-square w-full shrink-0 object-cover md:size-[280px]"
            />
            <div className="flex flex-1 flex-col gap-[22px] pt-1.5">
              <h2 className="m-0 font-script text-[34px] leading-[46px] font-normal">
                {brief.occasion}
              </h2>
              <Fact
                badge={
                  <div className="flex h-[52px] w-12 flex-col items-center border border-line-strong">
                    <span className="w-full bg-ink py-0.5 text-center font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] text-white">
                      {date ? MONTHS[date.month] : '—'}
                    </span>
                    <span className="pt-[3px] text-[20px] leading-6 font-bold">
                      {date?.day ?? '?'}
                    </span>
                  </div>
                }
                title={
                  date
                    ? [date.weekday, `${date.day} ${MONTH_NAMES[date.month]}`]
                        .filter(Boolean)
                        .join(', ')
                    : brief.date
                }
                detail={`${start} – ${end}`}
              />
              <Fact
                badge={<IconBadge icon="pin" />}
                title={venue.name}
                detail={`${venue.neighbourhood}, Berlin`}
              />
              <Fact
                badge={<IconBadge icon="guests" />}
                title={`${brief.guests} guests`}
                detail={[...extras, `€${order.total.toFixed(2)} paid`].join(' · ')}
              />
            </div>
          </div>
          <div className="flex flex-col gap-[18px] border border-t-0 border-cream-line bg-cream px-6 py-5 md:flex-row md:items-center">
            <span className="flex size-12 shrink-0 items-center justify-center border border-cream-line bg-white">
              <Ticket />
            </span>
            <div className="flex flex-1 flex-col gap-[3px]">
              <span className="text-[17px] leading-[22px] font-semibold">
                Invite guests with Luma
              </span>
              <span className="font-body text-[15px] leading-[18px] text-brass">
                We'll set up the event page and RSVPs. Nothing is sent until you say so.
              </span>
            </div>
            <Button type="button" className="shrink-0 px-[22px] py-[13px] text-[15px] leading-[18px]">
              Create Luma page
            </Button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={downloadIcs}
            disabled={!date}
            className="cursor-pointer border border-ink px-[26px] py-3.5 text-[16px] leading-5 font-semibold hover:bg-ink hover:text-white disabled:opacity-40"
          >
            Add to calendar
          </button>
          <button
            type="button"
            onClick={() => receipt.current?.showModal()}
            className="cursor-pointer border border-line-strong px-[26px] py-3.5 text-[16px] leading-5 font-semibold hover:border-ink"
          >
            View receipt
          </button>
        </div>
      </main>

      <dialog
        ref={receipt}
        aria-label="Receipt"
        onClick={(e) => e.target === receipt.current && receipt.current.close()}
        className="m-auto w-[380px] max-w-[calc(100vw-32px)] overflow-visible bg-transparent p-0 backdrop:bg-[#1F1B1673]"
      >
        <Receipt venue={venue} order={order} brief={brief} />
      </dialog>
    </div>
  )
}

function IconBadge({ icon }: { icon: 'pin' | 'guests' }) {
  return (
    <div className="flex h-[52px] w-12 items-center justify-center border border-line-strong">
      <FeatureIcon icon={icon} size={22} />
    </div>
  )
}

function Fact({
  badge,
  title,
  detail,
}: {
  badge: React.ReactNode
  title: string
  detail: string
}) {
  return (
    <div className="flex items-center gap-3.5">
      <div className="shrink-0">{badge}</div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[17px] leading-[22px] font-semibold">{title}</span>
        <span className="font-body text-[16px] leading-5 text-receipt-muted">
          {detail}
        </span>
      </div>
    </div>
  )
}
