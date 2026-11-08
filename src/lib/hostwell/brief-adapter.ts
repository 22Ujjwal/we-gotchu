import { Brief } from '../../contracts'

export const emptyDraft = {
  occasion: '', guests: '', date: '', from: '', timezone: '', area: '',
  budget: '', currency: '', canLose: '', needs: '',
}
export type BriefDraft = typeof emptyDraft

function currencyDigits(currency: string) {
  if (!Intl.supportedValuesOf('currency').includes(currency.toUpperCase())) {
    throw new Error('Enter a supported three-letter currency code, such as EUR or USD.')
  }
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

function minor(value: string, currency: string, label: string) {
  const digits = currencyDigits(currency)
  const pattern = digits ? new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`) : /^\d+$/
  if (!pattern.test(value.trim())) throw new Error(`${label} must be a nonnegative amount with at most ${digits} decimal places and no currency symbol.`)
  const amount = Math.round(Number(value) * 10 ** digits)
  if (!Number.isSafeInteger(amount)) throw new Error(`${label} is too large.`)
  return amount
}

function localParts(date: Date, timezone: string) {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date)
  } catch { throw new Error('Enter a valid timezone, such as Europe/Berlin or America/Los_Angeles.') }
  const get = (key: string) => parts.find(p => p.type === key)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}:${get('second')}` }
}

export function briefFromDraft(draft: BriefDraft): Brief {
  const currency = draft.currency.trim().toLowerCase()
  currencyDigits(currency)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !/^\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(draft.from)) {
    throw new Error('Use a date with a year, YYYY-MM-DD, and a start time with an explicit UTC offset, such as 19:00+01:00.')
  }
  if (!draft.timezone.trim()) throw new Error('Enter the event timezone.')
  const instant = new Date(`${draft.date}T${draft.from}`)
  if (!Number.isFinite(instant.getTime())) throw new Error('Enter a valid date and start time.')
  const local = localParts(instant, draft.timezone.trim())
  if (local.date !== draft.date || local.time.slice(0, 5) !== draft.from.slice(0, 5)) {
    throw new Error('The date or UTC offset does not match the event timezone. Check daylight saving time.')
  }
  if (!/^\d+$/.test(draft.guests.trim()) || Number(draft.guests) < 1 || !Number.isSafeInteger(Number(draft.guests))) {
    throw new Error('Enter a positive whole number of guests.')
  }
  const brief = {
    eventType: draft.occasion.trim(), location: draft.area.trim(), startsAt: instant.toISOString(),
    timezone: draft.timezone.trim(), headcount: Number(draft.guests), currency,
    budget: minor(draft.budget, currency, 'Budget'), maximumCancellationLoss: minor(draft.canLose, currency, 'Cancellation loss'),
    supplyNeeds: draft.needs.split(',').map(v => v.trim()).filter(Boolean),
  }
  if (!brief.eventType || !brief.location) throw new Error('Enter the occasion and location.')
  return Brief.parse(brief)
}

export function draftFromBrief(brief: Brief): BriefDraft {
  const instant = new Date(brief.startsAt)
  const local = localParts(instant, brief.timezone)
  const offset = Math.round((Date.parse(`${local.date}T${local.time}Z`) - instant.getTime()) / 60000)
  const abs = Math.abs(offset)
  const suffix = `${offset < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  const digits = currencyDigits(brief.currency)
  return { occasion: brief.eventType, guests: String(brief.headcount), date: local.date,
    from: `${local.time}${suffix}`, timezone: brief.timezone, area: brief.location,
    budget: (brief.budget / 10 ** digits).toFixed(digits), currency: brief.currency.toUpperCase(),
    canLose: (brief.maximumCancellationLoss / 10 ** digits).toFixed(digits), needs: brief.supplyNeeds.join(', ') }
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code' })
      .format(amount / 10 ** currencyDigits(currency))
  } catch { return `${amount} minor units ${currency}` }
}
