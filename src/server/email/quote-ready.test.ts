import { describe, expect, it } from 'vitest'
import { planReadyEvent } from '../../contracts/fixtures'
import { buildQuoteReadyEmail, createQuoteReadyNotifications, type QuoteReady, type QuoteReadyEmail } from './quote-ready'

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
    expect(sent[0].key).toBe('appr_1:quote-ready')
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
