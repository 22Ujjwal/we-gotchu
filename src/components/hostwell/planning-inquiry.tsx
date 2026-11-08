import { useEffect, useState } from 'react'
import type { PlanningCommand, PlanningInquiry, PlanningView } from '../../agent/planning/contract'
import { Button } from './ui'

const fields = (inquiry: PlanningInquiry) => ({ recipient: inquiry.recipient, subject: inquiry.subject, text: inquiry.text, revision: inquiry.revision })

export function PlanningInquiryEditor({ inquiry, version, disabled, submit }: {
  inquiry: PlanningInquiry
  version: number
  disabled: boolean
  submit: (command: PlanningCommand) => Promise<PlanningView | null>
}) {
  const [draft, setDraft] = useState(() => fields(inquiry))
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    // A background refresh must not replace text the customer is editing.
    if (!dirty) setDraft(fields(inquiry))
  }, [inquiry, dirty])
  const conflict = draft.revision !== inquiry.revision
  const stale = inquiry.status === 'stale'
  const fieldClass = 'w-full border border-sand bg-transparent p-3 text-[17px] focus-visible:outline-2 focus-visible:outline-gold'
  function edit(field: 'recipient' | 'subject' | 'text', value: string) {
    setDraft(previous => ({ ...previous, [field]: value }))
    setDirty(true)
    setSaved(false)
  }
  async function save() {
    if (disabled || stale || conflict || !dirty) return
    const next = await submit({ kind: 'save_inquiry', requestId: crypto.randomUUID(), expectedVersion: version,
      inquiryId: inquiry.id, expectedDraftRevision: draft.revision,
      recipient: draft.recipient.trim(), subject: draft.subject.trim(), text: draft.text.trim() })
    if (next?.inquiry) {
      setDraft(fields(next.inquiry))
      setDirty(false)
      setSaved(true)
    }
  }
  return <section aria-label="Venue inquiry" className="flex flex-col gap-4 border border-sand p-5">
    <h2 className="text-[26px] font-light">Ask {inquiry.venue.name}</h2>
    <p className="text-stone">Review the event details and edit this draft. Email sending is not connected yet.</p>
    {stale && <p role="alert">Your venue or conversation changed. This draft is out of date. Prepare a new draft before continuing.</p>}
    {conflict && <div className="flex flex-col gap-3">
      <p role="alert">Another update changed the saved draft. Your edits are kept below. Copy anything you want to keep before loading the saved draft.</p>
      <details><summary className="cursor-pointer underline">Review the saved draft</summary>
        <p>{inquiry.recipient}</p><p>{inquiry.subject}</p><p className="whitespace-pre-wrap">{inquiry.text}</p>
      </details>
      <Button className="self-start px-5 py-3" disabled={disabled} onClick={() => { setDirty(false); setDraft(fields(inquiry)); setSaved(false) }}>Load saved draft and discard my edits</Button>
    </div>}
    {inquiry.contactSourceUrl
      ? <a href={inquiry.contactSourceUrl} target="_blank" rel="noreferrer" className="underline">Published contact source</a>
      : <p className="text-stone">{inquiry.recipient ? 'This address was entered manually. Confirm it belongs to the venue before sending.' : 'No published email address was found in the saved evidence. Add a verified venue address, or save the draft without one.'}</p>}
    <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void save() }}>
      <label className="flex flex-col gap-2">Venue email
        <input type="email" value={draft.recipient} maxLength={320} readOnly={disabled || stale}
          onChange={event => edit('recipient', event.target.value)} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-2">Inquiry subject
        <input value={draft.subject} required maxLength={200} readOnly={disabled || stale}
          onChange={event => edit('subject', event.target.value)} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-2">Inquiry message
        <textarea rows={12} value={draft.text} required maxLength={60000} readOnly={disabled || stale}
          onChange={event => edit('text', event.target.value)} className={fieldClass} />
      </label>
      <Button type="submit" className="self-start px-5 py-3" disabled={disabled || stale || conflict || !dirty || !draft.subject.trim() || !draft.text.trim()}>Save inquiry draft</Button>
      {saved && <p role="status">Draft saved. Nothing has been sent.</p>}
    </form>
  </section>
}
