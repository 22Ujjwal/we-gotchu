import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Button, Header } from '#/components/hostwell/ui'
import type { CustomerEventView } from '#/server/arrange/customer-view'

// The customer's event page: the derived stage, a plain-language timeline,
// the suppliers we're talking to and every recorded term with its evidence.

export const Route = createFileRoute('/arrange/events/$eventId')({ component: ArrangeEventPage })

const STAGE_LABEL: Record<CustomerEventView['stage'], string> = {
  getting_started: 'Getting started',
  contacting_suppliers: 'Talking to suppliers',
  supplier_replied: 'A reply is in',
  negotiating: 'Working out the details',
}

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amountMinor / 100)
}

function ArrangeEventPage() {
  const { eventId } = Route.useParams()
  const [view, setView] = useState<CustomerEventView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/arrange/events/${eventId}`)
      if (!response.ok) throw new Error(response.status === 404 ? 'We could not find that event.' : 'Something went wrong on our side.')
      setView(await response.json() as CustomerEventView)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong on our side.')
    }
  }, [eventId])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 15_000)
    return () => clearInterval(timer)
  }, [load])

  return (
    <div className="flex min-h-screen flex-col">
      <Header step="party" />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pt-10 pb-12">
        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-800">{error}</p>}
        {!view && !error && <p className="text-body">One moment…</p>}
        {view && (
          <>
            <p className="text-[13px] font-semibold tracking-wide text-sage uppercase">{STAGE_LABEL[view.stage]}</p>
            <h1 className="mt-1 font-display text-[28px] leading-8 text-ink">{view.brief.occasion} in {view.brief.city}</h1>
            <p className="mt-1 text-[14px] text-body">
              {view.brief.guests} guests · {new Date(`${view.brief.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} at {view.brief.time} · budget {money(view.brief.budget.amountMinor, view.brief.budget.currency)}
            </p>
            <p className="mt-4 rounded-lg bg-cream px-4 py-3 text-[16px] leading-6 text-ink">{view.headline}</p>

            <section className="mt-8">
              <h2 className="text-[16px] font-semibold text-ink">What's happened so far</h2>
              {view.activity.length === 0 && <p className="mt-2 text-[14px] text-body">We've received your brief and are getting started.</p>}
              <ol className="mt-2 flex flex-col gap-2">
                {view.activity.map((item, index) => (
                  <li key={index} className="flex flex-col rounded-lg border border-sage/30 px-4 py-2">
                    <span className="text-[14px] leading-5 text-ink">{item.text}</span>
                    <span className="text-[12px] text-body">{new Date(item.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ol>
            </section>

            {view.terms.length > 0 && (
              <section className="mt-8">
                <h2 className="text-[16px] font-semibold text-ink">What suppliers have told us</h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {view.terms.map((term, index) => (
                    <li key={index} className="rounded-lg border border-sage/30 px-4 py-2">
                      <p className="text-[14px] font-semibold text-ink">
                        {term.term.replaceAll('_', ' ')}
                        {term.amountMinor !== null && term.currency ? ` — ${money(term.amountMinor, term.currency)}` : ''}
                        <span className="font-normal text-body"> · {term.supplier}</span>
                      </p>
                      {term.note && <p className="text-[13px] text-body">{term.note}</p>}
                      <p className="mt-1 text-[12px] text-body italic">“{term.excerpt}”</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-8">
              <h2 className="text-[16px] font-semibold text-ink">Who we're talking to</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {view.contacts.map(contact => (
                  <li key={contact.id} className="flex items-center justify-between rounded-lg border border-sage/30 px-4 py-2 text-[14px] text-ink">
                    <span>{contact.name} <span className="text-body">({contact.kind})</span></span>
                    <span className="text-body">
                      {contact.replies > 0 ? 'Replied' : contact.emailsSent > 0 ? 'Waiting to hear back' : 'Not contacted yet'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <Button onClick={() => void load()} className="mt-8 self-start rounded-full px-5 py-2 text-[14px]">Check for news</Button>
          </>
        )}
      </main>
    </div>
  )
}
