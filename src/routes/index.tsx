import { useUser } from '@clerk/tanstack-react-start'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { DateTimePicker } from '#/components/hostwell/date-time-picker'
import type { ScheduleField } from '#/components/hostwell/date-time-picker'
import { ReceiptLoader } from '#/components/hostwell/receipt-loader'
import { Button, Header } from '#/components/hostwell/ui'
import { briefFromPreview } from '#/lib/hostwell/brief-adapter'
import { EventApiError, createEventApi } from '#/lib/hostwell/event-api'
import type { Brief } from '#/lib/hostwell/fixture'
import { useHostwell } from '#/lib/hostwell/store'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/')({ component: BriefPage })

type Key = keyof Brief
/** A sentence is text interleaved with blanks: [text, key, text, key, …, text]. */
type Sentence = Array<string | { key: Key; label: string; optional?: boolean; placeholder?: string }>

const sentences: Array<Sentence> = [
  ["I'm planning ", { key: 'occasion', label: 'Occasion', placeholder: 'Franz’s 30th birthday' }, ' for ', { key: 'guests', label: 'Number of guests', placeholder: '24' }, ' people.'],
  ["It's on ", { key: 'date', label: 'Date', placeholder: 'Sat 12 Dec' }, ' from ', { key: 'from', label: 'Start time', placeholder: '7pm' }, ' till ', { key: 'till', label: 'End time', placeholder: '11pm' }, ', in ', { key: 'area', label: 'Area', placeholder: 'Kreuzberg or Neukölln' }, '.'],
  ["I'll spend up to $", { key: 'budget', label: 'Budget in dollars', placeholder: '900' }, ', and can lose $', { key: 'canLose', label: 'Acceptable cancellation loss in dollars', placeholder: '10' }, ' if plans change.'],
  ["We'll need ", { key: 'needs', label: 'What you need', placeholder: 'table candles' }, ', and the vibe should be ', { key: 'vibe', label: 'Vibe', optional: true, placeholder: 'cosy? fancy?' }],
]

// Where the finished sentence and the brief so far sat before moving on.
type Flight = { from: DOMRect; fontSize: number; rows: Array<DOMRect> }

const canAnimate = () =>
  typeof Element.prototype.animate === 'function' &&
  !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const centre = (r: DOMRect) => [r.left + r.width / 2, r.top + r.height / 2]

function BriefPage() {
  return localPreview ? <PreviewBriefPage /> : <ConnectedBriefPage />
}

// Preview has no real research run, so play the loader once, then move on.
function PreviewBriefPage() {
  const navigate = useNavigate()
  return <BriefFlow onSearch={async () => {}} onLoaderDone={() => navigate({ to: '/settings' })} />
}

const savedBrief = 'arrange:brief'

function ConnectedBriefPage() {
  const { user, isLoaded } = useUser()
  const navigate = useNavigate()
  const [locked, setLocked] = useState(false)
  return (
    <BriefFlow
      disabled={!isLoaded || locked}
      onSearch={async (draft) => {
        if (!user) {
          // Keep the answers across the sign-in redirect.
          sessionStorage.setItem(savedBrief, JSON.stringify(draft))
          window.location.assign('/sign-in?redirect_url=%2F')
          return new Promise<never>(() => {})
        }
        const brief = briefFromPreview(draft)
        try {
          const { event } = await createEventApi().create(brief)
          sessionStorage.removeItem(savedBrief)
          await navigate({ to: '/events/$eventId', params: { eventId: event.eventId } })
        } catch (error) {
          if (!(error instanceof EventApiError) || error.status === 0 || error.status >= 500 ||
              error.code === 'invalid_response' || error.code === 'outcome_unknown') {
            setLocked(true)
            throw new Error('We could not tell if your event was created. Please do not submit again.')
          }
          throw error
        }
      }}
    />
  )
}

function BriefFlow({
  onSearch,
  onLoaderDone,
  disabled = false,
}: {
  onSearch: (brief: Brief) => Promise<void>
  onLoaderDone?: () => void
  disabled?: boolean
}) {
  const { brief, setBrief } = useHostwell()
  const [draft, setDraft] = useState(brief)
  const [step, setStep] = useState(0)
  const [scheduleField, setScheduleField] = useState<ScheduleField | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const sentenceRef = useRef<HTMLDivElement>(null)
  const flight = useRef<Flight | null>(null)

  useEffect(() => {
    const saved = sessionStorage.getItem(savedBrief)
    if (!saved || localPreview) return
    try {
      const restored = { ...brief, ...(JSON.parse(saved) as Brief) }
      setDraft(restored)
      setBrief(restored)
      setStep(sentences.length - 1)
    } catch {
      sessionStorage.removeItem(savedBrief)
    }
  }, [])

  // The finished sentence shrinks into the brief so far, and earlier lines
  // slide up to make room for it.
  useLayoutEffect(() => {
    const f = flight.current
    flight.current = null
    const rows = listRef.current?.children
    if (!f || !rows || !canAnimate()) return
    Array.from(rows).forEach((row, i) => {
      const to = row.getBoundingClientRect()
      const easing = 'cubic-bezier(0.5, 0, 0.15, 1)'
      if (i < f.rows.length) {
        const from = f.rows[i]
        row.animate([{ translate: `0 ${from.top - to.top}px` }, { translate: '0 0' }], { duration: 560, easing })
        return
      }
      const scale = f.fontSize / parseFloat(getComputedStyle(row.firstElementChild!).fontSize)
      const [fx, fy] = centre(f.from)
      const [tx, ty] = centre(to)
      row.animate(
        [{ transform: `translate(${fx - tx}px, ${fy - ty}px) scale(${scale})` }, { transform: 'none' }],
        { duration: 560, easing },
      )
    })
  }, [step])

  const sentence = sentences[step]
  const last = step === sentences.length - 1
  const complete = sentence.every(
    (part) => typeof part === 'string' || part.optional || draft[part.key].trim(),
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!complete || disabled) return
    setBrief(draft)
    setError('')
    if (!last) {
      const finished = sentenceRef.current
      if (finished)
        flight.current = {
          from: finished.getBoundingClientRect(),
          fontSize: parseFloat(getComputedStyle(finished).fontSize),
          rows: Array.from(listRef.current?.children ?? [], (row) => row.getBoundingClientRect()),
        }
      return setStep(step + 1)
    }
    setSearching(true)
    onSearch(draft).catch((cause: unknown) => {
      setSearching(false)
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.')
    })
  }

  if (searching)
    return (
      <div className="flex min-h-screen flex-col">
        <Header step="setting" />
        <ReceiptLoader brief={draft} onDone={onLoaderDone} />
      </div>
    )

  return (
    <div className="flex min-h-screen flex-col">
      <Header step="brief" />
      <main className="flex flex-1 flex-col items-center justify-center px-5 pt-10 pb-8 lg:px-12">
        <form
          onSubmit={submit}
          className="flex w-full max-w-[900px] flex-col items-center gap-9 lg:gap-12"
        >
          {step > 0 && (
            <ol ref={listRef} aria-label="Your brief so far" className="m-0 flex list-none flex-col items-center gap-2 p-0 lg:gap-1.5">
              {sentences.slice(0, step).map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    className="cursor-pointer text-center text-[16px] leading-[26px] text-stone hover:text-ink lg:text-[22px] lg:leading-[38px]"
                  >
                    {s.map((part, j) =>
                      typeof part === 'string' ? (
                        <Fragment key={j}>{part}</Fragment>
                      ) : (
                        <span key={j} className="font-script text-ink">
                          {draft[part.key]}
                        </span>
                      ),
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}

          <div
            key={step}
            ref={sentenceRef}
            className="m-0 text-center text-[34px] leading-[60px] font-light tracking-[-0.02em] lg:text-[56px] lg:leading-[96px]"
          >
            {sentence.map((part, j) =>
              typeof part === 'string' ? (
                <Fragment key={j}>{part}</Fragment>
              ) : (
                <Blank
                  key={part.key}
                  label={part.label}
                  value={draft[part.key]}
                  placeholder={part.placeholder}
                  autoFocus={j === 1}
                  onChange={(v) => setDraft({ ...draft, [part.key]: v })}
                  onPick={part.key === 'date' || part.key === 'from' || part.key === 'till'
                    ? () => setScheduleField(part.key as ScheduleField)
                    : undefined}
                />
              ),
            )}
          </div>

          {error && (
            <p role="alert" className="m-0 text-center font-body text-[17px] leading-6 text-body">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={!complete || disabled}
            className="w-full py-[17px] text-[18px] leading-[22px] font-bold lg:w-auto lg:px-14"
          >
            {last ? 'Find venues' : 'Next'}
          </Button>
          {!localPreview && (import.meta.env.DEV || import.meta.env.VITE_PLANNING_ENABLED === 'true') &&
            <Link to="/planning" className="text-[16px] text-stone underline underline-offset-4">Plan with our research assistant</Link>}
        </form>
      </main>
      {scheduleField && (
        <DateTimePicker
          value={draft}
          field={scheduleField}
          onSave={(schedule) => setDraft((current) => ({ ...current, ...schedule }))}
          onClose={() => setScheduleField(null)}
        />
      )}
    </div>
  )
}

function Blank({
  label,
  value,
  placeholder,
  autoFocus,
  onChange,
  onPick,
}: {
  label: string
  value: string
  placeholder?: string
  autoFocus?: boolean
  onChange: (v: string) => void
  onPick?: () => void
}) {
  const ref = useRef<HTMLSpanElement>(null)
  // A word joiner gives the native caret a text position and prevents a line
  // break between it and the placeholder. It is never saved in the brief.
  const emptyAnchor = '\u2060'
  const focusEmptyField = (field: HTMLSpanElement) => {
    const range = document.createRange()
    range.setStart(field.firstChild!, 0)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  useEffect(() => {
    const field = ref.current
    if (!field) return
    // Keep React out of the editable DOM so typing never resets the caret.
    const text = value || emptyAnchor
    if (field.textContent !== text) field.textContent = text
  }, [value])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const className = `blank mx-1 max-w-full min-w-[3ch] border-0 bg-transparent p-0 font-script text-[34px] font-normal tracking-[-0.02em] underline decoration-1 underline-offset-[0.12em] outline-none placeholder:text-faint [text-decoration-skip-ink:none] lg:text-[54px] ${value ? 'decoration-sand' : 'decoration-ink'}`
  if (onPick) {
    return (
      <button
        type="button"
        aria-label={value ? `${label}: ${value}` : label}
        aria-haspopup="dialog"
        onClick={onPick}
        autoFocus={autoFocus}
        className={`${className} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold ${value ? '' : 'text-faint'}`}
      >{value || placeholder}</button>
    )
  }
  return (
    <span
      ref={ref}
      role="textbox"
      aria-label={label}
      aria-placeholder={placeholder}
      aria-multiline={false}
      tabIndex={0}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-placeholder={placeholder}
      data-empty={!value}
      onFocus={(e) => {
        if (!value) focusEmptyField(e.currentTarget)
      }}
      onClick={(e) => {
        e.currentTarget.focus()
        if (!value) focusEmptyField(e.currentTarget)
      }}
      onInput={(e) => {
        const field = e.currentTarget
        const text = (field.textContent ?? '').replaceAll(emptyAnchor, '')
        if (text && field.firstChild?.nodeType === Node.TEXT_NODE) {
          // Remove the anchor in place so the browser preserves the caret.
          const node = field.firstChild as Text
          const anchorIndex = node.data.indexOf(emptyAnchor)
          if (anchorIndex !== -1) node.deleteData(anchorIndex, 1)
        }
        if (!text) {
          field.textContent = emptyAnchor
          focusEmptyField(field)
        }
        onChange(text)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.closest('form')?.requestSubmit()
        }
      }}
      className={`blank mx-1 font-script text-[34px] font-normal tracking-[-0.02em] underline decoration-1 underline-offset-[0.12em] outline-none [text-decoration-skip-ink:none] lg:text-[54px] ${value ? 'decoration-sand' : 'decoration-ink'}`}
    />
  )
}
