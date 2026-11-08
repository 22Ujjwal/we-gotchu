import { Link } from '@tanstack/react-router'
import { FeatureIcon, GoldSeal, Ticket } from './icons'
import { Button, Header, Photo } from './ui'
import { to24h } from '#/lib/hostwell/fixture'
import type { Brief, Venue } from '#/lib/hostwell/fixture'
import type { Order } from '#/lib/hostwell/store'

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

/** Accepts brief dates with or without an explicit year. */
function parseDate(s: string) {
  const m = s.match(/(?:(\w{3})\w*\s+)?(\d{1,2})\s+(\w{3})(?:\s+(\d{4}))?/i)
  const month = m ? MONTHS.indexOf(m[3].toUpperCase()) : -1
  if (!m || month < 0) return null
  return {
    day: Number(m[2]),
    year: m[4] ? Number(m[4]) : undefined,
    month,
    weekday: m[1] ? DAYS[m[1].toLowerCase()] : undefined,
  }
}

export function PartyView({
  brief,
  venue,
  order,
  extras = [],
  place,
  timezone,
  receiptsHref,
}: {
  brief: Brief
  venue: Venue
  order: Order
  extras?: Array<string>
  /** Where it is, as shown under the venue name. */
  place: string
  timezone: string
  receiptsHref: string
}) {
  const date = parseDate(brief.date)
  const start = to24h(brief.from)
  const end = brief.till ? to24h(brief.till) : ''
  const occasionShort = brief.occasion.replace(/\s+birthday$/i, '')

  const downloadIcs = () => {
    if (!date) return
    const year = date.year ?? (new Date().getMonth() > date.month ? new Date().getFullYear() + 1 : new Date().getFullYear())
    const stamp = (t: string, nextDay = false) => {
      const day = new Date(year, date.month, date.day + (nextDay ? 1 : 0))
      return `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}T${t.replace(':', '')}00`
    }
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//arrange//EN',
      'BEGIN:VEVENT',
      `UID:${venue.id}-${stamp(start)}@arrange`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;TZID=${timezone}:${stamp(start)}`,
      ...(end ? [`DTEND;TZID=${timezone}:${stamp(end, end < start)}`] : []),
      `SUMMARY:${brief.occasion}`,
      `LOCATION:${venue.name}, ${place}`,
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
        className="confetti pointer-events-none absolute top-0 left-1/2 h-[420px] w-[1440px] origin-top -translate-x-1/2 scale-[0.55] lg:scale-100"
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
      <main className="relative flex flex-1 flex-col items-center gap-6 px-5 pt-11 pb-10 lg:gap-7 lg:px-12 lg:pt-14 lg:pb-12">
        <GoldSeal />
        <div className="flex flex-col items-center gap-1 text-center lg:gap-1.5">
          <h1 className="m-0 font-script text-[34px] leading-[48px] font-normal lg:text-[52px] lg:leading-[72px]">
            It's happening!
          </h1>
          <p className="m-0 font-body text-[16px] leading-5 text-receipt-muted lg:text-[18px] lg:leading-[22px]">
            Everything is booked for {occasionShort}.
          </p>
        </div>

        <div className="flex w-full max-w-[820px] flex-col shadow-[0_24px_56px_#1F1B161A]">
          <div className="flex flex-col border border-line bg-white lg:flex-row lg:gap-9 lg:p-6">
            <Photo
              photos={venue.photo ? [venue.photo] : []}
              alt={venue.name}
              className="h-[210px] w-full lg:size-[280px]"
            />
            <div className="flex flex-1 flex-col gap-[18px] px-5 pt-[22px] pb-6 lg:gap-[22px] lg:p-0 lg:pt-1.5">
              <h2 className="m-0 font-script text-[28px] leading-10 font-normal lg:text-[34px] lg:leading-[46px]">
                {brief.occasion}
              </h2>
              <Fact
                badge={
                  <div className="flex h-12 w-11 flex-col items-center border border-line-strong lg:h-[52px] lg:w-12">
                    <span className="w-full bg-ink py-0.5 text-center font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] text-white">
                      {date ? MONTHS[date.month] : '—'}
                    </span>
                    <span className="pt-0.5 text-[18px] leading-[22px] font-bold lg:pt-[3px] lg:text-[20px] lg:leading-6">
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
                detail={end ? `${start} – ${end}` : start}
              />
              <Fact
                badge={<IconBadge icon="pin" />}
                title={venue.name}
                detail={place}
              />
              <Fact
                badge={<IconBadge icon="guests" />}
                title={`${brief.guests} guests`}
                detail={[...extras, `$${order.total.toFixed(2)} paid`].join(' · ')}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3.5 border border-t-0 border-cream-line bg-cream p-5 lg:flex-row lg:items-center lg:gap-[18px] lg:px-6">
            <span className="hidden size-12 shrink-0 items-center justify-center border border-cream-line bg-white lg:flex">
              <Ticket />
            </span>
            <div className="flex flex-1 flex-col gap-[3px]">
              <span className="text-[16px] leading-5 font-semibold lg:text-[17px] lg:leading-[22px]">
                Invite guests with Luma
              </span>
              <span className="font-body text-[15px] leading-[22px] text-brass lg:leading-[18px]">
                We'll set up the event page and RSVPs. Nothing is sent until you say so.
              </span>
            </div>
            <Button type="button" className="shrink-0 py-3.5 text-[16px] leading-5 lg:px-[22px] lg:py-[13px] lg:text-[15px] lg:leading-[18px]">
              Create Luma page
            </Button>
          </div>
        </div>

        <div className="flex w-full max-w-[468px] gap-2.5 lg:w-auto lg:max-w-none lg:gap-3">
          <button
            type="button"
            onClick={downloadIcs}
            disabled={!date}
            className="flex-1 cursor-pointer border border-ink px-[26px] py-3.5 text-[16px] leading-5 font-semibold hover:bg-ink hover:text-white disabled:opacity-40"
          >
            Add to calendar
          </button>
          <Link
            to={receiptsHref}
            className="flex-1 border border-line-strong px-[26px] py-3.5 text-center text-[16px] leading-5 font-semibold hover:border-ink"
          >
            View receipts
          </Link>
        </div>
      </main>
    </div>
  )
}

function IconBadge({ icon }: { icon: 'pin' | 'guests' }) {
  return (
    <div className="flex h-12 w-11 items-center justify-center border border-line-strong lg:h-[52px] lg:w-12">
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
        <span className="text-[16px] leading-5 font-semibold lg:text-[17px] lg:leading-[22px]">{title}</span>
        <span className="font-body text-[15px] leading-[18px] text-receipt-muted lg:text-[16px] lg:leading-5">
          {detail}
        </span>
      </div>
    </div>
  )
}
