import { createFileRoute } from '@tanstack/react-router'
import { customerError } from '#/server/arrange/http'
import { getArrangeApp, getArrangeCustomerId } from '#/server/arrange/runtime'
import { toCustomerView } from '#/server/arrange/customer-view'
import { handle, json } from '#/server/events/errors'

export const Route = createFileRoute('/api/arrange/events/$eventId')({
  server: {
    handlers: {
      GET: ({ request: _request, params }) => handle(async () => {
        const customerId = await getArrangeCustomerId()
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
