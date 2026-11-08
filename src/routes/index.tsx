import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Fragment, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Header } from '#/components/hostwell/ui'
import type { Brief } from '#/lib/hostwell/fixture'
import { useHostwell } from '#/lib/hostwell/store'

export const Route = createFileRoute('/')({ component: BriefPage })

type Key = keyof Brief
/** A sentence is text interleaved with blanks: [text, key, text, key, …, text]. */
type Sentence = Array<string | { key: Key; label: string; optional?: boolean; placeholder?: string }>

const sentences: Array<Sentence> = [
  ["I'm planning ", { key: 'occasion', label: 'Occasion', placeholder: 'Franz’s 30th birthday' }, ' for ', { key: 'guests', label: 'Number of guests', placeholder: '24' }, ' people.'],
  ["It's on ", { key: 'date', label: 'Date', placeholder: 'Sat 12 Dec' }, ' from ', { key: 'from', label: 'Start time', placeholder: '7pm' }, ' till ', { key: 'till', label: 'End time', placeholder: '11pm' }, ', in ', { key: 'area', label: 'Area', placeholder: 'Kreuzberg or Neukölln' }, '.'],
  ["I'll spend up to ", { key: 'budget', label: 'Budget', placeholder: '€900' }, ', and can lose ', { key: 'canLose', label: 'Acceptable cancellation loss', placeholder: '€10' }, ' if plans change.'],
  ["We'll need ", { key: 'needs', label: 'What you need', placeholder: 'table candles' }, ', and the vibe should be ', { key: 'vibe', label: 'Vibe', optional: true, placeholder: 'cosy? fancy?' }],
]

function BriefPage() {
  const { brief, setBrief } = useHostwell()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(brief)
  const [step, setStep] = useState(0)

  const sentence = sentences[step]
  const last = step === sentences.length - 1
  const complete = sentence.every(
    (part) => typeof part === 'string' || part.optional || draft[part.key].trim(),
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!complete) return
    setBrief(draft)
    if (last) navigate({ to: '/settings' })
    else setStep(step + 1)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header step="brief" />
      <main className="flex flex-1 flex-col items-center justify-center px-5 pt-10 pb-8 lg:px-12">
        <form
          onSubmit={submit}
          className="flex w-full max-w-[900px] flex-col items-center gap-9 lg:gap-12"
        >
          {step > 0 && (
            <ol aria-label="Your brief so far" className="m-0 flex list-none flex-col items-center gap-2 p-0 lg:gap-1.5">
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

          <p
            key={step}
            className="rise m-0 text-center text-[34px] leading-[60px] font-light tracking-[-0.02em] lg:text-[56px] lg:leading-[96px]"
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
                />
              ),
            )}
          </p>

          <Button
            type="submit"
            disabled={!complete}
            className="w-full py-[17px] text-[18px] leading-[22px] font-bold lg:w-auto lg:px-14"
          >
            {last ? 'Find venues' : 'Next'}
          </Button>
        </form>
      </main>
    </div>
  )
}

function Blank({
  label,
  value,
  placeholder,
  autoFocus,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  autoFocus?: boolean
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const field = ref.current
    if (!field) return
    // Keep React out of the editable DOM so typing never resets the caret.
    if (field.textContent !== value) field.textContent = value
  }, [value])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

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
      onClick={(e) => e.currentTarget.focus()}
      onInput={(e) => {
        const field = e.currentTarget
        const text = field.textContent ?? ''
        if (!text) field.replaceChildren()
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
