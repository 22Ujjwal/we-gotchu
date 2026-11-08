import { Link, Navigate, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrangingView } from '#/components/hostwell/arranging-view'
import { PartyView } from '#/components/hostwell/party-view'
import { Header } from '#/components/hostwell/ui'
import { briefFromPreview } from '#/lib/hostwell/brief-adapter'
import { to24h } from '#/lib/hostwell/fixture'
import type { Brief } from '#/lib/hostwell/fixture'
import { buildOrder, findVenue, useHostwell } from '#/lib/hostwell/store'
import { localPreview } from '#/lib/local-preview'

export const Route = createFileRoute('/party')({
  // Right after Arrange, the preview first shows the "we're on it" screen.
  validateSearch: (search: Record<string, unknown>): { arranging?: boolean } =>
    search.arranging === true || search.arranging === 'true' ? { arranging: true } : {},
  component: PartyPage,
})

const exampleBrief: Brief = {
  occasion: 'Franz’s 30th birthday',
  guests: '24',
  date: 'Sat 12 Dec 2026',
  from: '7pm',
  till: '11pm',
  area: 'Kreuzberg',
  budget: '900',
  canLose: '200',
  needs: '',
  vibe: '',
}

function PartyPage() {
  return localPreview ? <PreviewPartyPage /> : <Navigate to="/" />
}

function PreviewPartyPage() {
  const { brief: typed, addOns, selected, bookedVenueId, ready } = useHostwell()
  // Fields left blank in the demo fall back to the brief's placeholder example.
  const brief = Object.fromEntries(
    Object.entries(typed).map(([k, v]) => [k, v.trim() || exampleBrief[k as keyof Brief]]),
  ) as Brief
  const venue = bookedVenueId ? findVenue(bookedVenueId) : undefined
  const { arranging } = Route.useSearch()
  const [emailTo, setEmailTo] = useState<string | null>(null)
  // Arrange sends the "Your quotes are in" email; the page itself stays put.
  useEffect(() => {
    if (!arranging || !venue) return
    const order = buildOrder(venue, addOns, selected)
    const cents = (n: number) => Math.round(n * 100)
    let contractBrief
    try {
      contractBrief = briefFromPreview(brief)
    } catch {
      return
    }
    // One key per booking, so a reload or a double effect never emails twice.
    const key = sessionStorage.getItem('demo-quotes-key') ?? crypto.randomUUID()
    sessionStorage.setItem('demo-quotes-key', key)
    let live = true
    fetch('/api/demo/quotes-ready', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key,
        brief: contractBrief,
        items: [
          ...order.lines.map((l) => ({
            name: l.item,
            amount: typeof l.amount === 'number' ? cents(l.amount) : 0,
          })),
          { name: 'VAT', amount: cents(order.vat ?? 0) },
        ],
        total: cents(order.total),
      }),
    })
      .then((r) => r.json())
      .then((r: { to?: string | null }) => live && r.to && setEmailTo(r.to))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [arranging, venue, addOns, selected, typed])

  if (!ready) return null
  if (!venue) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header step="party" />
        <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <p className="m-0 font-script text-[40px] leading-14">Nothing booked yet</p>
          <Link to="/settings" className="text-[17px] font-semibold underline">
            Pick a setting
          </Link>
        </main>
      </div>
    )
  }

  if (arranging) {
    const when = [brief.date, [brief.from, brief.till].filter(Boolean).map(to24h).join('–')]
      .filter(Boolean)
      .join(', ')
    return (
      <ArrangingView
        email={emailTo}
        items={[
          { label: 'Venue', title: venue.name, detail: when },
          ...addOns
            .filter((a) => selected.has(a.id))
            .map((a) => ({ label: 'Extras', title: a.label })),
        ]}
      />
    )
  }

  const extras = [
    selected.has('candles') && 'Candles on the table',
    ...addOns
      .filter((a) => a.id !== 'candles' && selected.has(a.id))
      .map((a) => a.label),
  ].filter((e): e is string => !!e)
  return (
    <PartyView
      brief={brief}
      venue={venue}
      order={buildOrder(venue, addOns, selected)}
      extras={extras}
      place={`${venue.neighbourhood}, Berlin`}
      timezone="Europe/Berlin"
      receiptsHref="/receipts"
    />
  )
}
