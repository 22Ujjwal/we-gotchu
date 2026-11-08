import { expect, test, vi } from 'vitest'
import { withReplyProcessing } from './reply-dispatch'

test('acknowledges durable receipt without waiting for interpretation and registers background work', async () => {
  let finish!: () => void
  const processing = new Promise<void>(resolve => { finish = resolve })
  const process = vi.fn(() => processing)
  const tasks: Promise<unknown>[] = []
  const receive = vi.fn(async () => Response.json({ status: 'processed' }))
  const handler = withReplyProcessing(receive, process, task => { tasks.push(task) })
  expect((await handler(new Request('https://example.com'))).status).toBe(200)
  expect(process).toHaveBeenCalledTimes(1)
  expect(tasks).toHaveLength(1)
  finish()
  await tasks[0]
})

test.each([400, 401, 503])('does not start work after an unsuccessful receipt response %i', async status => {
  const process = vi.fn()
  const register = vi.fn()
  const handler = withReplyProcessing(async () => new Response(null, { status }), process, register)
  expect((await handler(new Request('https://example.com'))).status).toBe(status)
  expect(process).not.toHaveBeenCalled()
  expect(register).not.toHaveBeenCalled()
})

test('retains a successful acknowledgement if background processing fails without leaking errors', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const tasks: Promise<unknown>[] = []
    const handler = withReplyProcessing(async () => new Response(), async () => { throw new Error('private data') }, task => { tasks.push(task) })
    expect((await handler(new Request('https://example.com'))).status).toBe(200)
    await expect(tasks[0]).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith('Supplier reply processing interrupted; saved jobs remain available for recovery.')
  } finally { log.mockRestore() }
})
