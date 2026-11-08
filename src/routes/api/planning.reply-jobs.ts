import { createFileRoute } from '@tanstack/react-router'
import { handle, json } from '../../server/events/errors'
import { processPlanningReplies } from '../../server/planning/runtime'

export const Route = createFileRoute('/api/planning/reply-jobs')({
  server: { handlers: { GET: ({ request }) => handle(async () => {
    const secret = process.env.CRON_SECRET
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return json({ errorCode: 'unauthorized' }, 401)
    return json(await processPlanningReplies())
  }) } },
})
