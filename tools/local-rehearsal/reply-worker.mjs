import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

export async function runReplyWorker({ baseUrl = 'http://localhost:3000', secret, iterations = 1,
  intervalMs = 5000, fetcher = fetch, sleep: pause = sleep, report = () => {} } = {}) {
  const base = new URL(baseUrl)
  if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password) {
    throw new Error('The worker requires a local HTTP application URL.')
  }
  if (!secret) throw new Error('CRON_SECRET must match the running local application.')
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 120 || !Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error('Use 1 to 120 iterations and a nonnegative interval.')
  }
  const url = new URL('/api/planning/reply-jobs', base).href
  let processed = 0
  for (let iteration = 1; iteration <= iterations; iteration++) {
    let response
    try {
      response = await fetcher(url, { headers: { authorization: `Bearer ${secret}` }, redirect: 'error',
        signal: AbortSignal.timeout(120000) })
    } catch {
      // A lost response can follow successful interpretation; inspect saved state before another run.
      throw new Error('Worker outcome is unconfirmed. Inspect saved replies before restarting.')
    }
    if (!response.ok) throw new Error(`Worker returned HTTP ${response.status}. Inspect saved state before restarting.`)
    let result
    try { result = await response.json() } catch { throw new Error('Invalid worker result. Inspect saved state before restarting.') }
    if (!Number.isSafeInteger(result?.processed) || result.processed < 0) throw new Error('Invalid worker result.')
    processed += result.processed
    report({ iteration, processed: result.processed })
    if (iteration < iterations) await pause(intervalMs)
  }
  return { processed }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.env.NODE_ENV !== 'development' || !process.env.PLANNING_LOCAL_DB_DIR) {
      throw new Error('Requires explicit local development configuration.')
    }
    await runReplyWorker({ secret: process.env.CRON_SECRET, baseUrl: process.env.LOCAL_APP_URL,
      iterations: Number(process.argv[2] ?? 1), report: result => console.log(JSON.stringify(result)) })
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Local reply worker failed.')
    process.exitCode = 1
  }
}
