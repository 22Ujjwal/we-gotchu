import { createHmac } from 'node:crypto'
import { expect, it } from 'vitest'
import { createSupplierMailWebhook } from './webhook'

const secret = 'whsec_c3VwcGxpZXItd2ViaG9vay10ZXN0LWtleQ=='
const now = 1794139200000
function request(body = '{"event_type":"message.received"}', extraHeaders: Record<string, string> = {}) {
  const id = 'test-event'
  const timestamp = String(now / 1000)
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${timestamp}.${body}`).digest('base64')
  return new Request('https://example.com/api/supplier-mail/webhook', { method: 'POST', body, headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}`, ...extraHeaders } })
}
it('awaits the receiver and returns only a small acknowledgement', async () => {
  let finished = false
  const handler = createSupplierMailWebhook({ secret, now: () => now, receiver: { async receive(body) { expect(body).toBe('{"event_type":"message.received"}'); await Promise.resolve(); finished = true; return 'processed' } } })
  const response = await handler(request())
  expect(finished).toBe(true)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'processed' })
  expect(response.headers.get('cache-control')).toBe('no-store')
})
it('rejects invalid signatures without dispatching the payload', async () => {
  let called = false
  const handler = createSupplierMailWebhook({ secret, now: () => now, receiver: { async receive() { called = true; return 'processed' } } })
  expect((await handler(request('{}', { 'svix-signature': 'v1,bogus' }))).status).toBe(401)
  expect(called).toBe(false)
})
it('returns retryable 503 when durable application handling fails, without exposing details', async () => {
  const handler = createSupplierMailWebhook({ secret, now: () => now, receiver: { async receive() { throw new Error('private content and database address') } } })
  const response = await handler(request())
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private')
})
it('fails closed when runtime configuration is absent', async () => {
  const handler = createSupplierMailWebhook({ secret: '', now: () => now, receiver: { async receive() { throw new Error('must not call') } } })
  expect((await handler(request())).status).toBe(503)
})
it('rejects oversized bodies with and without a content-length header', async () => {
  const handler = createSupplierMailWebhook({ secret, now: () => now, receiver: { async receive() { throw new Error('must not call') } } })
  expect((await handler(request('small', { 'content-length': '300000' }))).status).toBe(413)
  expect((await handler(request('x'.repeat(300000)))).status).toBe(413)
})
it('bounds time spent reading a stalled request body', async () => {
  const handler = createSupplierMailWebhook({ secret, now: () => now, bodyTimeoutMs: 10, receiver: { async receive() { throw new Error('must not call') } } })
  const body = new ReadableStream<Uint8Array>({ start() {} })
  const req = new Request('https://example.com/api/supplier-mail/webhook', { method: 'POST', body, duplex: 'half' } as RequestInit)
  expect((await handler(req)).status).toBe(408)
})
it('returns 400 on a signed malformed JSON body', async () => {
  const handler = createSupplierMailWebhook({ secret, now: () => now, receiver: { async receive(body) { JSON.parse(body); return 'processed' } } })
  expect((await handler(request('{bad'))).status).toBe(400)
})
