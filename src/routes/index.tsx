import { useUser } from '@clerk/tanstack-react-start'
import { localPreview } from '#/lib/local-preview'
import { BriefIntake } from '#/components/hostwell/brief-intake'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { DateTimePicker } from '#/components/hostwell/date-time-picker'
import type { ScheduleField } from '#/components/hostwell/date-time-picker'
import { Button, Header } from '#/components/hostwell/ui'
import { ArrowRight } from '#/components/hostwell/icons'
import type { Brief } from '#/lib/hostwell/fixture'
import { useHostwell } from '#/lib/hostwell/store'

export const Route = createFileRoute('/')({ component: BriefPage })

type Key = keyof Brief
/** A sentence is text interleaved with blanks: [text, key, text, key, …, text]. */
type Sentence = Array<string | { key: Key; label: string; optional?: boolean; placeholder?: string }>

const sentences: Array<Sentence> = [
  ["I'm planning ", { key: 'occasion', label: 'Occasion', placeholder: 'Franz’s 30th birthday' }, ' for ', { key: 'guests', label: 'Number of guests', placeholder: '24' }, ' people.'],
  ["It's on ", { key: 'date', label: 'Date', placeholder: 'Sat 12 Dec' }, ' from ', { key: 'from', label: 'Start time', placeholder: '7pm' }, ' till ', { key: 'till', label: 'End time', placeholder: '11pm' }, ', in ', { key: 'area', label: 'Area', placeholder: 'Kreuzberg or Neukölln' }, '.'],
  ["I'll spend up to $", { key: 'budget', label: 'Budget', placeholder: '900' }, ', and can lose $', { key: 'canLose', label: 'Acceptable cancellation loss', placeholder: '10' }, ' if plans change.'],
  ["We'll need ", { key: 'needs', label: 'What you need', placeholder: 'e.g. table candles' }, ', and the vibe should be ', { key: 'vibe', label: 'Vibe', optional: true, placeholder: 'cosy? fancy?' }],
]

function BriefPage() {
  return localPreview ? <PreviewBriefPage /> : <ConnectedBriefPage />
}

function ConnectedBriefPage() {
  const { user, isLoaded } = useUser()
  const navigate = useNavigate()
  return <div className="flex min-h-screen flex-col">
    <Header step="brief" />
    <main className="flex flex-1 flex-col items-center justify-center px-5 pt-10 pb-8 lg:px-12">
      {isLoaded ? <BriefIntake identity={user?.id ?? null}
        onCreated={eventId => void navigate({ to: '/events/$eventId', params: { eventId } })} />
        : <p role="status">Loading sign-in...</p>}
    </main>
  </div>
}

function PreviewBriefPage() {
  const { brief, setBrief } = useHostwell()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(brief)
  const [step, setStep] = useState(0)
  const [scheduleField, setScheduleField] = useState<ScheduleField | null>(null)
  const [leaving, setLeaving] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const sentencePanel = useRef<HTMLDivElement>(null)
  const exitAnimation = useRef<Animation | null>(null)
  const changingStep = useRef(false)
  const previousPositions = useRef(new Map<string, number>())

  useEffect(() => () => exitAnimation.current?.cancel(), [])

  useLayoutEffect(() => {
    const positions = previousPositions.current
    if (!positions.size) return
    form.current?.querySelectorAll<HTMLElement>('[data-brief-layout]').forEach((element) => {
      const previous = positions.get(element.dataset.briefLayout!)
      if (previous === undefined) return
      const distance = previous - element.getBoundingClientRect().top
      if (Math.abs(distance) < 1) return
      element.animate(
        [{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0)' }],
        { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    })
    positions.clear()
  }, [step])

  const changeStep = async (next: number) => {
    const panel = sentencePanel.current
    if (changingStep.current || !panel || next === step) return
    changingStep.current = true
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reducedMotion) {
      setLeaving(true)
      form.current?.querySelectorAll<HTMLElement>('[data-brief-layout]').forEach((element) => {
        previousPositions.current.set(element.dataset.briefLayout!, element.getBoundingClientRect().top)
      })
      exitAnimation.current = panel.animate(
        [
          { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
          { opacity: 0, transform: `translateY(${next > step ? -14 : 14}px)`, filter: 'blur(4px)' },
        ],
        { duration: 180, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
      )
      try {
        await exitAnimation.current.finished
      } catch {
        return
      }
      exitAnimation.current.cancel()
      exitAnimation.current = null
    }
    if (!panel.isConnected) return
    setStep(next)
    setLeaving(false)
    changingStep.current = false
  }

  const sentence = sentences[step]
  const last = step === sentences.length - 1
  const complete = sentence.every(
    (part) => typeof part === 'string' || part.optional || draft[part.key].trim(),
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!complete || changingStep.current) return
    setBrief(draft)
    if (last) navigate({ to: '/settings' })
    else void changeStep(step + 1)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header step="brief" />
      <main className="flex flex-1 flex-col items-center justify-center px-5 pt-10 pb-8 lg:px-12">
        <form
          ref={form}
          onSubmit={submit}
          className="flex w-full max-w-[900px] flex-col items-center gap-9 lg:gap-12"
        >
          {step > 0 && (
            <ol aria-label="Your brief so far" className="m-0 flex list-none flex-col items-center gap-2 p-0 lg:gap-1.5">
              {sentences.slice(0, step).map((s, i) => (
                <li key={i} data-brief-layout={`summary-${i}`} className="brief-summary-entry">
                  <button
                    type="button"
                    onClick={() => void changeStep(i)}
                    disabled={leaving}
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
            ref={sentencePanel}
            data-brief-layout="sentence"
            aria-busy={leaving}
            className="m-0 text-center text-[34px] leading-[60px] font-light tracking-[-0.02em] lg:text-[56px] lg:leading-[96px]"
          >
            <span key={step}>
              {sentence.map((part, j) =>
                typeof part === 'string' ? (
                  <Fragment key={j}>
                    {part.split(/(\s+)/).map((word, k) => /^\s+$/.test(word) ? word : (
                      <span key={k} className="brief-word" style={{ animationDelay: `${j * 55 + k * 14}ms` }}>{word}</span>
                    ))}
                  </Fragment>
                ) : (
                  <span key={part.key} className="brief-field" style={{ animationDelay: `${j * 55}ms` }}>
                    <Blank
                      label={part.label}
                      value={draft[part.key]}
                      placeholder={part.placeholder}
                      autoFocus={j === 1}
                      onChange={(v) => setDraft({ ...draft, [part.key]: v })}
                      onPick={part.key === 'date' || part.key === 'from' || part.key === 'till'
                        ? () => setScheduleField(part.key as ScheduleField)
                        : undefined}
                    />
                  </span>
                ),
              )}
            </span>
          </div>

          <Button
            type="submit"
            disabled={!complete || leaving}
            data-brief-layout="action"
            className="brief-next w-full gap-3 py-[17px] text-[18px] leading-[22px] font-bold lg:w-auto lg:px-14"
          >
            {last ? 'Find venues' : 'Next'}
            <span aria-hidden="true" className="brief-next-arrow"><ArrowRight /></span>
          </Button>
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
