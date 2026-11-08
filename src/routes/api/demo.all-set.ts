import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Brief } from '../../contracts'
import { buildAllSetEmail, createConfiguredSender } from '../../server/email/quote-ready'
import { localPreview } from '#/lib/local-preview'

// Local preview only: sends the real "It's happening!" email for the demo booking,
// since the demo has no stored event to settle. The recipient comes from the
// server's own config, never the request.

const Body = z.object({
  /** Stable per demo booking, so a reload never emails twice. */
  key: z.string().min(8).max(100),
  brief: Brief,
  items: z.array(z.object({ name: z.string().min(1), amount: z.number().int().nonnegative() })).min(1),
  total: z.number().int().nonnegative(),
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export const Route = createFileRoute('/api/demo/all-set')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!localPreview) return json({ error: 'not found' }, 404)
        const to = process.env.DEMO_EMAIL_TO
        const sender = createConfiguredSender()
        if (!to || !sender) {
          console.info('[email] demo all-set skipped: set DEMO_EMAIL_TO, AGENTMAIL_API_KEY and AGENTMAIL_INBOX_ID')
          return json({ sent: false, to: to ?? null })
        }
        const body = Body.safeParse(await request.json().catch(() => null))
        if (!body.success) return json({ error: 'bad request' }, 400)
        const { key, brief, items, total } = body.data
        const origin = new URL(request.url).origin
        const email = buildAllSetEmail({
          eventId: 'demo',
          brief,
          plan: {
            total,
            currency: brief.currency,
            actions: items.map((i) => ({ supplierName: i.name, target: i.name, maximumAmount: i.amount })),
          },
          link: `${origin}/party`,
        }, origin)
        try {
          await sender.send(to, email, `demo-${key}-all-set`)
        } catch (error) {
          console.error('[email] demo all-set failed', error)
          return json({ sent: false, to }, 502)
        }
        return json({ sent: true, to })
      },
    },
  },
})
