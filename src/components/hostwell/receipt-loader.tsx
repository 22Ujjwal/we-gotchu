import { useEffect, useRef, useState } from 'react'
import type { Brief } from '#/lib/hostwell/fixture'
import './receipt-loader.css'

const duration = 14000

function printed(text: string, elapsed: number) {
  const count = Math.max(0, Math.ceil(elapsed / 32))
  return <><span>{text.slice(0, count)}</span><span className="slip-unprinted">{text.slice(count)}</span></>
}

function ActivityDial({ tasks, index }: { tasks: string[]; index: number }) {
  const hasLongStatus = tasks.slice(Math.max(0, index - 1), index + 2).some(text => text.length > 34)
  return <div className="slip-activity" data-live={hasLongStatus || undefined}>
    <span className="sr-only" role="status">{tasks[index]}</span>
    <div className="activity-track" aria-hidden="true" style={{ transform: `translateY(calc(${1 - index} * var(--dial-row)))` }}>
      {tasks.map((text, i) => <div key={i} className="activity-row" data-current={i === index}>
        <span title={text}>{text}</span>
      </div>)}
    </div>
  </div>
}

// Connected research reports completed and current messages; future messages
// only appear in the preview, where the sequence is known ahead of time.
function LiveActivityDial({ text }: { text: string }) {
  const [history, setHistory] = useState([text])
  if (history[history.length - 1] !== text) setHistory([...history, text])
  return <ActivityDial tasks={history} index={history.length - 1} />
}

export function ReceiptLoader({ onDone, title = 'Finding your setting', label = 'Research in progress', brief, activity }: {
  onDone?: () => void
  title?: string
  label?: string
  activity?: string
  brief?: Partial<Brief>
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
    { name: 'Terms', paper: 'invoice', task: 'Reading cancellation terms', subtitle: 'Cancellation policy', rows: [['Window', 'Verify'], ['Max. loss', brief?.canLose?.trim() ? '$' + brief.canLose : 'Not specified']], footer: 'Review terms' },
    { name: 'Estimate', paper: 'card', task: 'Checking the budget', subtitle: 'Cost worksheet', rows: [['Budget', brief?.budget ? '$' + brief.budget : 'TBD'], ['Total', 'Pending']], footer: 'Check missing fees' },
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

  return <section className="slip-loader" data-finishing={preview && percent === 100 || undefined} aria-label={label}>
    <h1 className="sr-only">{title}</h1>
    {preview ? <ActivityDial tasks={slips.map(slip => slip.task)} index={stage} />
      : <LiveActivityDial text={activity ?? title} />}
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
