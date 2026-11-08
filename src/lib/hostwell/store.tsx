import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  VAT_RATE,
  addOns as catalogue,
  baseLines,
  defaultBrief,
  venues,
} from './fixture'
import type { AddOn, Brief, ReceiptLine, Venue } from './fixture'
import { localPreview } from '#/lib/local-preview'

type State = {
  brief: Brief
  setBrief: (b: Brief) => void
  addOns: Array<AddOn>
  selected: Set<string>
  toggleAddOn: (id: string) => void
  addRequest: (label: string) => void
  bookedVenueId: string | null
  setBookedVenueId: (id: string) => void
  /** False until the demo has restored its saved state on this tab. */
  ready: boolean
}

// The demo keeps its choices in this browser, so a link from the demo email
// opens the same booking in a new tab.
const demoKey = 'arrange:demo'
type Saved = { brief: Brief; addOns: Array<AddOn>; selected: Array<string>; bookedVenueId: string | null }

const Ctx = createContext<State | null>(null)

export function HostwellProvider({ children }: { children: ReactNode }) {
  const [brief, setBrief] = useState(defaultBrief)
  const [addOns, setAddOns] = useState(catalogue)
  const [selected, setSelected] = useState(
    () => new Set<string>(),
  )
  const [bookedVenueId, setBookedVenueId] = useState<string | null>(null)
  const [ready, setReady] = useState(!localPreview)

  useEffect(() => {
    if (!localPreview) return
    try {
      const saved = JSON.parse(localStorage.getItem(demoKey) ?? 'null') as Saved | null
      if (saved) {
        setBrief(saved.brief)
        setAddOns(saved.addOns)
        setSelected(new Set(saved.selected))
        setBookedVenueId(saved.bookedVenueId)
      }
    } catch {
      localStorage.removeItem(demoKey)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!localPreview || !ready) return
    const saved: Saved = { brief, addOns, selected: [...selected], bookedVenueId }
    localStorage.setItem(demoKey, JSON.stringify(saved))
  }, [ready, brief, addOns, selected, bookedVenueId])

  const value = useMemo<State>(
    () => ({
      brief,
      setBrief,
      addOns,
      selected,
      toggleAddOn: (id) =>
        setSelected((prev) => {
          const next = new Set(prev)
          next.has(id) ? next.delete(id) : next.add(id)
          return next
        }),
      addRequest: (label) => {
        const id = `request-${Date.now()}`
        setAddOns((prev) => [...prev, { id, label, price: null }])
        setSelected((prev) => new Set(prev).add(id))
      },
      bookedVenueId,
      setBookedVenueId,
      ready,
    }),
    [brief, addOns, selected, bookedVenueId, ready],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useHostwell() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useHostwell must be used inside HostwellProvider')
  return ctx
}

export function findVenue(id: string) {
  return venues.find((v) => v.id === id)
}

const round = (n: number) => Math.round(n * 100) / 100

export type Order = {
  lines: Array<ReceiptLine>
  requests: Array<string>
  subtotal: number | null
  /** Null when the amounts already include tax. */
  vat: number | null
  total: number | null
}

/**
 * Builds the receipt for a venue plus the selected add-ons. Candles are part
 * of every quote; other add-ons are shown gross so the "+$" next to each one
 * is exactly what it adds to the total.
 */
export function buildOrder(
  venue: Venue,
  addOns: Array<AddOn>,
  selected: Set<string>,
): Order & { subtotal: number; total: number } {
  const lines: Array<ReceiptLine> = [venue.venueLine]
  let vat = venue.vat
  if (selected.has('candles')) lines.push(...baseLines)

  const requests: Array<string> = []
  for (const a of addOns) {
    if (a.id === 'candles' || !selected.has(a.id)) continue
    if (a.price === null) {
      requests.push(a.label)
      continue
    }
    const net = round(a.price / (1 + VAT_RATE))
    vat = round(vat + a.price - net)
    lines.push({ qty: 1, item: a.label, amount: net })
  }

  const subtotal = round(
    lines.reduce((s, l) => s + (typeof l.amount === 'number' ? l.amount : 0), 0),
  )
  return { lines, requests, subtotal, vat, total: round(subtotal + vat) }
}
