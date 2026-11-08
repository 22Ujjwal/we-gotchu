import { expect, test, vi } from 'vitest'
import { CONTRACT_VERSION, planReadyEvent } from '../contracts'
import { createResearchSession } from './session'

test('bounded session lifecycle uses the documented REST paths and does not wait for completion', async () => {
  const replies = [{ id: 'agent' }, { id: 'session' }, { id: 'session', status: 'idle', stop_reason: 'error', last_seq: 4 }, { accepted_seq: 5 }, {}, {}]
  const fetcher = vi.fn(async () => new Response(JSON.stringify(replies.shift())))
  const session = createResearchSession({ apiKey: 'secret', model: 'model', fetch: fetcher as typeof fetch })
  const input = { contractVersion: CONTRACT_VERSION, eventId: 'event', runId: 'run', briefRevision: 1, brief: planReadyEvent.event.brief }
  const signal = AbortSignal.timeout(1000)
  expect(await session.createAgent(input, signal)).toBe('agent')
  expect(await session.start(input, [], 'agent', signal)).toBe('session')
  expect(await session.poll('session', signal)).toMatchObject({ stop_reason: 'error', last_seq: 4 })
  expect(await session.correct('session', 'run', signal)).toBe(5)
  await session.cancel('session', signal)
  await session.deleteAgent('agent', signal)
  expect(fetcher).toHaveBeenCalledTimes(6)
  const calls = fetcher.mock.calls as unknown as [string, RequestInit][]
  expect(calls.map(([url]) => url.replace('https://api.vetta.sh/v1', ''))).toEqual([
    '/agents', '/sessions', '/sessions/session', '/sessions/session/messages', '/sessions/session/cancel', '/agents/agent',
  ])
  expect(JSON.parse(calls[0][1].body as string).tools.default_config.permission).toBe('deny')
  expect(calls[3][1].headers).toMatchObject({ 'Idempotency-Key': 'run:correction:1' })
  expect(calls.map(([, init]) => init.body).join('')).not.toContain('secret')
})
