import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

/*
 * Loading state while the agent works: paper slips pop onto the page one by
 * one and their lines get typed out, like receipts being printed. Everything
 * is derived from one clock so the sequence is deterministic and loops.
 */

type Paper = 'thermal' | 'pad' | 'terminal' | 'invoice'

type Slip = {
  paper: Paper
  title: string
  lines: Array<{ left: string; right?: string; strong?: boolean }>
  stamp?: string
  rotate: number
}

const slips: Slip[] = [
  {
    paper: 'thermal',
    title: 'YOUR BRIEF',
    rotate: -2,
    lines: [
      { left: 'Franz’s 30th birthday' },
      { left: 'Sat 12 Dec', right: '19–23h' },
      { left: 'Guests', right: '24' },
      { left: 'Kreuzberg or Neukölln' },
      { left: 'Budget', right: '≤ 900.00', strong: true },
    ],
    stamp: 'READ',
  },
  {
    paper: 'pad',
    title: 'Venues',
    rotate: 1.8,
    lines: [
      { left: 'Rooftops, lofts', right: '14' },
      { left: 'Too small', right: '−6' },
      { left: 'Over budget', right: '−5' },
      { left: 'Good fits', right: '3', strong: true },
    ],
  },
  {
    paper: 'terminal',
    title: 'EMAIL SENT',
    rotate: -2.4,
    lines: [
      { left: 'To: Spreeblick' },
      { left: 'Free on 12 Dec?' },
      { left: 'Price + cancellation?' },
      { left: 'REPLY: AVAILABLE', strong: true },
    ],
  },
  {
    paper: 'invoice',
    title: 'Candles quote',
    rotate: -1.2,
    lines: [
      { left: 'Kerzenhaus · 24 ×', right: '52.00' },
      { left: 'Delivery to venue', right: '6.90' },
      { left: 'Arrives', right: '11 Dec' },
      { left: 'Quote', right: '$58.90', strong: true },
    ],
    stamp: 'QUOTED',
  },
]

// Timing (ms)
const POP = 450 // slip pops in before typing starts
const CHAR = 26 // per character
const LINE_GAP = 220 // pause between lines
const SLIP_GAP = 500 // pause after a slip finishes
const HOLD = 2200 // pause on the finished page before looping

const lineText = (l: Slip['lines'][number]) => l.left + (l.right ?? '')

const schedule = (() => {
  let t = 0
  return slips.map((s) => {
    const start = t
    t += POP
    const lines = s.lines.map((l) => {
      const ls = t
      t += lineText(l).length * CHAR + LINE_GAP
      return ls
    })
    const end = t
    t += SLIP_GAP
    return { start, lines, end }
  })
})()
const TOTAL = schedule[schedule.length - 1].end + HOLD

/** Elapsed ms. Loops forever, or plays once and calls onDone. */
function useClock(onDone?: () => void) {
  const [now, setNow] = useState(0)
  const done = useRef(onDone)
  done.current = onDone
  const once = onDone !== undefined
  useEffect(() => {
    let raf = 0
    let fired = false
    const t0 = performance.now()
    const tick = (t: number) => {
      const elapsed = t - t0
      if (once && elapsed >= TOTAL) {
        setNow(TOTAL - 1)
        if (!fired) {
          fired = true
          done.current?.()
        }
        return
      }
      setNow(elapsed % TOTAL)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [once])
  return now
}

const paperStyle: Record<Paper, CSSProperties> = {
  thermal: {
    backgroundColor: '#FFFDF7',
    backgroundImage:
      'radial-gradient(circle at 18% 22%, rgba(150,120,70,0.07) 0%, transparent 35%), repeating-linear-gradient(0deg, rgba(120,95,60,0.04) 0px, rgba(120,95,60,0.04) 1px, transparent 1px, transparent 4px), linear-gradient(180deg, transparent 0%, rgba(214,196,160,0.22) 100%)',
    fontFamily: 'var(--font-mono)',
    color: '#2B2620',
  },
  pad: {
    backgroundColor: '#FBF2CF',
    backgroundImage:
      'repeating-linear-gradient(180deg, transparent 0px, transparent 31px, rgba(110,140,180,0.35) 31px, rgba(110,140,180,0.35) 32px), linear-gradient(90deg, transparent 32px, rgba(200,80,70,0.45) 32px, rgba(200,80,70,0.45) 33px, transparent 33px)',
    fontFamily: 'var(--font-script)',
    color: '#23305E',
  },
  terminal: {
    backgroundColor: '#F3F3EF',
    backgroundImage:
      'repeating-linear-gradient(0deg, rgba(0,0,0,0.025) 0px, rgba(0,0,0,0.025) 1px, transparent 1px, transparent 3px)',
    fontFamily: 'var(--font-mono)',
    color: '#3A3A38',
  },
  invoice: {
    backgroundColor: '#FFFFFE',
    backgroundImage:
      'linear-gradient(180deg, transparent 49.6%, rgba(120,110,90,0.10) 50%, rgba(255,255,255,0.6) 50.4%, transparent 51%)',
    fontFamily: 'var(--font-body)',
    color: '#1E2A44',
    boxShadow: '0 14px 26px rgba(40,40,50,0.14), 0 1px 2px rgba(40,40,50,0.10)',
  },
}

// Zigzag tear edges, 300 wide, 10px teeth.
const zigTop = (() => {
  let d = 'M0 10'
  for (let x = 10; x <= 300; x += 10) d += ` L${x} ${(x / 10) % 2 ? 0 : 10}`
  return `${d} Z`
})()
const zigBottom = (() => {
  let d = 'M0 0 L300 0'
  for (let x = 290; x >= 0; x -= 10) d += ` L${x} ${(x / 10) % 2 ? 10 : 0}`
  return `${d} Z`
})()

function Edge({ paper, bottom }: { paper: Paper; bottom?: boolean }) {
  if (paper === 'invoice') return null
  if (paper === 'pad' && bottom) return null
  if (paper === 'terminal' && !bottom) return null
  const fill = paperStyle[paper].backgroundColor as string
  if (paper === 'pad')
    return (
      <svg viewBox="0 0 300 12" preserveAspectRatio="none" className="block h-3 w-full">
        <path
          d="M0 12 L0 6 L14 8 L22 3 L37 7 L49 2 L61 6 L78 4 L90 9 L104 3 L121 6 L133 1 L150 5 L166 8 L178 3 L193 6 L207 2 L222 7 L236 4 L251 8 L263 3 L278 6 L291 2 L300 5 L300 12 Z"
          fill={fill}
        />
      </svg>
    )
  return (
    <svg viewBox="0 0 300 10" preserveAspectRatio="none" className="block h-2.5 w-full">
      <path d={bottom ? zigBottom : zigTop} fill={fill} />
    </svg>
  )
}

function Typed({ text, shown, caret }: { text: string; shown: number; caret: boolean }) {
  return (
    <>
      {text.slice(0, shown)}
      {caret && <span className="loading-caret" aria-hidden />}
    </>
  )
}

function SlipCard({ slip, at }: { slip: Slip; at: (typeof schedule)[number] & { now: number } }) {
  const { now } = at
  if (now < at.start) return null
  const writing = now < at.end
  const isPad = slip.paper === 'pad'

  return (
    <div
      className="loading-pop w-full"
      style={{ '--r': `${slip.rotate}deg` } as CSSProperties}
    >
      <div
        className="flex flex-col"
        style={{ filter: slip.paper === 'invoice' ? undefined : 'drop-shadow(0 12px 18px rgba(60,45,25,0.14))' }}
      >
        <Edge paper={slip.paper} />
        <div
          className={`relative flex flex-col ${isPad ? 'gap-0 py-3 pr-5 pl-12' : 'gap-2.5 px-6 pt-5'} ${isPad ? '' : slip.stamp ? 'pb-12' : 'pb-5'}`}
          style={paperStyle[slip.paper]}
        >
          <span
            className={
              isPad
                ? 'mb-1 self-start border-2 border-[#B5443A] px-1.5 font-sans text-[13px] leading-6 font-extrabold tracking-[0.14em] text-[#B5443A] uppercase'
                : slip.paper === 'invoice'
                  ? 'font-sans text-[17px] font-bold'
                  : 'text-center text-[15px] font-bold tracking-[0.2em]'
            }
          >
            {slip.title}
          </span>
          {!isPad && slip.paper !== 'invoice' && (
            <hr className="m-0 border-0 border-t-[1.5px] border-dashed border-receipt-rule" />
          )}
          {slip.paper === 'invoice' && (
            <hr className="m-0 border-0 border-t-[1.5px] border-solid border-[#1E2A44]" />
          )}
          {slip.lines.map((l, i) => {
            const t0 = at.lines[i]
            if (now < t0) return null
            const total = lineText(l).length
            const shown = Math.min(total, Math.floor((now - t0) / CHAR))
            const leftShown = Math.min(l.left.length, shown)
            const rightShown = Math.max(0, shown - l.left.length)
            const done = shown >= total
            const caretHere = writing && !done
            return (
              <div
                key={l.left}
                className={`flex justify-between gap-4 whitespace-nowrap ${isPad ? 'h-8 items-end text-[18px]' : 'text-[14px] leading-5'} ${l.strong ? 'font-bold' : ''}`}
              >
                <span>
                  <Typed text={l.left} shown={leftShown} caret={caretHere && rightShown === 0} />
                </span>
                {l.right && (
                  <span className="shrink-0">
                    <Typed text={l.right} shown={rightShown} caret={caretHere && rightShown > 0} />
                  </span>
                )}
              </div>
            )
          })}
          {slip.stamp && !writing && (
            <span className="loading-stamp absolute right-4 bottom-3 border-2 border-[rgba(169,124,42,0.75)] px-2 py-0.5 font-sans text-[12px] leading-4 font-extrabold tracking-[0.14em] text-[rgba(169,124,42,0.85)]">
              {slip.stamp}
            </span>
          )}
        </div>
        <Edge paper={slip.paper} bottom />
      </div>
    </div>
  )
}

/**
 * Shown while the agent works. Loops until the parent swaps it out;
 * pass onDone to play the sequence once instead.
 */
export function ReceiptLoader({ onDone, title = 'Finding your setting', label = 'Research in progress' }: {
  onDone?: () => void
  title?: string
  label?: string
} = {}) {
  const now = useClock(onDone)

  // Three columns, filled left to right, so new slips land in a flowing grid.
  const columns: number[][] = [[], [], []]
  slips.forEach((_, i) => columns[i % 3].push(i))

  return (
    <section aria-label={label} className="flex w-full flex-col items-center px-5 pt-10 pb-20 lg:pt-12">
        <h1 className="m-0 font-script text-[40px] leading-14 font-normal lg:text-[52px] lg:leading-[72px]">
          {title}
        </h1>

        <div className="mt-12 grid w-full max-w-[1020px] grid-cols-1 items-start gap-12 sm:grid-cols-3">
          {columns.map((col, ci) => (
            <div
              key={col.join()}
              className="flex flex-col gap-12"
              style={{ paddingTop: [24, 0, 56][ci] }}
            >
              {col.map((i) => (
                <SlipCard key={slips[i].title} slip={slips[i]} at={{ ...schedule[i], now }} />
              ))}
            </div>
          ))}
        </div>
      </section>
  )
}
