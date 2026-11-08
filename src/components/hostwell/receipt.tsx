import type { ReactNode } from 'react'
import type { Brief, Venue } from '#/lib/hostwell/fixture'
import { usd } from '#/lib/hostwell/fixture'
import type { Order } from '#/lib/hostwell/store'

const bars: Array<[number, number]> = [
  [0, 3], [6, 1.5], [10, 4], [17, 1.5], [21, 2], [27, 4], [34, 1.5], [38, 3],
  [44, 1.5], [49, 4], [56, 2], [61, 1.5], [65, 3], [71, 1.5], [75, 4], [82, 2],
  [87, 1.5], [91, 3], [97, 4], [104, 1.5], [108, 2], [113, 3], [119, 1.5],
  [123, 4], [130, 1.5], [134, 3], [140, 2], [145, 1.5], [149, 4], [156, 1.5],
  [160, 3], [166, 2], [171, 1.5], [175, 4], [182, 1.5], [186, 3], [192, 2],
  [197, 1.5], [201, 4], [208, 1.5], [212, 3], [218, 2], [223, 1.5], [227, 4],
  [234, 1.5], [237, 3],
]

const zigzag = (() => {
  let d = 'M0 0 H380 V2'
  for (let x = 380; x > 0; x -= 20) d += ` L${x - 10} 12 L${x - 20} 2`
  return `${d} Z`
})()

function Row({
  left,
  right,
  muted,
  indent,
}: {
  left: string
  right?: string
  muted?: boolean
  indent?: boolean
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${muted ? 'text-receipt-muted' : ''}`}
    >
      <span className={indent ? 'pl-9' : ''}>{left}</span>
      {right && <span className="shrink-0">{right}</span>}
    </div>
  )
}

const Rule = ({ solid }: { solid?: boolean }) => (
  <hr
    className={`m-0 border-0 border-t-[1.5px] ${solid ? 'border-solid border-receipt-ink' : 'border-dashed border-receipt-rule'}`}
  />
)

export function Receipt({
  venue,
  order,
  brief,
}: {
  venue: Venue
  order: Order
  brief: Brief
}) {
  const firstName = brief.occasion.split(/['’]s\b|\s/)[0]
  const age = brief.occasion.match(/\d+\w*/)?.[0]
  const greeting = age ? `Happy ${age}, ${firstName}!` : `Enjoy, ${firstName}!`

  return (
    <ReceiptFrame label="Receipt">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[18px] font-bold tracking-[0.22em]">
            HOSTWELL
          </span>
          <span className="text-receipt-muted">Event purchasing · Berlin</span>
        </div>
        <Rule />
        <Row left="QTY ITEM" right="USD" muted />
        {order.lines.map((l) => (
          <div key={l.item} className="flex flex-col gap-0.5">
            <Row
              left={`${l.qty} x ${l.item}`}
              right={typeof l.amount === 'number' ? usd(l.amount) : l.amount}
            />
            {l.notes?.map((n, i) => (
              <Row
                key={n}
                left={n}
                right={i === l.notes!.length - 1 ? l.noteAmount : undefined}
                indent
                muted
              />
            ))}
          </div>
        ))}
        {order.requests.map((r) => (
          <Row key={r} left={`1 x ${r}`} right="quote" muted />
        ))}
        <Rule />
        <div className="flex flex-col gap-1">
          <Row left="Subtotal" right={usd(order.subtotal)} />
          {order.vat !== null && <Row left="VAT" right={usd(order.vat)} />}
          <Row left="Service fee" right="0.00" />
        </div>
        <Rule solid />
        <div className="flex items-baseline justify-between font-bold">
          <span className="text-[16px]">ESTIMATED TOTAL USD</span>
          <span className="text-[20px] leading-6">{usd(order.total)}</span>
        </div>
        <Rule solid />
        {venue.freeCancellationUntil && (
          <>
            <Row
              left="Free cancellation"
              right={venue.freeCancellationUntil}
              muted
            />
            <Rule />
          </>
        )}
        <p className="m-0 text-center">*** {greeting} ***</p>
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <svg width="240" height="44" viewBox="0 0 240 44" aria-hidden>
            {bars.map(([x, w]) => (
              <rect key={x} x={x} width={w} height="44" fill="#2B2620" />
            ))}
          </svg>
          <span className="text-[14px] leading-[18px] tracking-[0.18em] text-receipt-muted">
            HW20260041
          </span>
        </div>
    </ReceiptFrame>
  )
}

/** Shared paper, type and torn edge for demo receipts and saved planning estimates. */
export function ReceiptFrame({ children, label }: { children: ReactNode; label: string }) {
  return <figure aria-label={label} className="m-0 flex flex-col"
    style={{ filter: 'drop-shadow(#1F1B161A 0px 10px 18px)' }}>
    <div className="flex flex-col gap-3 bg-receipt px-7 pt-[30px] pb-[22px] font-mono text-[15px] leading-[21px] text-receipt-ink">{children}</div>
    <svg viewBox="0 0 380 12" preserveAspectRatio="none" className="block h-3 w-full" aria-hidden>
      <path d={zigzag} fill="#FFFEFA" />
    </svg>
  </figure>
}
export function ReceiptBarcode({ reference }: { reference: string }) {
  return <div className="flex flex-col items-center gap-1.5 pt-1">
    <svg width="240" height="44" viewBox="0 0 240 44" aria-hidden>
      {bars.map(([x, w]) => <rect key={x} x={x} width={w} height="44" fill="#2B2620" />)}
    </svg>
    <span className="text-[14px] leading-[18px] tracking-[0.18em] text-receipt-muted">{reference}</span>
  </div>
}
export { Row as ReceiptRow, Rule as ReceiptRule }
