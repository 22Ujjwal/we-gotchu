import type { Attempt, EventView, PlannedAction } from '../../contracts'

/** Each kind of purchase gets its own kind of paper. */
export type ReceiptStyle = 'thermal' | 'notepad' | 'invoice' | 'card'

export type ReceiptRow = { label: string; amount: string; muted?: boolean }

export type TimelineEntry = {
  /** ISO time; null when the records don't say when it happened. */
  at: string | null
  text: string
  /** Bold words before the text, like "You approved". */
  lead?: string
  dot: 'step' | 'reply' | 'approved' | 'confirmed' | 'failed'
  /** A message sent to (ours) or received from (theirs) the supplier. */
  quote?: { text: string; from: 'ours' | 'theirs' }
  badge?: 'confirmed' | 'pending' | 'failed'
}

export type ReceiptDoc = {
  id: string
  style: ReceiptStyle
  /** What it was for, in the customer's words: "Booking the venue". */
  title: string
  supplier: string
  /** "Venue hire", "Supplies", "Card payment". */
  kind: string
  place: string
  rows: Array<ReceiptRow>
  /** Bare number, "777.60". */
  amount: string
  /** With currency symbol, "€777.60". */
  total: string
  currency: string
  /** Short supplier or payment reference, if there is one. */
  reference: string | null
  /** When it was paid or confirmed (ISO). */
  issuedAt: string | null
  status: 'paid' | 'pending' | 'failed' | 'refunded'
  /** Free-text footer, e.g. what a card payment covered. */
  note?: string
  timeline: Array<TimelineEntry>
}

export type Receipts = {
  occasion: string
  timezone: string
  /** When the event starts (ISO). */
  startsAt: string
  receipts: Array<ReceiptDoc>
}

const formatMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(minor / 100)
const formatAmount = (minor: number) => (minor / 100).toFixed(2)
const shortRef = (ref: string | null) => ref ? ref.replace(/^.*_/, '').slice(-6).toUpperCase() : null
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** "6 Nov 21:14", or just "21:14" when the previous entry was the same day. */
export function timelineTimes(entries: Array<TimelineEntry>, timezone: string) {
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', month: 'short' })
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  let lastDay = ''
  return entries.map((e) => {
    if (!e.at) return ''
    const d = day.format(new Date(e.at))
    const t = time.format(new Date(e.at))
    const label = d === lastDay ? t : `${d} ${t}`
    lastDay = d
    return label
  })
}

export function formatDate(iso: string, timezone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, ...options }).format(new Date(iso))
}

/**
 * One receipt per planned purchase, plus the card payment that covered them.
 * Nothing shows until the customer has approved the plan.
 */
export function receiptsFromView(view: EventView): Receipts {
  const { event, plan, approval, payment, attempts, progress } = view
  const base = { occasion: event.brief.eventType, timezone: event.brief.timezone, startsAt: event.brief.startsAt }
  if (!plan || !approval || approval.planId !== plan.planId) return { ...base, receipts: [] }

  const currency = plan.currency
  const approved = plan.actions.filter((a) => approval.actionIds.includes(a.actionId))
  const covered = approved.map((a) => (a.kind === 'venue_booking' ? 'the venue' : lowerFirst(a.target))).join(' + ')
  const day = formatDate(event.brief.startsAt, event.brief.timezone,
    { weekday: 'short', day: 'numeric', month: 'short' })
  const time = formatDate(event.brief.startsAt, event.brief.timezone,
    { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const startsAt = `${day} at ${time}`

  // The agent's research narrative leads every receipt's story.
  const research: Array<TimelineEntry> = progress
    .filter((p) => p.actor === 'agent' && p.createdAt <= approval.approvedAt)
    .map((p) => ({ at: p.createdAt, text: p.message, dot: 'step' }))
  const approvalEntry: TimelineEntry = {
    at: approval.approvedAt,
    lead: 'You approved',
    text: ` the plan and paid ${formatMoney(approval.approvedTotal, currency)} for ${covered}.`,
    dot: 'approved',
  }

  let items = 0
  const receipts = approved.map((action): ReceiptDoc => {
    const commit = latest(attempts, action.actionId, 'commit')
    const cancel = latest(attempts, action.actionId, 'cancel')
    const total = commit?.actualAmount ?? action.maximumAmount
    const venue = action.kind === 'venue_booking'
    return {
      id: action.actionId,
      style: venue ? 'thermal' : items++ % 2 === 0 ? 'notepad' : 'invoice',
      title: venue ? 'Booking the venue' : `Getting ${lowerFirst(action.target)}`,
      supplier: action.supplierName,
      kind: venue ? 'Venue hire' : 'Supplies',
      place: event.brief.location,
      rows: [
        { label: action.target, amount: formatAmount(total) },
        // A venue's schedule is the raw start time; show it like the rest of the app.
        { label: venue ? startsAt : action.quantityOrSchedule, amount: 'incl.', muted: true },
      ],
      amount: formatAmount(total),
      total: formatMoney(total, currency),
      currency: currency.toUpperCase(),
      reference: shortRef(commit?.providerReference ?? null),
      issuedAt: commit?.state === 'succeeded' ? commit.updatedAt : null,
      status: cancel?.state === 'succeeded' ? 'refunded'
        : commit?.state === 'succeeded' ? 'paid' : commit?.state === 'failed' ? 'failed' : 'pending',
      timeline: [...research, approvalEntry, ...attemptEntries(action, commit, cancel)],
    }
  })

  if (payment && payment.approvalId === approval.approvalId && payment.state === 'paid') {
    const refunded = payment.refundState === 'succeeded'
    receipts.push({
      id: 'payment',
      style: 'card',
      title: 'Paying for it',
      supplier: 'Stripe',
      kind: 'Card payment',
      place: event.brief.location,
      rows: [],
      amount: formatAmount(payment.amount),
      total: formatMoney(payment.amount, payment.currency),
      currency: payment.currency.toUpperCase(),
      reference: shortRef(payment.paymentIntentId),
      issuedAt: approval.approvedAt,
      status: refunded ? 'refunded' : 'paid',
      note: covered.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase()),
      timeline: [
        approvalEntry,
        ...(payment.refundState === 'none' ? [] : [{
          at: null,
          text: refunded ? `Refunded ${formatMoney(payment.amount, payment.currency)}`
            : payment.refundState === 'failed' ? 'The refund failed' : 'Refund requested',
          dot: refunded ? 'confirmed' : payment.refundState === 'failed' ? 'failed' : 'reply',
        } satisfies TimelineEntry]),
      ],
    })
  }
  return { ...base, receipts }
}

function latest(attempts: Array<Attempt>, actionId: string, kind: Attempt['kind']) {
  return attempts
    .filter((a) => a.actionId === actionId && a.kind === kind)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .at(-1)
}

function attemptEntries(action: PlannedAction, commit?: Attempt, cancel?: Attempt): Array<TimelineEntry> {
  const who = action.supplierName
  const entries: Array<TimelineEntry> = []
  if (!commit || ['pending', 'running', 'unknown'].includes(commit.state)) {
    entries.push({ at: commit?.updatedAt ?? null, text: `Waiting for ${who} to confirm`, dot: 'reply', badge: 'pending' })
  } else if (commit.state === 'succeeded') {
    entries.push({
      at: commit.updatedAt,
      text: `${who} confirmed the ${action.kind === 'venue_booking' ? 'booking' : 'order'}`,
      dot: 'confirmed',
      badge: 'confirmed',
      ...(commit.evidence?.confirmation ? { quote: { text: commit.evidence.confirmation, from: 'theirs' as const } } : {}),
    })
  } else if (commit.state === 'failed') {
    entries.push({
      at: commit.updatedAt,
      text: `Couldn't complete this with ${who}`,
      dot: 'failed',
      badge: 'failed',
      ...(commit.errorReason ? { quote: { text: commit.errorReason, from: 'theirs' as const } } : {}),
    })
  }
  if (cancel?.state === 'succeeded') entries.push({ at: cancel.updatedAt, text: `Canceled with ${who}`, dot: 'step' })
  return entries
}

/** Demo receipts for the UI-only local preview. */
export const previewReceipts: Receipts = (() => {
  const research: Array<TimelineEntry> = [
    { at: '2026-11-06T20:14:00Z', text: 'Searched 14 rooftops and lofts in Kreuzberg and Neukölln for 24 guests under €900.', dot: 'step' },
    { at: '2026-11-06T20:16:00Z', text: 'Shortlisted 3. Picked Spreeblick: heated, seats 30, free cancellation.', dot: 'step' },
  ]
  const approved: TimelineEntry = {
    at: '2026-11-07T13:02:00Z',
    lead: 'You approved',
    text: ' the booking and paid €842.60 for venue and candles.',
    dot: 'approved',
  }
  const base = { place: 'Kreuzberg', currency: 'EUR', status: 'paid' as const }
  return {
    occasion: "Franz's 30th birthday",
    timezone: 'Europe/Berlin',
    startsAt: '2026-12-12T18:00:00Z',
    receipts: [
      {
        ...base,
        id: 'venue',
        style: 'thermal',
        title: 'Booking the venue',
        supplier: 'Spreeblick',
        kind: 'Venue hire',
        rows: [
          { label: 'Rooftop, 19–23h', amount: '720.00' },
          { label: 'Heaters, 4 tables', amount: 'incl.', muted: true },
          { label: 'VAT', amount: '57.60' },
        ],
        amount: '777.60',
        total: '€777.60',
        reference: 'SB-2291',
        issuedAt: '2026-11-07T13:02:00Z',
        timeline: [
          ...research,
          {
            at: '2026-11-06T20:18:00Z',
            text: 'Emailed Spreeblick',
            dot: 'step',
            quote: { from: 'ours', text: 'Hi! Is the rooftop free on Sat 12 Dec, 19:00–23:00 for 24 guests? Could you confirm the price and cancellation terms?' },
          },
          {
            at: '2026-11-07T08:40:00Z',
            text: 'Spreeblick replied',
            dot: 'reply',
            quote: { from: 'theirs', text: "Yes, it's free! €720 including heaters and four long tables. Free cancellation until 5 Dec." },
          },
          approved,
          { at: '2026-11-07T13:02:00Z', text: 'Paid Spreeblick €777.60', dot: 'step' },
          { at: '2026-11-07T14:41:00Z', text: 'Spreeblick confirmed the booking', dot: 'confirmed', badge: 'confirmed' },
        ],
      },
      {
        ...base,
        id: 'candles',
        style: 'notepad',
        title: 'Getting the candles',
        supplier: 'Kerzenhaus',
        kind: 'Supplies',
        rows: [
          { label: '24 Kerzen', amount: '52,00' },
          { label: 'Lieferung', amount: '6,90' },
          { label: 'MwSt.', amount: '6,10' },
        ],
        amount: '65,00',
        total: '65,00 €',
        reference: '0187',
        issuedAt: '2026-11-07T13:05:00Z',
        timeline: [
          { at: '2026-11-06T20:20:00Z', text: 'Found beeswax candles at Kerzenhaus with delivery to the venue.', dot: 'step' },
          approved,
          { at: '2026-11-07T13:05:00Z', text: 'Kerzenhaus confirmed the order', dot: 'confirmed', badge: 'confirmed' },
        ],
      },
      {
        ...base,
        id: 'catering',
        style: 'invoice',
        title: 'The catering',
        supplier: 'Spreeblick Kitchen',
        kind: 'Catering',
        rows: [
          { label: 'Vegetarian menu × 24', amount: '288.00' },
          { label: 'Welcome drinks', amount: 'incl.', muted: true },
          { label: 'VAT 8%', amount: '23.04', muted: true },
        ],
        amount: '311.04',
        total: '€311.04',
        reference: '2292',
        issuedAt: '2026-11-07T13:10:00Z',
        timeline: [
          { at: '2026-11-07T09:00:00Z', text: 'Asked Spreeblick Kitchen for a vegetarian menu for 24.', dot: 'step' },
          { at: '2026-11-07T13:10:00Z', text: 'Spreeblick Kitchen confirmed the menu', dot: 'confirmed', badge: 'confirmed' },
        ],
      },
      {
        ...base,
        id: 'payment',
        style: 'card',
        title: 'Paying for it',
        supplier: 'Stripe',
        kind: 'VISA •••• 4242',
        rows: [],
        amount: '842.60',
        total: '€842.60',
        reference: '8F2KQ1',
        issuedAt: '2026-11-07T13:02:00Z',
        note: 'Venue + candles',
        timeline: [approved],
      },
    ],
  }
})()
