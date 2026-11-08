import { createFileRoute } from '@tanstack/react-router'
import { customerError } from '#/server/arrange/http'
import { getArrangeApp, getArrangeCustomerId } from '#/server/arrange/runtime'
import { toCustomerView } from '#/server/arrange/customer-view'
import { z } from 'zod'
import { ApiError, readJson, handle, json } from '#/server/events/errors'

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('choose'), optionId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('approve'), offerId: z.string().min(1), acceptOverage: z.boolean() }).strict(),
  z.object({ action: z.literal('checkout'), offerId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('answer'), operationKey: z.string().min(1).max(100), answer: z.string().min(1).max(2000) }).strict(),
])

export const Route = createFileRoute('/api/arrange/events/$eventId')({
  server: {
    handlers: {
      POST: ({ request, params }) => handle(async () => {
        const customerId = await getArrangeCustomerId(request)
        const origin = request.headers.get('origin')
        if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'invalid_origin', 'Please use your event page to make this change.')
        const parsed = actionSchema.safeParse(await readJson(request))
        if (!parsed.success) throw new ApiError(422, 'invalid_action', 'Please check your selection and try again.')
        const action = parsed.data
        const app = await getArrangeApp()
        const result = await customerError(async () => {
          switch (action.action) {
            case 'choose': return app.chooseOption(customerId, params.eventId, action.optionId)
            case 'approve': return app.ledger.approveOffer(customerId, params.eventId, action.offerId, action.acceptOverage)
            case 'checkout': return app.createCheckout(customerId, params.eventId, action.offerId)
            case 'answer': return app.answerQuestion(customerId, params.eventId, action.operationKey, action.answer)
          }
        })
        return json(result)
      }),
      GET: ({ request, params }) => handle(async () => {
        const customerId = await getArrangeCustomerId(request)
        const app = await getArrangeApp()
        const event = await customerError(() => app.ledger.readEventView(customerId, params.eventId))
        if (!event.sessionId) {
          // The session could not be started when the event was created; the same idempotency key makes this safe to retry.
          await app.ensureSession(event.id).catch(error => console.error('[arrange] session still not started', error))
        }
        return json(toCustomerView(event))
      }),
    },
  },
})
