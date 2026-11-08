// Local-only development and acceptance runner. No provider credentials are used.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const verify = process.argv.includes('--verify')
const port = Number(process.env.ARRANGE_LOCAL_PORT ?? 3100)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a local port between 1024 and 65535')
const base = `http://127.0.0.1:${port}`
const launcher = join(homedir(), '.local/bin/agent-process')
if (!existsSync(launcher)) throw new Error('Install the agent-process launcher before running this local server')
const scratch = join(root, '.scratch')
mkdirSync(scratch, { recursive: true })
const db = verify ? mkdtempSync(join(tmpdir(), 'arrange-acceptance-')) : join(scratch, 'local-arrange-db')
const env = {
  ...process.env,
  DATABASE_URL: '', ARRANGE_FAKE_PROVIDERS: 'true', ARRANGE_LOCAL_DB_DIR: db,
  ARRANGE_LOCAL_CUSTOMER_ID: 'local-reviewer', ARRANGE_MCP_BEARER: 'local-gate-bearer',
  ARRANGE_AGENTMAIL_WEBHOOK_SECRET: `whsec_${Buffer.from('local-gate-signing-key').toString('base64')}`,
  ARRANGE_STRIPE_WEBHOOK_SECRET: 'local-stripe-gate-secret', APP_URL: base, BASE_URL: base,
  ARRANGE_VENUE_EMAIL: 'venue@botanico.test', ARRANGE_VENUE_NAME: 'Cafe Botanico',
  ARRANGE_SUPPLIER_EMAIL: 'supplies@arrange.test', ARRANGE_SUPPLIER_NAME: 'Table supplies', ARRANGE_TUNNEL_HOST: '',
  ARRANGE_GATE_EVIDENCE: join(scratch, 'arrange-local-evidence.json'),
}
const server = spawn(launcher, ['run', '--name', verify ? 'arrange-local-acceptance' : 'arrange-local', '--ttl', '3600', '--port', String(port), '--', 'bunx', 'vite', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] })
let processId
server.stdout.on('data', chunk => {
  process.stdout.write(chunk)
  processId ??= String(chunk).match(/agent-process id=([a-f0-9]+)/)?.[1]
})
const exited = once(server, 'exit')
async function stop() {
  if (server.exitCode !== null) return
  if (processId) {
    const stopper = spawn(launcher, ['stop', processId], { stdio: 'ignore' })
    await once(stopper, 'exit')
  } else server.kill('SIGTERM')
  await exited
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
if (!verify) {
  console.log(`Open ${base}/arrange. Providers are local fakes; use bun run arrange:verify to exercise the full scripted flow.`)
  const [code] = await exited
  process.exitCode = code ?? 0
} else {
  try {
    let ready = false
    for (let attempt = 0; attempt < 90; attempt++) {
      if (server.exitCode !== null) throw new Error('The local server exited before verification')
      try {
        const response = await fetch(`${base}/api/arrange/local`, { signal: AbortSignal.timeout(5000) })
        if (response.status === 200 && (await response.json()).providers === 'local-fakes') { ready = true; break }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    if (!ready) throw new Error('The local server did not become ready')
    const gate = spawn('bun', ['scripts/arrange-complete-gate.mjs'], { cwd: root, env, stdio: 'inherit' })
    const [code] = await once(gate, 'exit')
    if (code !== 0) throw new Error('Local acceptance failed')
    console.log(`Evidence saved to ${env.ARRANGE_GATE_EVIDENCE}`)
  } finally { await stop() }
}
