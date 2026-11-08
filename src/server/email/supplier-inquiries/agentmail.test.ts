import { expect, it } from 'vitest'
import { createAgentMailProvider } from './agentmail'
import { SendRejected } from './types'

it('uses the actual SDK wire format, exact approved body and idempotency header', async () => {
  const requests: Request[] = []
  const provider = createAgentMailProvider({ apiKey: 'test-key', inboxId: 'team@agentmail.to', fetch: (async (url, init) => {
    requests.push(new Request(url, init))
    return Response.json({ message_id: 'm-1', thread_id: 't-1' })
  }) as typeof fetch })
  expect(await provider.send({ to: 'venue@example.com', subject: 'Approved', text: 'Exact\ntext' }, 'request-1')).toEqual({ messageId: 'm-1', threadId: 't-1' })
  expect(requests).toHaveLength(1)
  expect(requests[0].method).toBe('POST')
  expect(requests[0].headers.get('Idempotency-Key')).toBe('request-1')
  expect(await requests[0].json()).toEqual({ to: 'venue@example.com', subject: 'Approved', text: 'Exact\ntext' })
})

it.each([403, 422, 429, 500, 409])('does not retry HTTP %i and sanitizes established rejections', async (status) => {
  let calls = 0
  const provider = createAgentMailProvider({ apiKey: 'test-key', inboxId: 'team@agentmail.to', fetch: (async () => {
    calls++
    return Response.json({ message: 'private provider detail' }, { status })
  }) as typeof fetch })
  const promise = provider.send({ to: 'venue@example.com', subject: 'Approved', text: 'Exact' }, 'key-1')
  if ([403, 422, 429].includes(status)) {
    await expect(promise).rejects.toBeInstanceOf(SendRejected)
  } else {
    await expect(promise).rejects.toThrow('Provider send outcome is unknown')
  }
  expect(calls).toBe(1)
})

it('normalizes an actual SDK get response and only fetches the configured inbox', async () => {
  const urls: string[] = []
  const provider = createAgentMailProvider({ apiKey: 'test-key', inboxId: 'team@agentmail.to', fetch: (async (url) => {
    urls.push(String(url))
    return Response.json({ inbox_id: 'team@agentmail.to', message_id: '<m-1>', thread_id: 't-1', from: 'Venue <venue@example.com>', to: ['team@agentmail.to'], labels: ['received'], timestamp: '2026-11-08T12:00:00Z', created_at: '2026-11-08T12:00:00Z', updated_at: '2026-11-08T12:00:00Z', size: 20, text: 'TEST QUOTE', subject: 'Re: inquiry', in_reply_to: '<sent-1>', references: ['<sent-1>'] })
  }) as typeof fetch })
  expect(await provider.getMessage('<m-1>')).toMatchObject({ inboxId: 'team@agentmail.to', messageId: '<m-1>', threadId: 't-1', text: 'TEST QUOTE', inReplyTo: '<sent-1>', timestamp: '2026-11-08T12:00:00.000Z' })
  expect(urls[0]).toContain('/inboxes/team%40agentmail.to/messages/%3Cm-1%3E')
})
