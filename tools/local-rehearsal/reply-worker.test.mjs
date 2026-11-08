import test from 'node:test'
import assert from 'node:assert/strict'
import { runReplyWorker } from './reply-worker.mjs'

test('calls the existing authenticated endpoint sequentially without exposing response content', async () => {
  const calls = []
  const reports = []
  const pauses = []
  const result = await runReplyWorker({ baseUrl: 'http://localhost:3000', secret: 'controlled-secret', iterations: 2,
    intervalMs: 10, fetcher: async (url, options) => {
      calls.push({ url, options })
      return Response.json({ processed: calls.length === 1 ? 1 : 0, privateContent: 'never report this' })
    }, sleep: async ms => pauses.push(ms), report: entry => reports.push(entry) })
  assert.equal(result.processed, 1)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'http://localhost:3000/api/planning/reply-jobs')
  assert.equal(calls[0].options.headers.authorization, 'Bearer controlled-secret')
  assert.equal(calls[0].options.redirect, 'error')
  assert.deepEqual(pauses, [10])
  assert.deepEqual(reports, [{ iteration: 1, processed: 1 }, { iteration: 2, processed: 0 }])
})

test('rejects remote endpoints and stops after an uncertain invocation instead of retrying', async () => {
  let calls = 0
  const fetcher = async () => { calls++; throw new Error('private provider detail') }
  await assert.rejects(runReplyWorker({ baseUrl: 'https://example.com', secret: 'secret', fetcher }), /local HTTP/)
  assert.equal(calls, 0)
  await assert.rejects(runReplyWorker({ baseUrl: 'http://127.0.0.1:3000', secret: 'secret', iterations: 3, fetcher }),
    /outcome is unconfirmed/)
  assert.equal(calls, 1)
})

test('rejects missing authorization and malformed replies without printing response bodies', async () => {
  await assert.rejects(runReplyWorker({ baseUrl: 'http://localhost:3000', secret: '' }), /CRON_SECRET/)
  await assert.rejects(runReplyWorker({ baseUrl: 'http://localhost:3000', secret: 'secret',
    fetcher: async () => new Response('private body', { status: 401 }) }), /HTTP 401/)
  await assert.rejects(runReplyWorker({ baseUrl: 'http://localhost:3000', secret: 'secret',
    fetcher: async () => Response.json({ processed: -1 }) }), /Invalid worker result/)
})
