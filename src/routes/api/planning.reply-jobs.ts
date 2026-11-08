import { createHash, timingSafeEqual } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { handle, json } from '../../server/events/errors'
import { processPlanningReplies } from '../../server/planning/runtime'

export const Route = createFileRoute('/api/planning/reply-jobs')({
  server: { handlers: { GET: ({ request }) => handle(async () => {
    const secret = process.env.CRON_SECRET
    const digest = (value: string) => createHash('sha256').update(value).digest()
    if (!secret || !timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`))) return json({ errorCode: 'unauthorized' }, 401)
    return json(await processPlanningReplies())
  }) } },
})
