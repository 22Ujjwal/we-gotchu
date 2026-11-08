import { ArrangeHeader } from '#/components/arrange/header'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '#/components/hostwell/ui'

// Where an ARRANGE customer starts: one short brief and a clear yes to supplier contact.

export const Route = createFileRoute('/arrange/')({ component: ArrangeStartPage })

const inputClass = 'w-full rounded-lg border border-sage/40 bg-white px-3 py-2 text-[16px] text-ink focus-visible:outline-2 focus-visible:outline-gold'

function ArrangeStartPage() {
  const navigate = useNavigate()
  const [requestKey] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const euros = Number(form.get('budget'))
    const brief = {
      occasion: String(form.get('occasion') ?? '').trim(),
      guests: Number(form.get('guests')),
      city: String(form.get('city') ?? '').trim(),
      date: String(form.get('date') ?? ''),
      time: String(form.get('time') ?? ''),
      budget: { amountMinor: Math.round(euros * 100), currency: 'EUR' },
      notes: String(form.get('notes') ?? '').trim() || undefined,
    }
    try {
      const response = await fetch('/api/arrange/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief, requestKey, contactConsent: form.get('consent') === 'on' }),
      })
      if (!response.ok) {
        if (response.status === 401) throw new Error('Please sign in before sending your brief.')
        const body = await response.json().catch(() => null)
        throw new Error(body?.message ?? 'Something went wrong on our side. Please try again.')
      }
      const { eventId } = await response.json() as { eventId: string }
      void navigate({ to: '/arrange/events/$eventId', params: { eventId } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong on our side. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ArrangeHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pt-10 pb-12">
        <h1 className="font-display text-[28px] leading-8 text-ink">Tell us about your event</h1>
        <p className="mt-2 text-[16px] leading-6 text-body">
          A few lines are enough. We'll take it from there: talk to the right people, chase the replies, and keep you posted.
        </p>
        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold text-ink">What are you planning?</span>
            <input name="occasion" required placeholder="Team dinner, offsite, birthday..." className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[14px] font-semibold text-ink">Guests</span>
              <input name="guests" type="number" min={1} max={2000} required placeholder="25" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[14px] font-semibold text-ink">City</span>
              <input name="city" required placeholder="Berlin" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[14px] font-semibold text-ink">Date</span>
              <input name="date" type="date" required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[14px] font-semibold text-ink">Start time</span>
              <input name="time" type="time" required className={inputClass} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold text-ink">Budget (EUR , total)</span>
            <input name="budget" type="number" min={1} step="0.01" required placeholder="2500" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold text-ink">Anything else we should know? <span className="font-normal text-body">(optional)</span></span>
            <textarea name="notes" rows={3} placeholder="Food preferences, a neighbourhood you love, a firm end time..." className={inputClass} />
          </label>
          <label className="flex items-start gap-3 rounded-lg bg-cream px-4 py-3">
            <input name="consent" type="checkbox" className="mt-1" />
            <span className="text-[14px] leading-5 text-body">
              ARRANGE may email venues and suppliers on my behalf about this event. Nothing is ever booked without me.
            </span>
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-800">{error}</p>}
          {error?.includes('sign in') && <a href="/sign-in?redirect_url=%2Farrange" className="text-sm underline">Sign in to continue</a>}
          <Button type="submit" disabled={busy} className="mt-2 rounded-full px-6 py-3">
            {busy ? 'One moment...' : 'Hand it over'}
          </Button>
        </form>
      </main>
    </div>
  )
}
