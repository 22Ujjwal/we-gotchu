import { assessPlanForApproval } from '../../contracts'
import { Brief, type EventView } from '../../contracts'
import { to24h } from './fixture'
import type { Brief as PreviewBrief, Feature, ReceiptLine, Venue } from './fixture'
import type { Order } from './store'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const dollars = (value: string) => Number(value.replace(/[$,\s]/g, ''))
const cents = (value: string) => Math.round(dollars(value) * 100)
const fromCents = (amount: number) => String(Math.round(amount) / 100)

/**
 * Turns the fill-in-the-gaps brief into the shared contract. The event is
 * assumed to happen in the browser's timezone and to be paid in dollars.
 */
export function briefFromPreview(b: PreviewBrief): Brief {
  const date = b.date.match(/(\d{1,2})\s+(\w{3})\w*\s+(\d{4})/)
  const month = date ? MONTHS.indexOf(date[2].toLowerCase()) : -1
  const time = to24h(b.from).match(/^(\d{2}):(\d{2})$/)
  if (!date || month < 0 || !time) throw new Error('Pick a date and a start time.')
  const startsAt = new Date(Number(date[3]), month, Number(date[1]), Number(time[1]), Number(time[2]))

  const brief = Brief.safeParse({
    eventType: b.occasion.trim(),
    location: b.area.trim(),
    startsAt: startsAt.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    headcount: Number(b.guests.trim()),
    budget: cents(b.budget),
    currency: 'usd',
    supplyNeeds: b.needs.split(/,|\band\b/).map((v) => v.trim()).filter(Boolean),
    maximumCancellationLoss: cents(b.canLose),
  })
  if (brief.success) return brief.data
  const field = String(brief.error.issues[0]?.path[0] ?? '')
  throw new Error(
    field === 'headcount' ? 'Enter the number of guests as a whole number.'
      : field === 'budget' || field === 'maximumCancellationLoss' ? 'Enter amounts in dollars, like 900.'
        : 'Check your brief and try again.',
  )
}

/** The saved brief in the same words the brief screen uses. */
export function previewFromBrief(brief: Brief): PreviewBrief {
  const at = new Date(brief.startsAt)
  const zone = { timeZone: brief.timezone }
  const date = new Intl.DateTimeFormat('en-GB', { ...zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .format(at).replace(',', '')
  const [hour, minute] = new Intl.DateTimeFormat('en-GB', { ...zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(at).split(':').map(Number)
  return {
    occasion: brief.eventType,
    guests: String(brief.headcount),
    date,
    from: `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour >= 12 ? 'pm' : 'am'}`,
    till: '',
    area: brief.location,
    budget: fromCents(brief.budget),
    canLose: fromCents(brief.maximumCancellationLoss),
    needs: brief.supplyNeeds.join(', '),
    vibe: '',
  }
}

export type Settings = {
  brief: PreviewBrief
  venues: Array<Venue>
  /** Venue the plan books, if a plan is ready. */
  planned: Venue | null
  order: (venue: Venue) => Order
  approvable: boolean
}

/** Shapes research results and the current plan like the preview's venues and receipt. */
export function settingsFromView(view: EventView): Settings {
  const { event, plan, payment, researchResult: result } = view
  const brief = previewFromBrief(event.brief)
  const current = result && !result.superseded && result.eventId === event.eventId &&
    result.briefRevision === event.briefRevision ? result : null
  const currentPlan = plan && plan.eventId === event.eventId && plan.briefRevision === event.briefRevision &&
    plan.revision === event.planRevision ? plan : null
  const rank = (id: string) => current?.recommendations.find((r) => r.candidateId === id)?.rank ?? Infinity
  const candidates = (current?.candidates ?? [])
    .filter((c) => c.kind === 'venue')
    .sort((a, b) => rank(a.candidateId) - rank(b.candidateId))
  // The recommended supply (candles, flowers…) is bought whichever venue is
  // chosen, so every venue's price includes it.
  const supply = (current?.candidates ?? [])
    .filter((c) => c.kind === 'supply' && c.priceEstimate !== null)
    .sort((a, b) => rank(a.candidateId) - rank(b.candidateId))[0]
  const supplyLine: ReceiptLine | null = supply
    ? { qty: 1, item: supply.name, amount: supply.priceEstimate! / 100 }
    : null
  const extras = supplyLine ? (supplyLine.amount as number) : 0

  const venues = candidates.map((c): Venue => {
    const inPlan = !!currentPlan?.selectedCandidateIds.includes(c.candidateId)
    const features: Array<Feature> = [
      { icon: 'guests', label: `${event.brief.headcount} guests` },
      ...(c.cancellationTerms.known && c.cancellationTerms.summary
        ? [{ icon: 'calendar' as const, label: c.cancellationTerms.summary }] : []),
    ]
    return {
      id: c.candidateId,
      name: c.name,
      neighbourhood: event.brief.location,
      photo: '',
      photos: [],
      total: inPlan ? currentPlan!.total / 100 : c.priceEstimate === null ? null : c.priceEstimate / 100 + extras,
      cardFeatures: features,
      description: c.whyChosenOrRejected,
      detailFeatures: features,
      venueLine: { qty: 1, item: c.name, amount: c.priceEstimate === null ? 'quote' : c.priceEstimate / 100 },
      vat: 0,
      freeCancellationUntil: '',
    }
  })

  const order = (venue: Venue): Order => {
    if (currentPlan?.selectedCandidateIds.includes(venue.id)) {
      const lines = currentPlan.actions.map((a): ReceiptLine => ({
        qty: 1, item: a.supplierName, amount: a.maximumAmount / 100, notes: [a.quantityOrSchedule],
      }))
      const total = currentPlan.total / 100
      return { lines, requests: [], subtotal: total, vat: null, total }
    }
    const lines = supplyLine ? [venue.venueLine, supplyLine] : [venue.venueLine]
    const total = lines.reduce((s, l) => s + (typeof l.amount === 'number' ? l.amount : 0), 0)
    return { lines, requests: [], subtotal: total, vat: null, total }
  }

  const approvable = !!currentPlan && assessPlanForApproval(currentPlan).ok && !event.cancelRequestedAt &&
    ['plan_ready', 'awaiting_payment'].includes(event.status) && payment?.state !== 'paid'

  return {
    brief,
    venues,
    planned: venues.find((v) => currentPlan?.selectedCandidateIds.includes(v.id)) ?? null,
    order,
    approvable,
  }
}
