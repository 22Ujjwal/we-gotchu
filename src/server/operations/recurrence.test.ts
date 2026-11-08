import { describe, expect, it } from 'vitest'
import { generateOccurrences, type Series } from './recurrence'

const series: Series = {
  id: 'dinner', timezone: 'America/Los_Angeles', localTime: '18:00',
  startDate: '2027-03-07', endDate: '2027-03-21', schedule: { kind: 'weekly', weekday: 0 },
  preparationLeadHours: 24, horizonDays: 30, maxOccurrences: 10,
  brief: { eventType: 'dinner', location: 'SF', headcount: 8, budget: 10000,
    currency: 'usd', supplyNeeds: ['plates'], maximumCancellationLoss: 0 },
}
const now = new Date('2027-03-01T00:00:00Z')
describe('generateOccurrences', () => {
  it('preserves weekly wall time across DST and creates independent fresh briefs', () => {
    const result = generateOccurrences(series, now)
    expect(result.occurrences.map(o => o.brief.startsAt)).toEqual([
      '2027-03-08T02:00:00.000Z', '2027-03-15T01:00:00.000Z', '2027-03-22T01:00:00.000Z',
    ])
    expect(result.occurrences[0]).toMatchObject({ key: 'dinner:2027-03-07', dueAt: '2027-03-07T02:00:00.000Z', requiresResearch: true, requiresApproval: true })
    result.occurrences[0]!.brief.supplyNeeds.push('cups')
    expect(series.brief.supplyNeeds).toEqual(['plates'])
    expect(result.occurrences[1]!.brief.supplyNeeds).toEqual(['plates'])
  })
  it.each([
    ['2027-03-14', '02:30', 'nonexistent-local-time'],
    ['2027-11-07', '01:30', 'ambiguous-local-time'],
  ])('reports unresolved local time %s', (date, localTime, code) => {
    const result = generateOccurrences({ ...series, startDate: date, endDate: date, localTime }, new Date(`${date}T00:00:00Z`))
    expect(result.occurrences).toEqual([])
    expect(result.issues).toEqual([{ localDate: date, code }])
  })
  it('skips impossible monthly days and honors end date', () => {
    const result = generateOccurrences({ ...series, startDate: '2027-01-01', endDate: '2027-04-30', horizonDays: 180, schedule: { kind: 'monthly', dayOfMonth: 31 } }, new Date('2027-01-01Z'))
    expect(result.occurrences.map(o => o.localDate)).toEqual(['2027-01-31', '2027-03-31'])
  })
  it('honors pause, skips, count and inclusive horizon while excluding past starts', () => {
    expect(generateOccurrences({ ...series, paused: true }, now).occurrences).toEqual([])
    expect(generateOccurrences({ ...series, skippedDates: ['2027-03-07'], maxOccurrences: 1 }, now).occurrences.map(o => o.localDate)).toEqual(['2027-03-14'])
    expect(generateOccurrences({ ...series, horizonDays: 6 }, new Date('2027-03-01T08:00:00Z')).occurrences.map(o => o.localDate)).toEqual(['2027-03-07'])
    expect(generateOccurrences(series, new Date('2027-03-08T03:00:00Z')).occurrences.map(o => o.localDate)).toEqual(['2027-03-14', '2027-03-21'])
  })
  it('caps output at 52 and uses a bounded local horizon without an end date', () => {
    const result = generateOccurrences({ ...series, startDate: '2027-01-01', endDate: undefined, horizonDays: 366, maxOccurrences: 52 }, new Date('2027-01-01T08:00:00Z'))
    expect(result.occurrences).toHaveLength(52)
    expect(result.occurrences[0]!.localDate).toBe('2027-01-03')
    expect(result.occurrences[51]!.localDate).toBe('2027-12-26')
    expect(generateOccurrences({ ...series, startDate: '2030-01-01', endDate: undefined }, now).occurrences).toEqual([])
  })
  it('preserves a half-hour timezone transition and reports its fold', () => {
    const result = generateOccurrences({ ...series, timezone: 'Australia/Lord_Howe', startDate: '2027-04-04', endDate: '2027-04-11' }, new Date('2027-04-01T00:00:00Z'))
    expect(result.occurrences.map(o => o.brief.startsAt)).toEqual(['2027-04-04T07:30:00.000Z', '2027-04-11T07:30:00.000Z'])
    expect(generateOccurrences({ ...series, timezone: 'Australia/Lord_Howe', startDate: '2027-04-04', endDate: '2027-04-04', localTime: '01:45' }, new Date('2027-04-01T00:00:00Z')).issues).toEqual([{ localDate: '2027-04-04', code: 'ambiguous-local-time' }])
  })
  it.each([
    { timezone: 'Mars/Olympus' }, { startDate: '2027-02-30' }, { endDate: '2026-01-01' },
    { localTime: '24:00' }, { preparationLeadHours: Infinity }, { preparationLeadHours: -1 },
    { horizonDays: 367 }, { maxOccurrences: 53 }, { maxOccurrences: 0 },
    { schedule: { kind: 'weekly', weekday: 7 } }, { schedule: { kind: 'monthly', dayOfMonth: 0 } },
    { horizonDays: NaN }, { horizonDays: -1 }, { maxOccurrences: 1.5 }, { preparationLeadHours: 8785 }, { skippedDates: ['oops'] },
  ])('rejects invalid input %j', change => {
    expect(() => generateOccurrences({ ...series, ...change } as Series, now)).toThrow()
  })
  it('rejects invalid now and strips unrelated state from the template', () => {
    expect(() => generateOccurrences(series, new Date(NaN))).toThrow()
    const result = generateOccurrences({ ...series, brief: { ...series.brief, approvalId: 'old' } } as Series, now)
    expect(result.occurrences[0]!.brief).not.toHaveProperty('approvalId')
  })
})
