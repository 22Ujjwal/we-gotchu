import type { ComponentType, ReactNode } from 'react'
import { formatDate, timelineTimes } from '#/lib/hostwell/receipts'
import type { ReceiptDoc, ReceiptStyle, Receipts, TimelineEntry } from '#/lib/hostwell/receipts'
import { ReceiptPaper } from './receipt-papers'
import { Header } from './ui'

/** Links to one receipt, or back to all of them when no id is given. */
export type ReceiptLink = ComponentType<{ receiptId?: string; className?: string; children: ReactNode }>

// Each paper sits at its own slight angle, like receipts dropped on a table.
const tilt: Record<ReceiptStyle, number> = { thermal: -2, notepad: 1.8, invoice: -1.2, card: -2.4 }
// Three staggered columns; the fourth receipt drops under the middle one.
const columnOf = [0, 1, 2, 1]
const columnPad = ['lg:pt-6', 'lg:pt-3', 'lg:pt-14']

export function ReceiptsView({ data, Link }: { data: Receipts; Link: ReceiptLink }) {
  const { receipts } = data
  const columns: Array<Array<ReceiptDoc>> = [[], [], []]
  receipts.forEach((r, i) => columns[columnOf[i % columnOf.length]].push(r))

  return (
    <div className="flex min-h-screen flex-col">
      <Header step="party" />
      <main className="flex flex-1 flex-col items-center px-4 pb-16 lg:px-12 lg:pb-20">
        <div className="flex flex-col items-center gap-1.5 pt-10 pb-2 text-center lg:pt-11">
          <h1 className="m-0 font-script text-[40px] leading-14 font-normal lg:text-[52px] lg:leading-18">Receipts</h1>
          <p className="m-0 font-body text-[16px] leading-5 text-receipt-muted lg:text-[17px] lg:leading-5.5">
            {data.occasion} · {receipts.length} {receipts.length === 1 ? 'receipt' : 'receipts'}
          </p>
        </div>
        {receipts.length === 0 ? (
          <p className="m-0 pt-16 font-body text-[17px] text-receipt-muted">Nothing has been paid yet.</p>
        ) : (
          <div className="flex w-full flex-col items-center gap-14 pt-10 lg:w-auto lg:flex-row lg:items-start lg:justify-center lg:gap-12">
            {columns.map((column, i) => column.length > 0 && (
              <div key={i} className={`contents lg:flex lg:flex-col lg:items-center lg:gap-12 ${columnPad[i]}`}>
                {column.map((r) => <ReceiptCard key={r.id} receipt={r} data={data} Link={Link} />)}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function ReceiptCard({ receipt, data, Link }: { receipt: ReceiptDoc; data: Receipts; Link: ReceiptLink }) {
  const angle = tilt[receipt.style]
  return (
    <Link
      receiptId={receipt.id}
      className="group flex max-w-full flex-col items-center gap-5.5 transition-transform duration-200 ease-out hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-gold"
    >
      <div style={{ rotate: `${angle}deg` }} className="max-w-full">
        <ReceiptPaper receipt={receipt} timezone={data.timezone} startsAt={data.startsAt} />
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center" style={{ rotate: `${angle / 3}deg` }}>
        <span className="text-[17px] leading-5.5 font-semibold">{receipt.title}</span>
        <span className="text-[15px] leading-4.5 text-receipt-muted underline decoration-1 [text-underline-position:from-font] group-hover:text-ink">
          See details
        </span>
      </div>
    </Link>
  )
}

const statusLabel: Record<ReceiptDoc['status'], string> = {
  paid: 'Paid',
  refunded: 'Refunded',
  pending: 'Waiting to confirm',
  failed: 'Not completed',
}

export function ReceiptDetailView({ data, receipt, Link }: { data: Receipts; receipt: ReceiptDoc; Link: ReceiptLink }) {
  const status = receipt.issuedAt && (receipt.status === 'paid' || receipt.status === 'refunded')
    ? `${statusLabel[receipt.status]} ${formatDate(receipt.issuedAt, data.timezone, { day: 'numeric', month: 'short' })}`
    : statusLabel[receipt.status]

  return (
    <div className="flex min-h-screen flex-col">
      <Header step="party" />
      <main className="flex flex-1 flex-col items-center px-4 pb-16 lg:px-12 lg:pb-18">
        <div className="flex flex-col items-center gap-1.5 pt-10 pb-2 text-center">
          <h1 className="m-0 font-script text-[36px] leading-12 font-normal lg:text-[46px] lg:leading-16">{receipt.title}</h1>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[15px] leading-4.5">
            <span className="text-receipt-muted">{receipt.supplier} · {receipt.total} · {status}</span>
            <Link className="font-semibold underline decoration-1 [text-underline-position:from-font]">Back to receipts</Link>
          </div>
        </div>
        <div className="flex w-full max-w-[1100px] flex-col items-center gap-12 pt-10 lg:flex-row lg:items-start lg:gap-18 lg:pt-11">
          <div className="flex max-w-full shrink-0 flex-col items-center lg:w-85 lg:pt-2">
            <ReceiptPaper receipt={receipt} timezone={data.timezone} startsAt={data.startsAt} />
          </div>
          <section className="flex w-full min-w-0 flex-1 flex-col">
            <h2 className="m-0 pb-6 text-[22px] leading-7 font-semibold">Activity</h2>
            <Timeline entries={receipt.timeline} timezone={data.timezone} />
          </section>
        </div>
      </main>
    </div>
  )
}

function Timeline({ entries, timezone }: { entries: Array<TimelineEntry>; timezone: string }) {
  const times = timelineTimes(entries, timezone)
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {entries.map((e, i) => {
        const last = i === entries.length - 1
        return (
          <li key={i} className="flex gap-3.5 lg:gap-4.5">
            <span className="hidden w-27 shrink-0 font-mono text-[14px] leading-5.5 whitespace-pre text-stone lg:block">{times[i]}</span>
            <div aria-hidden className="flex w-3.5 shrink-0 flex-col items-center">
              <Dot kind={e.dot} />
              {!last && <span className="w-[1.5px] flex-1 bg-[#E4DBCB]" />}
            </div>
            <div className={`flex min-w-0 flex-1 flex-col gap-2 ${last ? '' : 'pb-6.5'}`}>
              {times[i] && <span className="font-mono text-[13px] leading-4.5 text-stone lg:hidden">{times[i]}</span>}
              <div className="flex items-baseline justify-between gap-3">
                <p className="m-0 font-body text-[16px] leading-6">
                  {e.lead && <span className="font-semibold">{e.lead}</span>}
                  {e.text}
                </p>
                {e.badge && <Badge kind={e.badge} />}
              </div>
              {e.quote && (
                <blockquote
                  className={`m-0 border px-4 py-3.5 font-body text-[15px] leading-5.75 text-body ${
                    e.quote.from === 'ours' ? 'border-line-strong bg-white' : 'border-line bg-[#F8F5F0]'
                  }`}
                >
                  {e.quote.text}
                </blockquote>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Dot({ kind }: { kind: TimelineEntry['dot'] }) {
  if (kind === 'approved')
    return <span className="mt-1.5 size-3 shrink-0 rounded-full bg-linear-135 from-[#F0D58C] to-[#B4852A]" />
  const look = {
    step: 'bg-ink',
    reply: 'border-2 border-ink bg-white',
    confirmed: 'bg-[#3F5A2E]',
    failed: 'bg-[#B5443A]',
  }[kind]
  return <span className={`mt-[7px] size-2.5 shrink-0 rounded-full ${look}`} />
}

function Badge({ kind }: { kind: NonNullable<TimelineEntry['badge']> }) {
  const look = {
    confirmed: 'bg-[#E4EAD8] text-[#3F5A2E]',
    pending: 'bg-cream text-brass',
    failed: 'bg-[#F6E1DE] text-[#B5443A]',
  }[kind]
  return (
    <span className={`shrink-0 px-2 py-0.75 text-[13px] leading-4 font-bold tracking-[0.06em] uppercase ${look}`}>
      {kind === 'pending' ? 'Pending' : kind}
    </span>
  )
}
