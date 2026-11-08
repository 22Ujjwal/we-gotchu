import { describe, expect, it } from 'vitest'
import { Brief } from '../../contracts'
import { planReadyEvent } from '../../contracts/fixtures'
import { buildAllSetEmail, buildQuoteReadyEmail, createQuoteReadyNotifications, type QuoteReady, type QuoteReadyEmail } from './quote-ready'

const input: QuoteReady = {
  customerId: 'user_alice',
  eventId: planReadyEvent.event.eventId,
  approvalId: 'appr_1',
  brief: planReadyEvent.event.brief,
  plan: planReadyEvent.plan!,
}

describe('quote-ready email', () => {
  it('lists each supplier, the total and a link back to the event', () => {
    const { subject, text } = buildQuoteReadyEmail(input, 'https://app.test/')
    expect(subject).toMatch(/^We're done: your \d+ quotes? (is|are) in$/)
    for (const a of input.plan.actions) expect(text).toContain(a.supplierName)
    expect(text).toContain(`Guests: ${input.brief.headcount}`)
    expect(text).toContain('Total: ')
    expect(text).toContain(`https://app.test/events/${input.eventId}`)
  })

  it('escapes researched and user-entered text in the HTML version', () => {
    const plan = structuredClone(input.plan)
    plan.actions[0].supplierName = '<script>alert(1)</script>'
    const { html } = buildQuoteReadyEmail({ ...input, plan, brief: { ...input.brief, location: 'Tom & Jerry\'s' } }, 'https://app.test')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('Tom &amp; Jerry&#39;s')
    expect(html).toContain(`href="https://app.test/events/${input.eventId}"`)
  })

  it('sends to the customer address with an approval-scoped idempotency key', async () => {
    const sent: { to: string; email: QuoteReadyEmail; key: string }[] = []
    const notifications = createQuoteReadyNotifications({
      appUrl: 'https://app.test',
      lookupEmail: async () => 'alice@example.com',
      sender: { send: async (to, email, key) => void sent.push({ to, email, key }) },
    })
    await notifications.quoteReady(input)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('alice@example.com')
    expect(sent[0].key).toMatch(/^[A-Za-z0-9._~-]{1,256}$/)
  })

  it('sends nothing when the customer has no address', async () => {
    let calls = 0
    const notifications = createQuoteReadyNotifications({
      appUrl: 'https://app.test',
      lookupEmail: async () => null,
      sender: { send: async () => void calls++ },
    })
    await notifications.quoteReady(input)
    expect(calls).toBe(0)
  })
})

it('includes the complete overnight schedule, timezone and elapsed duration', () => {
  const brief = { ...input.brief, startsAt: '2026-12-13T07:00:00Z', endsAt: '2026-12-13T09:30:00Z', timezone: 'America/Los_Angeles' }
  const email = buildQuoteReadyEmail({ ...input, brief }, 'https://app.test')
  for (const body of [email.text, email.html]) {
    expect(body).toContain('Dec 12, 2026')
    expect(body).toContain('Dec 13, 2026')
    expect(body).toContain('11:00 PM')
    expect(body).toContain('1:30 AM')
    expect(body).toContain('America/Los_Angeles')
    expect(body).toContain('2h 30m')
  }
})

it('accepts old briefs but rejects non-positive event durations', () => {
  expect(Brief.safeParse(input.brief).success).toBe(true)
  expect(Brief.safeParse({ ...input.brief, endsAt: input.brief.startsAt }).success).toBe(false)
  expect(Brief.safeParse({ ...input.brief, endsAt: '2020-01-01T00:00:00Z' }).success).toBe(false)
})

describe('all-set email', () => {
  it('says it is booked and links back to the event', () => {
    const { subject, text, html } = buildAllSetEmail(input, 'https://app.test')
    expect(subject).toBe(`It's happening: your ${input.brief.eventType} is all set`)
    for (const a of input.plan.actions) expect(text).toContain(a.supplierName)
    expect(text).toContain('Paid: ')
    expect(text).toContain(`https://app.test/events/${input.eventId}`)
    expect(html).toContain('BOOKED')
    expect(html).not.toContain('Nothing is booked')
  })

  it('sends once per approval with its own idempotency key', async () => {
    const keys: string[] = []
    const notifications = createQuoteReadyNotifications({
      appUrl: 'https://app.test',
      lookupEmail: async () => 'alice@example.com',
      sender: { send: async (_to, _email, key) => void keys.push(key) },
    })
    await notifications.quoteReady(input)
    await notifications.allSet!(input)
    expect(keys).toEqual(['appr_1-quote-ready', 'appr_1-all-set'])
  })
})
