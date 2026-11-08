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
  ["I'm planning ", { key: 'occasion', label: 'Occasion' }, ' for ', { key: 'guests', label: 'Number of guests' }, ' people.'],
  ["It's on ", { key: 'date', label: 'Date' }, ' from ', { key: 'from', label: 'Start time' }, ' till ', { key: 'till', label: 'End time' }, ', in ', { key: 'area', label: 'Area' }, '.'],
  ["I'll spend up to ", { key: 'budget', label: 'Budget' }, ', and can lose ', { key: 'canLose', label: 'Acceptable cancellation loss' }, ' if plans change.'],
  ["We'll need ", { key: 'needs', label: 'What you need' }, ', and the vibe should be ', { key: 'vibe', label: 'Vibe', optional: true, placeholder: 'cosy? fancy?' }],
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
      <main className="flex flex-1 flex-col items-center justify-center px-6 pt-10 pb-8 md:px-12">
        <form
          onSubmit={submit}
          className="flex w-full max-w-[900px] flex-col items-center gap-12"
        >
          {step > 0 && (
            <ol aria-label="Your brief so far" className="flex flex-col items-center gap-1.5">
              {sentences.slice(0, step).map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    className="cursor-pointer text-center text-[18px] leading-[30px] text-stone hover:text-ink md:text-[22px] md:leading-[38px]"
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
            className="rise m-0 text-center text-[30px] leading-[56px] font-light tracking-[-0.02em] md:text-[56px] md:leading-[96px]"
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
            className="px-14 py-[17px] text-[18px] leading-[22px] font-bold"
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
  // A contentEditable span (not an <input>) so long answers wrap inside the
  // sentence like the design. It's uncontrolled: we seed the text once and
  // report edits upward.
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.textContent = value
    if (autoFocus) {
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      getSelection()?.removeAllRanges()
      getSelection()?.addRange(range)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span
      ref={ref}
      role="textbox"
      aria-label={label}
      tabIndex={0}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={(e) => onChange(e.currentTarget.textContent ?? '')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.closest('form')?.requestSubmit()
        }
      }}
      className={`blank mx-1 font-script text-[28px] font-normal tracking-[-0.02em] underline decoration-1 underline-offset-[0.12em] outline-none [text-decoration-skip-ink:none] md:text-[54px] ${value ? 'decoration-sand' : 'decoration-ink'}`}
    />
  )
}
