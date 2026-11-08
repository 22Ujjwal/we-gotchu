import { useEffect, useRef, useState } from 'react'
import type { Brief } from '#/lib/hostwell/fixture'
import './receipt-loader.css'

const duration = 14000

function printed(text: string, elapsed: number) {
  const count = Math.max(0, Math.ceil(elapsed / 32))
  return <><span>{text.slice(0, count)}</span><span className="slip-unprinted">{text.slice(count)}</span></>
}

export function ReceiptLoader({ onDone, title = 'Finding your setting', label = 'Research in progress', brief }: {
  onDone?: () => void
  title?: string
  label?: string
  brief?: Brief
} = {}) {
  const [percent, setPercent] = useState(0)
  const done = useRef(onDone)
  const strip = useRef<HTMLOListElement>(null)
  const preview = Boolean(onDone)
  useEffect(() => { done.current = onDone }, [onDone])

  useEffect(() => {
    let start: number | undefined
    let frame = 0
    const tick = (now: number) => {
      start ??= now
      const elapsed = Math.max(0, now - start)
      // Connected screens wait for their real route state to finish.
      setPercent(Math.min(100, Math.floor(100 * elapsed / duration)))
      if (elapsed < duration + 650) frame = requestAnimationFrame(tick)
      else done.current?.()
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [preview])

  const slips = [
    { name: 'Your brief', paper: 'thermal', task: 'Reading your brief', subtitle: brief?.occasion || 'Event details', rows: [['Date', brief?.date || 'TBD'], ['Guests', brief?.guests || 'TBD']], footer: brief?.area || 'Location requested' },
    { name: 'Venue hire', paper: 'invoice', task: 'Looking up local venues', subtitle: brief?.area || 'Local venues', rows: [['Seats needed', brief?.guests || 'TBD'], ['Setting', brief?.vibe || 'Any']], footer: 'Check listings' },
    { name: 'Supply desk', paper: 'notepad', task: 'Looking up supplies', subtitle: brief?.needs || 'Requested items', rows: [['Pack size', 'Check'], ['Unit price', 'Check']], footer: 'Request estimate' },
    { name: 'Venue details', paper: 'thermal', task: 'Checking supplier pages', subtitle: 'Supplier listing', rows: [['Capacity', 'Verify'], ['Availability', 'Verify']], footer: 'Check the source' },
    { name: 'Terms', paper: 'invoice', task: 'Reading cancellation terms', subtitle: 'Cancellation policy', rows: [['Window', 'Verify'], ['Max. loss', brief ? '$' + brief.canLose : 'TBD']], footer: 'Review terms' },
    { name: 'Estimate', paper: 'card', task: 'Checking the budget', subtitle: 'Cost worksheet', rows: [['Budget', brief ? '$' + brief.budget : 'TBD'], ['Total', 'Pending']], footer: 'Check missing fees' },
    { name: 'Shortlist', paper: 'notepad', task: 'Ranking the options', subtitle: 'Venue ranking', rows: [['Compare', 'Fit'], ['Flag', 'Gaps']], footer: 'Rank candidates' },
  ]
  const stage = Math.min(slips.length - 1, Math.floor(percent * slips.length / 100))
  useEffect(() => {
    const row = strip.current
    const slot = row?.children[stage]
    if (row && slot instanceof HTMLElement && row.scrollWidth > row.clientWidth) {
      row.scrollTo({ left: slot.offsetLeft - (row.clientWidth - slot.clientWidth) / 2,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
  }, [stage])

  const displayPercent = preview ? percent : Math.min(95, percent)
  return <section className="slip-loader" aria-label={label}>
    <h1 className="sr-only">{title}</h1>
    <div className="slip-meter" role="progressbar" aria-label="Planning animation" aria-valuetext={displayPercent + '% · ' + slips[stage].task} aria-valuenow={displayPercent} aria-valuemin={0} aria-valuemax={100}>
      <span>{displayPercent}</span><small>%</small>
    </div>
    <ol ref={strip} className="slip-strip" aria-label="Planning steps">
      {slips.map((slip, i) => {
        const elapsed = duration * (percent / 100 - i / slips.length)
        return <li className="slip-slot" key={slip.name}>
        {i <= stage && <div className="slip-enter rise"><div className={`slip-paper paper-${slip.paper}`}>
          <strong>{printed(slip.name, elapsed)}</strong>
          <div className="slip-subtitle">{printed(slip.subtitle, elapsed - 230)}</div>
          <dl>{slip.rows.map(([key, value], row) => <div key={key}><dt>{printed(key, elapsed - 540 - row * 340)}</dt><dd>{printed(value, elapsed - 720 - row * 340)}</dd></div>)}</dl>
          <div className="slip-footer">{printed(slip.footer, elapsed - 1350)}</div>
        </div></div>}
        </li>
      })}
    </ol>
  </section>
}
