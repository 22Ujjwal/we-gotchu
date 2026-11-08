import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { Brief } from '#/lib/hostwell/fixture'
import { to24h } from '#/lib/hostwell/fixture'
import { dialValueAtPoint, nearestDialRotation } from '#/lib/hostwell/time-dial'
import { Button } from './ui'
import { Chevron } from './icons'

export type ScheduleField = 'date' | 'from' | 'till'
type Schedule = Pick<Brief, ScheduleField>

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dateLabel = (date: Date) => new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
}).format(date).replace(',', '')

export function DateTimePicker({ value, field, onSave, onClose }: {
  value: Schedule
  field: ScheduleField
  onSave: (schedule: Schedule) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const initialDate = value.date ? new Date(value.date) : null
  const [selected, setSelected] = useState<Date | null>(
    initialDate && !Number.isNaN(initialDate.getTime()) ? initialDate : null,
  )
  const [month, setMonth] = useState(() => {
    const date = selected ?? new Date()
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const [from, setFrom] = useState(value.from ? to24h(value.from) : '19:00')
  const [till, setTill] = useState(value.till ? to24h(value.till) : '23:00')

  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    if (field !== 'date') element.querySelector<HTMLButtonElement>(`[data-time-field="${field}"]`)?.focus()
    else element.querySelector<HTMLButtonElement>('[data-calendar-focus]')?.focus()
    return () => element.close()
  }, [field])

  const offset = (month.getDay() + 6) % 7
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(month)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const today = new Date()
  const focusDay = selected && selected.getMonth() === month.getMonth() && selected.getFullYear() === month.getFullYear()
    ? selected.getDate()
    : sameDay(new Date(today.getFullYear(), today.getMonth(), 1), month) ? today.getDate() : 1
  const control = 'cursor-pointer rounded-md border-0 bg-transparent px-3 py-2 hover:bg-cream text-[16px] outline-none focus-visible:outline-2 focus-visible:outline-gold'

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={() => {
        if (!dialog.current?.open) onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close()
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-[400px] overflow-y-auto rounded-xl border-0 bg-white font-sans p-5 text-ink shadow-[0_16px_64px_#1f1b1620] backdrop:bg-ink/25 sm:p-6"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold">Date & time</h2>
        <button type="button" aria-label="Close date and time picker" onClick={() => dialog.current?.close()} className={`${control} border-0`}>✕</button>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <button type="button" aria-label="Previous month" className={control} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Chevron dir="left" /></button>
        <span aria-live="polite" className="font-semibold">{monthLabel}</span>
        <button type="button" aria-label="Next month" className={control} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Chevron dir="right" /></button>
      </div>
      <div role="group" aria-label={monthLabel} className="grid grid-cols-7 gap-1 text-center text-sm">
        {weekdays.map((day) => <span key={day} className="py-2 text-stone">{day}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = new Date(month.getFullYear(), month.getMonth(), i + 1)
          const active = selected !== null && sameDay(date, selected)
          return (
            <button
              key={i}
              type="button"
              aria-label={dateLabel(date)}
              aria-pressed={active}
              aria-current={sameDay(date, today) ? 'date' : undefined}
              data-calendar-focus={i + 1 === focusDay ? '' : undefined}
              onClick={() => setSelected(date)}
              className={`aspect-square cursor-pointer rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold ${active ? 'bg-ink font-semibold text-white' : 'hover:bg-cream'} ${sameDay(date, today) && !active ? 'font-bold text-ink' : ''}`}
            >{i + 1}</button>
          )
        })}
      </div>
      <div className="mt-7 space-y-2">
        <TimeChoice label="Start" field="from" value={from} onChange={setFrom} editing={editing} onEdit={setEditing} />
        <TimeChoice label="End" field="till" value={till} onChange={setTill} editing={editing} onEdit={setEditing} />
        {editing && <p className="text-center text-xs text-stone">Give it a spin. Or use the arrow keys.</p>}
      </div>
      {from && till && till <= from && <p className="mt-3 text-sm text-stone">{till === from ? 'Choose a different end time.' : 'Ends the following day.'}</p>}
      <Button
        type="button"
        className="mt-6 w-full rounded-lg py-3 text-base"
        disabled={!selected || !from || !till || from === till}
        onClick={() => {
          if (!selected) return
          onSave({ date: dateLabel(selected), from: displayTime(from), till: displayTime(till) })
          dialog.current?.close()
        }}
      >Done</Button>
    </dialog>
  )
}

function displayTime(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour >= 12 ? 'pm' : 'am'}`
}

function TimeChoice({ label, field, value, onChange, editing, onEdit }: {
  label: string
  field: 'from' | 'till'
  value: string
  onChange: (value: string) => void
  editing: string | null
  onEdit: (value: string | null) => void
}) {
  const panelId = useId()
  const [hour, minute] = value.split(':').map(Number)
  const isPm = hour >= 12
  const part = editing === `${field}-hour` ? 'hour' : editing === `${field}-minute` ? 'minute' : null
  const update = (h: number, m: number) => onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  const focus = 'cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold'
  const togglePart = (next: 'hour' | 'minute') => onEdit(part === next ? null : `${field}-${next}`)

  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="w-10 text-sm text-stone">{label}</span>
        <div role="group" aria-label={`${label} time`} className="flex items-center gap-1">
          <button
            type="button"
            data-time-field={field}
            aria-label={`${label} hour: ${hour % 12 || 12}`}
            aria-expanded={part === 'hour'}
            aria-controls={part === 'hour' ? panelId : undefined}
            onClick={() => togglePart('hour')}
            className={`${focus} min-h-11 min-w-11 rounded-lg text-[24px] tabular-nums ${part === 'hour' ? 'bg-cream' : 'hover:bg-cream/60'}`}
          >{hour % 12 || 12}</button>
          <span aria-hidden className="text-xl text-sand">:</span>
          <button
            type="button"
            aria-label={`${label} minutes: ${String(minute).padStart(2, '0')}`}
            aria-expanded={part === 'minute'}
            aria-controls={part === 'minute' ? panelId : undefined}
            onClick={() => togglePart('minute')}
            className={`${focus} min-h-11 min-w-11 rounded-lg text-[24px] tabular-nums ${part === 'minute' ? 'bg-cream' : 'hover:bg-cream/60'}`}
          >{String(minute).padStart(2, '0')}</button>
        </div>
        <div role="group" aria-label={`${label} AM or PM`} className="flex gap-1">
          {['am', 'pm'].map((period) => (
            <button
              key={period}
              type="button"
              aria-label={`${label} ${period.toUpperCase()}`}
              aria-pressed={period === (isPm ? 'pm' : 'am')}
              onClick={() => update(hour % 12 + (period === 'pm' ? 12 : 0), minute)}
              className={`${focus} min-h-11 rounded-full px-2.5 text-xs ${period === (isPm ? 'pm' : 'am') ? 'bg-cream text-ink' : 'text-stone hover:bg-cream/60'}`}
            >{period}</button>
          ))}
        </div>
      </div>
      {part && (
        <div id={panelId} className="pt-3">
          <TimeDial
            label={label}
            part={part}
            value={part === 'hour' ? hour % 12 : minute}
            onChange={(next) => {
              if (part === 'hour') update(next + (isPm ? 12 : 0), minute)
              else update(hour, next)
            }}
          />
        </div>
      )}
    </div>
  )
}

function TimeDial({ label, part, value, onChange }: {
  label: string
  part: 'hour' | 'minute'
  value: number
  onChange: (value: number) => void
}) {
  const count = part === 'hour' ? 12 : 60
  const step = part === 'hour' ? 1 : 5
  const angle = value / count * 360
  const [rotation, setRotation] = useState(angle)
  const [dragging, setDragging] = useState(false)
  const pointer = useRef<number | null>(null)
  const hintId = useId()

  // Follow the shortest arc, including when crossing twelve o'clock.
  useEffect(() => {
    setRotation((previous) => nearestDialRotation(previous, angle))
  }, [angle])

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left - bounds.width / 2
    const y = event.clientY - bounds.top - bounds.height / 2
    if (Math.hypot(x, y) < bounds.width * 0.15) return
    onChange(dialValueAtPoint(x, y, count, step))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1
      : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 0
    if (delta) {
      event.preventDefault()
      onChange((value + delta + count) % count)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      onChange(event.key === 'Home' ? 0 : count - 1)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="slider"
        tabIndex={0}
        aria-label={`${label} ${part === 'hour' ? 'hour' : 'minutes'}`}
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={value}
        aria-valuetext={part === 'hour' ? `${value || 12} o'clock` : `${value} minutes`}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (pointer.current !== null || event.button !== 0) return
          event.preventDefault()
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          pointer.current = event.pointerId
          setDragging(true)
          pick(event)
        }}
        onPointerMove={(event) => {
          if (pointer.current === event.pointerId) pick(event)
        }}
        onPointerUp={(event) => {
          if (pointer.current !== event.pointerId) return
          pick(event)
          event.currentTarget.releasePointerCapture(event.pointerId)
          pointer.current = null
          setDragging(false)
        }}
        onPointerCancel={() => { pointer.current = null; setDragging(false) }}
        onLostPointerCapture={() => { pointer.current = null; setDragging(false) }}
        className={`size-[224px] touch-none select-none rounded-full bg-cream/60 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <svg viewBox="0 0 240 240" className="size-full overflow-visible" aria-hidden="true">
          {Array.from({ length: 60 }, (_, tick) => {
            const radians = tick * Math.PI / 30
            const major = tick % 5 === 0
            return <circle key={tick} cx={120 + Math.sin(radians) * 108} cy={120 - Math.cos(radians) * 108} r={major ? 1.8 : 0.8} fill="currentColor" className={major ? 'text-sand' : 'text-sand/50'} />
          })}
          {Array.from({ length: 12 }, (_, i) => {
            const radians = i * Math.PI / 6
            const number = part === 'hour' ? i || 12 : String(i * 5).padStart(2, '0')
            const active = part === 'hour' ? i === value : i * 5 === value
            return <text key={i} x={120 + Math.sin(radians) * 85} y={120 - Math.cos(radians) * 85} dy="0.35em" textAnchor="middle" fontSize="14" fontWeight={active ? 600 : 400} fill="currentColor" className={active ? 'text-ink' : 'text-stone'}>{number}</text>
          })}
          <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '120px 120px' }} className="motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out">
            <line x1="120" y1="120" x2="120" y2="57" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-sand" />
            <circle cx="120" cy="35" r="17" fill="currentColor" className="text-ink" />
            <g stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none">
              <path d="M115 31v1m10-1v1" />
              <path d={dragging ? 'M115 37q5 7 10 0' : 'M116 37q4 4 8 0'} />
            </g>
          </g>
          <circle cx="120" cy="120" r="5" fill="currentColor" className="text-ink" />
          <text x="120" y="152" textAnchor="middle" fontSize="10" fill="currentColor" className="text-stone">{dragging ? 'wheee' : part === 'hour' ? 'hours' : 'minutes'}</text>
        </svg>
      </div>
      <span id={hintId} className="sr-only">Drag around the dial, tap a number, or use arrow keys to adjust {part === 'hour' ? 'hours' : 'minutes'}. Minutes snap to five-minute steps when dragging.</span>
    </div>
  )
}
