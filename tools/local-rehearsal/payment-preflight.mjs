#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function checkPaymentEnvironment(fileText, env) {
  const issues = []
  const seen = new Set()
  for (const line of fileText.split(/\r?\n/)) {
    const name = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=/)?.[1]
    if (!name) continue
    if (seen.has(name)) issues.push(`Duplicate environment entry: ${name}`)
    seen.add(name)
  }
  if (env.NODE_ENV !== 'development') issues.push('NODE_ENV must be development.')
  if (!env.PLANNING_LOCAL_DB_DIR) issues.push('PLANNING_LOCAL_DB_DIR must select the local database.')
  if (!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? '')) issues.push('STRIPE_SECRET_KEY must be a test key.')
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) issues.push('STRIPE_WEBHOOK_SECRET must be configured.')
  return { ok: issues.length === 0, issues }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkPaymentEnvironment(await readFile('.env.local', 'utf8'), process.env)
    console.log(JSON.stringify(result))
    process.exitCode = result.ok ? 0 : 1
  } catch {
    console.error('Could not read the local environment file.')
    process.exitCode = 1
  }
}
