import { z } from 'zod'
import { Brief } from '../../contracts'

const seriesSchema = z.object({
  id: z.string().trim().min(1), timezone: z.string().min(1), localTime: z.string(),
  startDate: z.string(), endDate: z.string().optional(),
  schedule: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('weekly'), weekday: z.number().int().min(0).max(6) }),
    z.object({ kind: z.literal('monthly'), dayOfMonth: z.number().int().min(1).max(31) }),
  ]),
  preparationLeadHours: z.number().finite().min(0).max(8784),
  horizonDays: z.number().int().min(0).max(366),
  maxOccurrences: z.number().int().min(1).max(52),
  paused: z.boolean().optional(), skippedDates: z.array(z.string()).max(367).optional(),
  brief: Brief.omit({ startsAt: true, timezone: true }),
})
export type Series = z.infer<typeof seriesSchema>
export type Occurrence = { key: string; localDate: string; brief: z.infer<typeof Brief>; dueAt: string; requiresResearch: true; requiresApproval: true }
export type RecurrenceResult = { occurrences: Occurrence[]; issues: { localDate: string; code: 'nonexistent-local-time' | 'ambiguous-local-time' }[] }
const DAY = 86_400_000
function dateMillis(value: string): number {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid local date')
  const millis = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 10) !== value) throw new Error('Invalid local date')
  return millis
}
function formatter(timezone: string) {
  // Intl rejects unknown zones. Offset identifiers are not IANA zone names.
  if (/^[+-]/.test(timezone)) throw new Error('Expected IANA timezone')
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
}
function localParts(format: Intl.DateTimeFormat, millis: number) {
  const parts = Object.fromEntries(format.formatToParts(millis).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` }
}
function possibleInstants(format: Intl.DateTimeFormat, localDate: string, localTime: string): number[] {
  const wall = Date.parse(`${localDate}T${localTime}:00Z`)
  const offsets = new Set<number>()
  // Sample both sides of an IANA transition, including non-hour offsets and
  // whole-day political changes. Every candidate is round-trip checked below.
  for (let hour = -48; hour <= 48; hour++) {
    const sample = wall + hour * 3_600_000
    const parts = localParts(format, sample)
    offsets.add(Date.parse(`${parts.date}T${parts.time}Z`) - sample)
  }
  return [...offsets].map(offset => wall - offset).filter(candidate => {
    const parts = localParts(format, candidate)
    return parts.date === localDate && parts.time === `${localTime}:00`
  }).sort((a, b) => a - b)
}
/** Pure preview only. Horizon includes today through today + horizonDays in
 * the series timezone (at most 367 local dates); at most 52 successful results.
 * Lead time is elapsed hours (0..8784). Start/end and skipped dates are inclusive.
 * Only starts >= now are returned; dueAt may already be past. No jobs are run.
 */
export function generateOccurrences(input: Series, now: Date): RecurrenceResult {
  const series = seriesSchema.parse(input)
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid now')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(series.localTime)) throw new Error('Invalid local time')
  const format = formatter(series.timezone)
  const start = dateMillis(series.startDate)
  const end = series.endDate === undefined ? Infinity : dateMillis(series.endDate)
  if (end < start) throw new Error('End date precedes start date')
  const skipped = new Set(series.skippedDates ?? [])
  for (const date of skipped) dateMillis(date)
  const today = dateMillis(localParts(format, now.getTime()).date)
  const result: RecurrenceResult = { occurrences: [], issues: [] }
  if (series.paused) return result
  const last = Math.min(end, today + series.horizonDays * DAY)
  for (let day = Math.max(start, today); day <= last && result.occurrences.length < series.maxOccurrences; day += DAY) {
    const calendar = new Date(day)
    const localDate = calendar.toISOString().slice(0, 10)
    const matches = series.schedule.kind === 'weekly'
      ? calendar.getUTCDay() === series.schedule.weekday
      : calendar.getUTCDate() === series.schedule.dayOfMonth
    if (!matches || skipped.has(localDate)) continue
    const instants = possibleInstants(format, localDate, series.localTime)
    if (instants.length !== 1) {
      // A fold entirely before now cannot produce a future occurrence.
      if (instants.length > 1 && instants.every(instant => instant < now.getTime())) continue
      result.issues.push({ localDate, code: instants.length === 0 ? 'nonexistent-local-time' : 'ambiguous-local-time' })
      continue
    }
    const instant = instants[0]!
    if (instant < now.getTime()) continue
    result.occurrences.push({
      key: `${series.id}:${localDate}`, localDate,
      brief: { ...series.brief, supplyNeeds: [...series.brief.supplyNeeds], startsAt: new Date(instant).toISOString(), timezone: series.timezone },
      dueAt: new Date(instant - series.preparationLeadHours * 3_600_000).toISOString(),
      requiresResearch: true, requiresApproval: true,
    })
  }
  return result
}
