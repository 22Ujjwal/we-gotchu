import { sdkSessionResponse } from './integration.test-fixtures'
import { expect, test, vi } from 'vitest'
import { CONTRACT_VERSION, planReadyEvent, type ResearchInput } from '../contracts'
import { createResearchSession } from './session'

test('bounded session lifecycle uses the documented REST paths and does not wait for completion', async () => {
  const replies = [{ id: 'ses_00000000000000000000000001' }, { id: 'ses_00000000000000000000000001', status: 'idle', stop_reason: 'error', last_seq: 4 }, { accepted_seq: 5 }, { id: 'ses_00000000000000000000000001', status: 'cancelled' }]
  const fetcher = vi.fn(async () => new Response(JSON.stringify(sdkSessionResponse(replies.shift()))))
  const session = createResearchSession({ apiKey: 'secret', agentId: 'agent', fetch: fetcher as typeof fetch })
  const input: ResearchInput = { contractVersion: CONTRACT_VERSION, eventId: 'event', runId: 'run', briefRevision: 1, brief: planReadyEvent.event.brief }
  const signal = AbortSignal.timeout(1000)
  expect(await session.start(input, [], signal)).toBe('ses_00000000000000000000000001')
  expect(await session.poll('ses_00000000000000000000000001', signal)).toMatchObject({ stop_reason: 'error', last_seq: 4 })
  expect(await session.correct('ses_00000000000000000000000001', 'run', signal)).toBe(5)
  await session.cancel('ses_00000000000000000000000001', signal)
  expect(fetcher).toHaveBeenCalledTimes(4)
  const calls = fetcher.mock.calls as unknown as [string, RequestInit][]
  expect(calls.map(([url]) => url.replace('https://api.vetta.sh/v1', ''))).toEqual([
    '/sessions', '/sessions/ses_00000000000000000000000001', '/sessions/ses_00000000000000000000000001/messages', '/sessions/ses_00000000000000000000000001/cancel',
  ])
  expect(JSON.parse(calls[0][1].body as string).agent_id).toBe('agent')
  expect(new Headers(calls[2][1].headers).get('idempotency-key')).toBe('run:correction:1')
  expect(calls.map(([, init]) => init.body).join('')).not.toContain('secret')
})

test('terminal cancellation is confirmed without masking other failures', async () => {
  const replies = [
    [409, 'session_terminal'], [409, 'other_conflict'],
  ] as const
  let next = 0
  const fetcher = vi.fn(async () => {
    const [status, code] = replies[next++]
    return new Response(JSON.stringify({ error: { code, type: 'conflict', message: 'private diagnostic', request_id: 'request' } }), { status })
  })
  const session = createResearchSession({ apiKey: 'secret', agentId: 'agent', fetch: fetcher as typeof fetch })
  const signal = AbortSignal.timeout(1000)
  await expect(session.cancel('ses_00000000000000000000000001', signal)).resolves.toBeUndefined()
  await expect(session.cancel('ses_00000000000000000000000001', signal)).rejects.toThrow('private diagnostic')
})
