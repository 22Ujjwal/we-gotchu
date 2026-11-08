import { createFileRoute } from '@tanstack/react-router'
import { localCustomerId } from '#/server/arrange/local-access'
import { handle, json } from '#/server/events/errors'

// The acceptance runner checks this before creating any event.
export const Route = createFileRoute('/api/arrange/local')({
  server: { handlers: { GET: ({ request }) => handle(async () => {
    if (!localCustomerId(process.env, request)) return json({ errorCode: 'not_found' }, 404)
    return json({ providers: 'local-fakes' })
  }) } },
})
