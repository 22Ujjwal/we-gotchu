import { Fragment, useEffect, useRef, useState } from 'react'
import type { Brief } from '../../contracts'
import { briefFromDraft, type BriefDraft } from '../../lib/hostwell/brief-adapter'
import { Button } from './ui'

type Field = { key: keyof BriefDraft; label: string; placeholder: string; optional?: boolean }
type Sentence = Array<string | Field>
const sentences: Sentence[] = [
  ["I'm planning ", { key: 'occasion', label: 'Occasion', placeholder: 'Birthday' }, ' for ', { key: 'guests', label: 'Number of guests', placeholder: '24' }, ' people.'],
  ["It's on ", { key: 'date', label: 'Date', placeholder: '2026-12-12' }, ' at ', { key: 'from', label: 'Start time', placeholder: '19:00+01:00' }, ' in timezone ', { key: 'timezone', label: 'Timezone', placeholder: 'Europe/Berlin' }, ', near ', { key: 'area', label: 'Area', placeholder: 'Berlin' }, '.'],
  ["I'll spend up to ", { key: 'budget', label: 'Budget', placeholder: '900.00' }, ' in ', { key: 'currency', label: 'Currency', placeholder: 'EUR' }, ', and can lose ', { key: 'canLose', label: 'Acceptable cancellation loss', placeholder: '10.00' }, ' if plans change.'],
  ["We'll need ", { key: 'needs', label: 'What you need', placeholder: 'candles, paper plates', optional: true }, '.'],
]

export function BriefForm({ initial, onSubmit, pending = false, disabled = false, submitLabel = 'Find venues', edit = false }: {
  initial: BriefDraft; onSubmit: (brief: Brief) => Promise<void>; pending?: boolean; disabled?: boolean;
  submitLabel?: string; edit?: boolean;
}) {
  const [draft, setDraft] = useState(initial)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)
  const submitting = useRef(false)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  const sentence = sentences[step]
  const complete = sentence.every(part => typeof part === 'string' || part.optional || draft[part.key].trim())
  const last = edit || step === sentences.length - 1
  const renderSentence = (parts: Sentence) => parts.map((part, j) => typeof part === 'string'
    ? <Fragment key={j}>{part}</Fragment>
    : <input key={part.key} type="text" aria-label={part.label} value={draft[part.key]} placeholder={part.placeholder}
        autoComplete="off" disabled={pending || disabled}
        onChange={e => setDraft({ ...draft, [part.key]: e.currentTarget.value })}
        style={{ width: `${Math.max((draft[part.key] || part.placeholder).length, 3)}ch` }}
        className={`blank mx-1 max-w-full min-w-[3ch] border-0 bg-transparent p-0 font-script text-[34px] font-normal tracking-[-0.02em] underline decoration-1 underline-offset-[0.12em] outline-none placeholder:text-faint [text-decoration-skip-ink:none] lg:text-[54px] ${draft[part.key] ? 'decoration-sand' : 'decoration-ink'}`} />)
  return <form className="flex w-full max-w-[900px] flex-col items-center gap-9 lg:gap-12" onSubmit={async e => {
    e.preventDefault()
    if (pending || disabled || submitting.current || !complete && !edit) return
    if (!last) { setStep(step + 1); return }
    submitting.current = true
    setError('')
    try { await onSubmit(briefFromDraft(draft)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the brief. Your answers are retained.') }
    finally { submitting.current = false }
  }}>
    {!edit && step > 0 && <ol aria-label="Your brief so far" className="m-0 flex list-none flex-col items-center gap-2 p-0 lg:gap-1.5">
      {sentences.slice(0, step).map((s, i) => <li key={i}><button type="button" onClick={() => setStep(i)}
        className="cursor-pointer text-center text-[16px] leading-[26px] text-stone hover:text-ink lg:text-[22px] lg:leading-[38px]">
        {s.map((part, j) => <Fragment key={j}>{typeof part === 'string' ? part : draft[part.key]}</Fragment>)}
      </button></li>)}
    </ol>}
    {(edit ? sentences : [sentence]).map((s, i) => <p key={edit ? i : step}
      className="rise m-0 text-center text-[34px] leading-[60px] font-light tracking-[-0.02em] lg:text-[56px] lg:leading-[96px]">{renderSentence(s)}</p>)}
    <p className="text-[14px] leading-[18px] text-stone">Use YYYY-MM-DD, a time with UTC offset, and the event timezone. Amounts use the currency code you enter. Separate supplies with commas; leave blank if none.</p>
    {error && <p ref={errorRef} tabIndex={-1} role="alert" className="text-[16px] leading-6 text-body">{error}</p>}
    <Button type="submit" disabled={pending || disabled || !edit && !complete}
      className="w-full py-[17px] text-[18px] leading-[22px] font-bold lg:w-auto lg:px-14">
      {pending ? 'Saving...' : last ? submitLabel : 'Next'}
    </Button>
  </form>
}
