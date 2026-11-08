import { expect, test, vi } from 'vitest'
import { createPlanningFetch } from './transport'

test('retries explicit capacity rejections with the identical write and key', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '1' } })).mockResolvedValueOnce(Response.json({ id: 'session' }))
  const wait = vi.fn(async () => undefined)
  const send = createPlanningFetch({ fetch: fetcher, wait })
  const init = { method: 'POST', body: '{"message":"birthday"}', headers: { 'Idempotency-Key': 'same-key' } }
  expect((await send('https://api.vetta.sh/v1/sessions', init)).status).toBe(200)
  expect(fetcher).toHaveBeenCalledTimes(2)
  for (const [, sent] of fetcher.mock.calls) expect(sent).toMatchObject(init)
  expect(wait).toHaveBeenCalledWith(1000, expect.any(AbortSignal))
})

test('never retries an uncertain write after a lost response or server error', async () => {
  const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('lost response'))
  const send = createPlanningFetch({ fetch: fetcher, wait: async () => undefined })
  await expect(send('https://api.vetta.sh/v1/sessions', { method: 'POST' })).rejects.toThrow('lost response')
  expect(fetcher).toHaveBeenCalledTimes(1)
  fetcher.mockReset().mockResolvedValueOnce(new Response('', { status: 500 }))
  expect((await send('https://api.vetta.sh/v1/sessions', { method: 'POST' })).status).toBe(500)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('bounds capacity retries and honors a longer server delay without an early retry', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status: 429 }))
  const wait = vi.fn(async () => undefined)
  const send = createPlanningFetch({ fetch: fetcher, wait })
  expect((await send('https://api.vetta.sh/v1/sessions')).status).toBe(429)
  expect(fetcher).toHaveBeenCalledTimes(3)
  fetcher.mockClear().mockImplementation(async () => new Response('', { status: 429, headers: { 'retry-after': '120' } }))
  expect((await send('https://api.vetta.sh/v1/sessions')).status).toBe(429)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
