import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { customerError } from '#/server/arrange/http'
import { getArrangeApp, getArrangeCustomerId } from '#/server/arrange/runtime'
import { ApiError, handle, json, readJson } from '#/server/events/errors'

const body = z.object({ brief: z.unknown(), contactConsent: z.boolean(), requestKey: z.string().min(1).max(100).optional() })

export const Route = createFileRoute('/api/arrange/events')({
  server: {
    handlers: {
      POST: ({ request }) => handle(async () => {
        const customerId = await getArrangeCustomerId(request)
        const parsed = body.safeParse(await readJson(request))
        if (!parsed.success) throw new ApiError(422, 'invalid_request', 'Please fill in the whole form.')
        const app = await getArrangeApp()
        const { eventId } = await customerError(() => app.createEventForCustomer(customerId, parsed.data.brief, parsed.data.contactConsent, parsed.data.requestKey))
        return json({ eventId }, 201)
      }),
    },
  },
})
