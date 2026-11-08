import { expect, test } from 'vitest'
import { briefFromDraft, draftFromBrief, emptyDraft, formatMoney } from './brief-adapter'

const draft = { ...emptyDraft, occasion: 'Birthday', guests: '24', date: '2026-12-12',
  from: '19:00+01:00', timezone: 'Europe/Berlin', area: 'Berlin', budget: '900.50',
  currency: 'EUR', canLose: '10', needs: 'candles, paper plates' }

test('maps explicit form values to the shared brief and restores them without losing answers', () => {
  const brief = briefFromDraft(draft)
  expect(brief).toEqual({ eventType: 'Birthday', headcount: 24, startsAt: '2026-12-12T18:00:00.000Z',
    timezone: 'Europe/Berlin', location: 'Berlin', budget: 90050, currency: 'eur',
    maximumCancellationLoss: 1000, supplyNeeds: ['candles', 'paper plates'] })
  expect(briefFromDraft(draftFromBrief(brief))).toEqual(brief)
})

test.each([
  { date: 'Sat 12 Dec' }, { date: '2026-02-30' }, { from: '7pm' },
  { from: '19:00+02:00' }, { timezone: '' }, { currency: '' }, { currency: 'ZZZ' },
  { budget: 'EUR900' }, { budget: '1.001' }, { guests: '2.5' }, { guests: '' },
])('rejects ambiguous or invalid values %j instead of guessing', patch => {
  expect(() => briefFromDraft({ ...draft, ...patch })).toThrow()
})

test('uses currency minor units rather than assuming two decimal places', () => {
  expect(briefFromDraft({ ...draft, currency: 'JPY', budget: '900', canLose: '10' }).budget).toBe(900)
  expect(briefFromDraft({ ...draft, currency: 'KWD', budget: '1.234' }).budget).toBe(1234)
  expect(formatMoney(1234, 'KWD')).toContain('1.234')
})

test('restores the saved instant even during a repeated daylight saving hour', () => {
  const brief = briefFromDraft({ ...draft, date: '2026-10-25', from: '02:30+01:00' })
  expect(briefFromDraft(draftFromBrief(brief))).toEqual(brief)
})
