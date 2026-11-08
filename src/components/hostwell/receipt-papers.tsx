import type { ReactNode } from 'react'
import { formatDate } from '#/lib/hostwell/receipts'
import type { ReceiptDoc, ReceiptRow } from '#/lib/hostwell/receipts'

/** Sawtooth edge, `teeth` wide, pointing up or down. */
function Edge({ width, height, teeth, up, fill }: { width: number; height: number; teeth: number; up?: boolean; fill: string }) {
  let d = up ? `M0 ${height}` : `M0 0 L${width} 0`
  if (up) {
    for (let x = 0; x < width; x += teeth) d += ` L${x + teeth / 2} 0 L${x + teeth} ${height}`
  } else {
    for (let x = width; x > 0; x -= teeth) d += ` L${x - teeth / 2} ${height} L${x - teeth} 0`
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full shrink-0" style={{ height }} aria-hidden>
      <path d={`${d} Z`} fill={fill} />
    </svg>
  )
}

const Rule = ({ className }: { className: string }) => <hr className={`m-0 h-0 shrink-0 border-0 border-t ${className}`} />

function Rows({ rows, className, muted }: { rows: Array<ReceiptRow>; className: string; muted: string }) {
  return rows.map((r) => (
    <div key={r.label} className={`flex justify-between gap-4 ${className} ${r.muted ? muted : ''}`}>
      <span>{r.label}</span>
      <span className="shrink-0">{r.amount}</span>
    </div>
  ))
}

const stamped = (r: ReceiptDoc) => r.status === 'paid' || r.status === 'refunded'
const stampText = (r: ReceiptDoc) => (r.status === 'refunded' ? 'REFUNDED' : 'PAID')

function Thermal({ receipt: r, timezone }: { receipt: ReceiptDoc; timezone: string }) {
  const footer = [r.issuedAt && formatDate(r.issuedAt, timezone, { day: '2-digit', month: '2-digit', year: 'numeric' }).replaceAll('/', '.'), r.reference && `#${r.reference}`]
    .filter(Boolean).join(' · ')
  return (
    <div className="flex w-[320px] max-w-full flex-col drop-shadow-[0_14px_20px_#3C2D1924]">
      <Edge width={320} height={10} teeth={20} up fill="#FFFDF7" />
      <div className="paper-thermal relative flex flex-col gap-3 px-6 pt-5.5 pb-6.5 font-mono text-[14px] leading-5 text-receipt-ink">
        <div className="flex flex-col items-center gap-0.5 text-center">
          <span className="text-[16px] font-bold tracking-[0.2em] uppercase">{r.supplier}</span>
          <span className="text-receipt-muted">{r.kind} · {r.place}</span>
        </div>
        <Rule className="border-t-[1.5px] border-dashed border-receipt-rule" />
        <Rows rows={r.rows} className="" muted="text-receipt-muted" />
        <Rule className="border-t-[1.5px] border-solid border-receipt-ink" />
        <div className="flex items-baseline justify-between font-bold">
          <span>TOTAL {r.currency}</span>
          <span className="text-[18px]">{r.amount}</span>
        </div>
        {footer && (
          <>
            <Rule className="border-t-[1.5px] border-dashed border-receipt-rule" />
            <span className="text-center text-receipt-muted">{footer}</span>
          </>
        )}
        {stamped(r) && (
          <div className="absolute right-2 bottom-1 flex size-21 -rotate-14 items-center justify-center rounded-full border-[2.5px] border-[#A97C2ABF]">
            <div className="flex size-18 items-center justify-center rounded-full border border-[#A97C2A99]">
              <span className="font-sans text-[15px] leading-5 font-extrabold tracking-[0.12em] text-[#A97C2AD9]">{stampText(r)}</span>
            </div>
          </div>
        )}
      </div>
      <Edge width={320} height={10} teeth={20} fill="#F7F1E4" />
    </div>
  )
}

const torn = 'M0 12 L0 6 L14 8 L22 3 L37 7 L49 2 L61 6 L78 4 L90 9 L104 3 L121 6 L133 1 L150 5 L166 8 L178 3 L193 6 L207 2 L222 7 L236 4 L251 8 L263 3 L278 6 L291 2 L300 5 L300 12 Z'

function Notepad({ receipt: r, timezone }: { receipt: ReceiptDoc; timezone: string }) {
  const hand = 'font-script text-[#23305E] whitespace-pre'
  return (
    <div className="flex w-[300px] max-w-full flex-col drop-shadow-[0_12px_18px_#503C1429]">
      <svg viewBox="0 0 300 12" preserveAspectRatio="none" className="block h-3 w-full shrink-0" aria-hidden>
        <path d={torn} fill="#FBF2CF" />
      </svg>
      <div className="paper-notepad flex flex-col pt-3.5 pr-5.5 pb-6.5 pl-11.5">
        <div className="flex h-8 shrink-0 items-center justify-between gap-3">
          <span className="truncate border-2 border-[#B5443A] px-1.5 py-px text-[14px] leading-4.5 font-extrabold tracking-[0.14em] text-[#B5443A] uppercase">
            {r.supplier}
          </span>
          {r.reference && <span className="shrink-0 font-mono text-[13px] leading-4 text-[#B5443A]">Nr. {r.reference}</span>}
        </div>
        {r.rows.map((row) => (
          <div key={row.label} className={`flex h-8 shrink-0 items-end justify-between gap-3 text-[17px] leading-5.5 ${hand}`}>
            <span className="truncate">{row.label}</span>
            <span>{row.amount}</span>
          </div>
        ))}
        <div className={`flex h-10 shrink-0 items-end justify-between ${hand}`}>
          <span className="text-[19px] leading-6">Total</span>
          <span className="text-[22px] leading-7 underline decoration-1 [text-underline-position:from-font]">{r.total}</span>
        </div>
        {r.issuedAt && (
          <div className={`flex h-8 shrink-0 items-end justify-end text-[15px] leading-4.5 ${hand}`}>
            {formatDate(r.issuedAt, timezone, { day: '2-digit', month: '2-digit' }).replace('/', '.')}. · thanks!
          </div>
        )}
      </div>
    </div>
  )
}

function Invoice({ receipt: r, timezone, startsAt }: { receipt: ReceiptDoc; timezone: string; startsAt: string }) {
  const issued = [
    r.issuedAt && `Issued ${formatDate(r.issuedAt, timezone, { day: '2-digit', month: 'short', year: 'numeric' })}`,
    `Event ${formatDate(startsAt, timezone, { day: 'numeric', month: 'short' })}`,
  ].filter(Boolean).join(' · ')
  return (
    <div className="paper-invoice relative flex w-[340px] max-w-full shadow-[0_14px_26px_#28283224,0_1px_2px_#2828321A]">
      <div aria-hidden className="flex w-5.5 shrink-0 flex-col items-center justify-around border-r border-dashed border-[#D9D4C8] py-3.5">
        {Array.from({ length: 8 }, (_, i) => <span key={i} className="size-1.5 rounded-full bg-[#EDE8DD]" />)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 px-5.5 pt-6 pb-6.5 font-body text-[15px] leading-4.5 text-[#1E2A44]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-sans text-[17px] leading-5.5 font-bold">{r.supplier}</span>
            <span className="text-[13px] leading-4 text-[#6B7280]">{r.kind} · {r.place}</span>
          </div>
          {r.reference && <span className="shrink-0 font-mono text-[13px] leading-4 text-[#6B7280]">INV {r.reference}</span>}
        </div>
        <Rule className="border-t-[1.5px] border-solid border-[#1E2A44]" />
        {r.rows.map((row) => (
          <div key={row.label} className={`flex justify-between gap-4 ${row.muted ? 'text-[#6B7280]' : ''}`}>
            <span>{row.label}</span>
            <span className="shrink-0 font-mono">{row.amount}</span>
          </div>
        ))}
        <Rule className="border-solid border-[#D9D4C8]" />
        <div className="flex items-baseline justify-between">
          <span className="font-sans font-bold">Total due</span>
          <span className="font-mono text-[20px] leading-6 font-semibold">{r.total}</span>
        </div>
        <span className="text-[13px] leading-4 text-[#6B7280]">{issued}</span>
      </div>
      {stamped(r) && (
        <div className="absolute right-8.5 bottom-6 -rotate-12 border-[2.5px] border-[#2E5AA8B3] px-3 py-1.5">
          <span className="text-[16px] leading-5 font-extrabold tracking-[0.16em] text-[#2E5AA8BF]">{stampText(r)}</span>
        </div>
      )}
    </div>
  )
}

function Card({ receipt: r, timezone }: { receipt: ReceiptDoc; timezone: string }) {
  const auth = [r.reference && `AUTH ${r.reference}`, r.issuedAt && formatDate(r.issuedAt, timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })]
    .filter(Boolean).join(' · ')
  return (
    <div className="flex w-[240px] max-w-full flex-col drop-shadow-[0_10px_16px_#28282824]">
      <div className="paper-card flex flex-col items-center gap-2.5 px-4.5 pt-5.5 pb-4.5 text-center font-mono text-[13px] leading-4.5 text-[#76746E]">
        <span className="text-[14px] font-bold tracking-[0.18em] text-[#3A3A38]">CARD PAYMENT</span>
        <span>{r.kind}</span>
        <Rule className="w-full border-dashed border-[#BDBBB4]" />
        <span className="text-[24px] leading-7.5 font-semibold text-[#2A2A28]">{r.total}</span>
        <span className="font-bold tracking-[0.2em] text-[#3A3A38]">{r.status === 'refunded' ? 'REFUNDED' : 'APPROVED'}</span>
        <Rule className="w-full border-dashed border-[#BDBBB4]" />
        {auth && <span>{auth}</span>}
        {r.note && <span>{r.note}</span>}
      </div>
      <Edge width={240} height={8} teeth={16} fill="#F3F3EF" />
    </div>
  )
}

/** A receipt drawn on the paper that suits it. */
export function ReceiptPaper({ receipt, timezone, startsAt }: { receipt: ReceiptDoc; timezone: string; startsAt: string }): ReactNode {
  switch (receipt.style) {
    case 'thermal': return <Thermal receipt={receipt} timezone={timezone} />
    case 'notepad': return <Notepad receipt={receipt} timezone={timezone} />
    case 'invoice': return <Invoice receipt={receipt} timezone={timezone} startsAt={startsAt} />
    case 'card': return <Card receipt={receipt} timezone={timezone} />
  }
}
