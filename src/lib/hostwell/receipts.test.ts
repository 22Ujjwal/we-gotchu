import { expect, test } from 'vitest'
import { bookedEvent, canceledEvent, planReadyEvent } from '../../contracts'
import { receiptsFromView, timelineTimes } from './receipts'

test('no receipts before the plan is approved', () => {
  expect(receiptsFromView(planReadyEvent).receipts).toEqual([])
})

test('a booked event has a receipt per purchase plus the card payment', () => {
  const { receipts } = receiptsFromView(bookedEvent)
  expect(receipts.map((r) => [r.style, r.title, r.total, r.status])).toEqual([
    ['thermal', 'Booking the venue', '$300.00', 'paid'],
    ['notepad', 'Getting paper plates, 8-pack (simulated)', '$15.00', 'paid'],
    ['card', 'Paying for it', '$315.00', 'paid'],
  ])
  expect(receipts[0].reference).toBe('VENUE')
  expect(receipts[0].rows[1].label).toBe('Fri 11 Dec at 18:00')
  expect(receipts[2].note).toBe('Venue + paper plates, 8-pack (simulated)')
})

test("a receipt's story runs from research to the supplier's confirmation", () => {
  const venue = receiptsFromView(bookedEvent).receipts[0]
  expect(venue.timeline.map((e) => `${e.lead ?? ''}${e.text}`)).toEqual([
    'Compared two venues and one supply item.',
    'Plan ready: venue plus three packs of plates.',
    'You approved the plan for $315.00 for the venue + paper plates, 8-pack (simulated).',
    'Simulated payment recorded: $315.00.',
    'Harbor Loft (simulated) confirmed the booking',
  ])
  expect(venue.timeline.at(-1)).toMatchObject({ badge: 'confirmed', quote: { text: 'Simulated confirmation.' } })
})

test('canceled purchases are marked refunded', () => {
  const { receipts } = receiptsFromView(canceledEvent)
  expect(receipts.map((r) => r.status)).toEqual(['refunded', 'refunded', 'paid'])
  expect(receipts[0].timeline.at(-1)?.text).toBe('Canceled with Harbor Loft (simulated)')
  expect(receipts[2].timeline.at(-1)?.text).toBe('Refund requested')
})

test('a purchase still being booked is pending', () => {
  const view = structuredClone(bookedEvent)
  view.attempts[1].state = 'running'
  const plates = receiptsFromView(view).receipts[1]
  expect(plates.status).toBe('pending')
  expect(plates.timeline.at(-1)).toMatchObject({ text: 'Waiting for Paper plates, 8-pack (simulated) to confirm', badge: 'pending' })
})

test('timeline times only repeat the date when the day changes', () => {
  const at = (iso: string) => ({ at: iso, text: '', dot: 'step' as const })
  expect(timelineTimes([at('2026-11-06T20:14:00Z'), at('2026-11-06T20:16:00Z'), at('2026-11-07T08:40:00Z')], 'Europe/Berlin'))
    .toEqual(['6 Nov 21:14', '21:16', '7 Nov 09:40'])
})

test('approval alone never claims payment and confirmed payment uses its saved timestamp', () => {
  const view = structuredClone(bookedEvent)
  view.payment!.state = 'pending'
  view.attempts = []
  expect(receiptsFromView(view).receipts.flatMap(r => r.timeline).every(e => !e.text.includes('paid'))).toBe(true)
  expect(receiptsFromView(view).receipts.some(r => r.id === 'payment')).toBe(false)
  view.payment!.state = 'paid'
  view.payment!.paidAt = '2026-11-08T01:09:00.000Z'
  const payment = receiptsFromView(view).receipts.find(r => r.id === 'payment')!
  expect(payment.issuedAt).toBe(view.payment!.paidAt)
  expect(payment.timeline.at(-1)?.at).toBe(view.payment!.paidAt)
})

test('JPY receipts preserve the same units as checkout and keep evidence modes', () => {
  const view = structuredClone(bookedEvent)
  view.plan!.currency = view.payment!.currency = 'jpy'
  view.payment!.amount = 20000
  view.payment!.mode = 'test'
  const receipts = receiptsFromView(view).receipts
  expect(receipts.find(r => r.id === 'payment')).toMatchObject({ amount: '20000', total: '¥20,000', mode: 'test' })
  expect(receipts[0]).toMatchObject({ mode: 'simulated' })
})
