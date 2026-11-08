import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Brief } from '../../contracts'
import { buildQuoteReadyEmail, createConfiguredSender } from '../../server/email/quote-ready'
import { localPreview } from '#/lib/local-preview'

// Local preview only: sends the real "Your quotes are in" email when Arrange is
// clicked, since the demo has no stored event to approve. The recipient comes
// from the server's own config, never the request.

const Body = z.object({
  /** Stable per demo booking, so a reload never emails twice. */
  key: z.string().min(8).max(100),
  /** The fixture venue the email's button goes back to. */
  venueId: z.string().regex(/^[a-z0-9-]{1,60}$/),
  brief: Brief,
  items: z.array(z.object({ name: z.string().min(1), amount: z.number().int().nonnegative() })).min(1),
  total: z.number().int().nonnegative(),
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export const Route = createFileRoute('/api/demo/quotes-ready')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!localPreview) return json({ error: 'not found' }, 404)
        const to = process.env.DEMO_EMAIL_TO
        const sender = createConfiguredSender()
        if (!to || !sender) {
          console.info('[email] demo quotes-ready skipped: set DEMO_EMAIL_TO, AGENTMAIL_API_KEY and AGENTMAIL_INBOX_ID')
          return json({ sent: false, to: to ?? null })
        }
        const body = Body.safeParse(await request.json().catch(() => null))
        if (!body.success) return json({ error: 'bad request' }, 400)
        const { key, venueId, brief, items, total } = body.data
        const origin = new URL(request.url).origin
        const email = buildQuoteReadyEmail({
          eventId: 'demo',
          brief,
          plan: {
            total,
            currency: brief.currency,
            actions: items.map((i) => ({ supplierName: i.name, target: i.name, maximumAmount: i.amount })),
          },
          link: `${origin}/settings/${venueId}`,
        }, origin)
        try {
          await sender.send(to, email, `demo-${key}-quote-ready`)
        } catch (error) {
          // A repeat of the same booking while the first send is in flight: that one delivers.
          if ((error as { statusCode?: number }).statusCode === 409) return json({ sent: true, to })
          console.error('[email] demo quotes-ready failed', error)
          return json({ sent: false, to }, 502)
        }
        return json({ sent: true, to })
      },
    },
  },
})
