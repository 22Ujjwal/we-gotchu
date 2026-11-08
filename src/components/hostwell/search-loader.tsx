import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/*
 * Loading state while the agent looks for venues: a magnifying glass swivels
 * round a paper map, enlarging the streets under it and lighting up the pins
 * it passes. Everything is derived from one clock so the sequence loops.
 */

// Map space (SVG units)
const W = 480
const H = 320
// The glass orbits this ellipse, swaying as it goes.
const ORBIT = { cx: 240, cy: 160, rx: 120, ry: 72 }
const LENS = 46
const ZOOM = 1.7

// Timing (ms)
const LAP = 2800 // one full swivel round the map
const LAPS = 3 // when playing once
const STATUS = 2100 // per status line
const TOTAL = LAP * LAPS

const statuses = [
  'Reading your brief',
  'Scanning the neighbourhood',
  'Checking who fits your guests',
  'Comparing prices',
  'Shortlisting the best fits',
]

// Pins on the orbit get found as the glass passes; the rest stay unvisited.
const onOrbit = [20, 75, 130, 190, 245, 300].map((deg) => {
  const a = (deg * Math.PI) / 180
  return { x: ORBIT.cx + ORBIT.rx * Math.cos(a), y: ORBIT.cy + ORBIT.ry * Math.sin(a), at: a }
})
const pins = [
  ...onOrbit,
  { x: 418, y: 58, at: Infinity },
  { x: 66, y: 268, at: Infinity },
  { x: 236, y: 150, at: Infinity },
]

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
        setNow(TOTAL)
        if (!fired) {
          fired = true
          done.current?.()
        }
        return
      }
      setNow(elapsed)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [once])
  return now
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const change = () => setReduced(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return reduced
}

function Pin({ x, y, found, near }: { x: number; y: number; found: boolean; near: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g
        style={{
          transform: `scale(${near ? 1.25 : 1})`,
          transition: 'transform 280ms cubic-bezier(0.3, 1.6, 0.5, 1)',
        }}
      >
        <ellipse cx="0" cy="0" rx="4.5" ry="1.6" fill="rgb(31 27 22 / 0.18)" />
        <path
          d="M0 0 C-2 -5 -7 -8.5 -7 -14 A7 7 0 1 1 7 -14 C7 -8.5 2 -5 0 0 Z"
          fill={found ? 'var(--color-gold)' : 'var(--color-ink)'}
          style={{ transition: 'fill 200ms' }}
        />
        <circle cx="0" cy="-14" r="2.6" fill="var(--color-receipt)" />
      </g>
    </g>
  )
}

/** The paper map. Drawn twice: once flat, once enlarged inside the lens. */
function MapArt({ found, near }: { found: boolean[]; near: boolean[] }) {
  return (
    <>
      <rect width={W} height={H} fill="var(--color-cream)" />
      {/* Parks */}
      <g fill="#dfe4d6">
        <rect x="52" y="34" width="74" height="52" rx="10" />
        <rect x="352" y="206" width="92" height="62" rx="12" />
        <ellipse cx="300" cy="44" rx="34" ry="16" />
      </g>
      {/* River */}
      <path
        d="M0 182 C90 146 160 222 250 184 S400 140 480 168"
        fill="none"
        stroke="#cfd8d1"
        strokeWidth="18"
        strokeLinecap="round"
      />
      {/* Side streets */}
      <g stroke="#fffdf7" strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M0 52 L480 40" />
        <path d="M0 286 L480 296" />
        <path d="M64 0 L84 320" />
        <path d="M244 0 L236 320" />
        <path d="M410 0 L396 320" />
        <path d="M100 140 L230 120" />
        <path d="M270 270 L380 140" />
      </g>
      {/* Avenues */}
      <g stroke="#fffdf7" strokeWidth="9" strokeLinecap="round" fill="none">
        <path d="M0 112 L480 92" />
        <path d="M0 232 L480 252" />
        <path d="M150 0 L170 320" />
        <path d="M332 0 L312 320" />
        <path d="M30 320 L270 0" />
      </g>
      <g stroke="var(--color-cream-line)" strokeWidth="1" fill="none">
        <path d="M0 112 L480 92" />
        <path d="M0 232 L480 252" />
      </g>
      {pins.map((p, i) => (
        <Pin key={i} x={p.x} y={p.y} found={found[i]} near={near[i]} />
      ))}
    </>
  )
}

function Glass({ x, y, tilt, scale }: { x: number; y: number; tilt: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${scale})`}>
      {/* Handle, pointing down and to the right */}
      <g transform="rotate(45)">
        <rect x={LENS + 4} y="-5" width="16" height="10" rx="2" fill="var(--color-brass)" />
        <rect x={LENS + 18} y="-8" width="58" height="16" rx="8" fill="var(--color-ink)" />
        <rect x={LENS + 24} y="-5" width="44" height="3" rx="1.5" fill="rgb(255 255 255 / 0.16)" />
      </g>
      {/* Rim */}
      <circle r={LENS + 5} fill="none" stroke="url(#search-rim)" strokeWidth="10" />
      <circle r={LENS} fill="none" stroke="rgb(31 27 22 / 0.18)" strokeWidth="2" />
      {/* Glare */}
      <path
        d={`M${-LENS * 0.62} ${-LENS * 0.18} A${LENS * 0.66} ${LENS * 0.66} 0 0 1 ${-LENS * 0.1} ${-LENS * 0.64}`}
        fill="none"
        stroke="rgb(255 255 255 / 0.7)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx={-LENS * 0.2} cy={-LENS * 0.72} r="2.5" fill="rgb(255 255 255 / 0.8)" />
    </g>
  )
}

/**
 * Shown while the agent researches venues. Loops until the parent swaps it
 * out; pass onDone to play a few laps once instead.
 */
export function SearchLoader({
  onDone,
  title = 'Finding your setting',
  label = 'Research in progress',
}: {
  onDone?: () => void
  title?: ReactNode
  label?: string
} = {}) {
  const now = useClock(onDone)
  const reduced = useReducedMotion()

  // Angle round the orbit, starting at the right-hand side.
  const swept = reduced ? Math.PI * 0.3 : (now / LAP) * Math.PI * 2
  const a = swept % (Math.PI * 2)
  const x = ORBIT.cx + ORBIT.rx * Math.cos(a)
  const y = ORBIT.cy + ORBIT.ry * Math.sin(a)
  // Swing the handle as it travels and lean in at the front of the lap.
  const tilt = reduced ? 0 : 16 * Math.sin(a) - 6
  const scale = reduced ? 1 : 1 + 0.06 * Math.sin(a)

  const found = pins.map((p) => reduced || swept >= p.at)
  const near = pins.map((p) => Math.hypot(p.x - x, p.y - y + 8) < LENS * 0.7)
  const status = statuses[Math.floor(now / STATUS) % statuses.length]
  const count = found.filter(Boolean).length

  return (
    <section aria-label={label} className="flex w-full flex-1 flex-col items-center px-5 pt-10 pb-20 lg:pt-12">
      <h1 className="m-0 text-center font-script text-[40px] leading-14 font-normal lg:text-[52px] lg:leading-[72px]">
        {title}
      </h1>

      <div className="mt-10 w-full max-w-[620px] lg:mt-12">
        <div
          className="overflow-hidden rounded-[6px] border border-cream-line"
          style={{
            transform: 'rotate(-1.2deg)',
            boxShadow: '0 18px 34px rgba(60,45,25,0.14), 0 1px 2px rgba(60,45,25,0.10)',
          }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden>
            <defs>
              <linearGradient id="search-rim" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f0d58c" />
                <stop offset="40%" stopColor="#c99a3b" />
                <stop offset="65%" stopColor="#f6e6b8" />
                <stop offset="100%" stopColor="#b4852a" />
              </linearGradient>
              <linearGradient id="search-folds" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#000" stopOpacity="0" />
                <stop offset="0.333" stopColor="#000" stopOpacity="0.03" />
                <stop offset="0.334" stopColor="#fff" stopOpacity="0.2" />
                <stop offset="0.666" stopColor="#000" stopOpacity="0.03" />
                <stop offset="0.667" stopColor="#fff" stopOpacity="0.2" />
                <stop offset="1" stopColor="#000" stopOpacity="0" />
              </linearGradient>
              <radialGradient id="search-shadow">
                <stop offset="0" stopColor="#3c2d19" stopOpacity="0.22" />
                <stop offset="1" stopColor="#3c2d19" stopOpacity="0" />
              </radialGradient>
              <clipPath id="search-lens">
                <circle cx={x} cy={y} r={LENS * scale} />
              </clipPath>
            </defs>

            <MapArt found={found} near={near} />
            <rect width={W} height={H} fill="url(#search-folds)" />

            {/* Glass shadow, cast down and to the right */}
            <ellipse cx={x + 18} cy={y + 22} rx={LENS + 14} ry={LENS + 6} fill="url(#search-shadow)" />

            {/* Enlarged map under the lens */}
            <g clipPath="url(#search-lens)">
              <g transform={`translate(${x} ${y}) scale(${ZOOM}) translate(${-x} ${-y})`}>
                <MapArt found={found} near={near} />
              </g>
              <circle cx={x} cy={y} r={LENS} fill="rgb(255 255 255 / 0.08)" />
            </g>

            <Glass x={x} y={y} tilt={tilt} scale={scale} />
          </svg>
        </div>

        <p className="m-0 mt-8 flex items-baseline justify-between gap-4 font-body text-[15px] leading-6 text-stone">
          <span className="text-body">
            {status}
            <span className="loading-dots" aria-hidden />
          </span>
          <span className="shrink-0 font-mono text-[13px]">{count} {count === 1 ? 'fit' : 'fits'} found</span>
        </p>
      </div>
    </section>
  )
}
