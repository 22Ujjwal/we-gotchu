import { afterEach, expect, test, vi } from 'vitest'
import { planReadyEvent } from '../../contracts/fixtures'
import { briefFromPreview, previewFromBrief, settingsFromView } from './brief-adapter'
import { defaultBrief } from './fixture'

const typed = {
  ...defaultBrief,
  occasion: 'Franz’s 30th birthday', guests: '24', date: 'Sat 12 Dec 2026', from: '7pm', till: '11pm',
  area: 'Kreuzberg', budget: '900', canLose: '10', needs: 'table candles and paper plates', vibe: 'cosy',
}

afterEach(() => { vi.unstubAllEnvs() })

test('maps the fill-in brief to dollars in minor units and the browser timezone', () => {
  const brief = briefFromPreview(typed)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  expect(brief).toEqual({
    eventType: 'Franz’s 30th birthday', location: 'Kreuzberg', headcount: 24,
    startsAt: new Date(2026, 11, 12, 19, 0).toISOString(), endsAt: new Date(2026, 11, 12, 23, 0).toISOString(), timezone: zone,
    budget: 90000, currency: 'usd', maximumCancellationLoss: 1000,
    supplyNeeds: ['table candles', 'paper plates'],
  })
  expect(previewFromBrief(brief)).toMatchObject({
    occasion: typed.occasion, guests: '24', date: 'Sat 12 Dec 2026', from: '7pm', till: '11pm', area: 'Kreuzberg',
    budget: '900', canLose: '10', needs: 'table candles, paper plates',
  })
})

test.each([
  [{ guests: 'twenty' }, 'guests'],
  [{ guests: '2.5' }, 'guests'],
  [{ budget: 'lots' }, 'dollars'],
  [{ date: '' }, 'date'],
])('rejects %j without guessing', (patch, message) => {
  expect(() => briefFromPreview({ ...typed, ...patch })).toThrow(message)
})

test('features the planned venue first with the plan as its receipt', () => {
  const settings = settingsFromView(planReadyEvent)
  expect(settings.venues.map((v) => v.name)).toEqual(['Harbor Loft (simulated)', 'Garden Room (simulated)'])
  expect(settings.planned?.id).toBe('cand_venue_a')
  expect(settings.approvable).toBe(true)
  const order = settings.order(settings.planned!)
  expect(order.total).toBe(planReadyEvent.plan!.total / 100)
  expect(order.lines).toHaveLength(planReadyEvent.plan!.actions.length)
  expect(order.vat).toBeNull()
  expect(settings.venues[1].total).toBeNull()
})

 test('preserves overnight end times and rejects equal times', () => {
  const brief = briefFromPreview({ ...typed, from: '11pm', till: '1am' })
  expect(brief).toHaveProperty('endsAt', new Date(2026, 11, 13, 1, 0).toISOString())
  expect(previewFromBrief(brief).till).toBe('1am')
  expect(() => briefFromPreview({ ...typed, till: '7pm' })).toThrow('end time')
 })
