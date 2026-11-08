#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Presence and local safety checks only. No database, provider or network access.
export function checkDemoEnvironment(fileText, env) {
  const issues = []
  const seen = new Set()
  for (const line of fileText.split(/\r?\n/)) {
    const name = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=/)?.[1]
    if (!name) continue
    if (seen.has(name)) issues.push(`Duplicate environment entry: ${name}`)
    seen.add(name)
  }
  if (env.VITE_LOCAL_PREVIEW === 'true') issues.push('VITE_LOCAL_PREVIEW must be disabled for the connected demo.')
  if (env.NODE_ENV !== 'development') issues.push('NODE_ENV must be development for this controlled local rehearsal.')
  if (!env.PLANNING_LOCAL_DB_DIR?.trim()) issues.push('PLANNING_LOCAL_DB_DIR must select the local database.')
  function group(names, invalid = []) {
    const missing = names.filter(name => !env[name]?.trim())
    return { configured: !issues.length && !missing.length && !invalid.length, missing, invalid }
  }
  const researchNames = ['CLERK_SECRET_KEY', 'VITE_CLERK_PUBLISHABLE_KEY', 'NAIVE_API_KEY', 'NAIVE_PLANNING_AGENT_ID']
  const mailInvalid = []
  if (env.PLANNING_TOOLS_SECRET && env.PLANNING_TOOLS_SECRET.length < 32) mailInvalid.push('PLANNING_TOOLS_SECRET must contain at least 32 characters.')
  if (env.PLANNING_TEST_SUPPLIER_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.PLANNING_TEST_SUPPLIER_EMAIL)) mailInvalid.push('PLANNING_TEST_SUPPLIER_EMAIL must be an email address.')
  if (env.PLANNING_TEST_SUPPLIER_EMAIL && env.PLANNING_TEST_SUPPLIER_EMAIL.trim().toLowerCase() === env.AGENTMAIL_INBOX_ID?.trim().toLowerCase()) mailInvalid.push('PLANNING_TEST_SUPPLIER_EMAIL must differ from the sending inbox for independent reply evidence.')
  const paymentInvalid = []
  if (env.STRIPE_SECRET_KEY && !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY)) paymentInvalid.push('STRIPE_SECRET_KEY must be a test key.')
  if (env.STRIPE_WEBHOOK_SECRET && !env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) paymentInvalid.push('STRIPE_WEBHOOK_SECRET must be a webhook signing secret.')
  const groups = {
    research: group(researchNames),
    controlledMail: group([...researchNames, 'NAIVE_COMPANY_AGENT_ID', 'NAIVE_COMPANY_IDENTITY_ID', 'NAIVE_COMPANY_OUTCOME_ID',
      'PLANNING_TOOLS_SECRET', 'AGENTMAIL_API_KEY', 'AGENTMAIL_INBOX_ID', 'AGENTMAIL_WEBHOOK_SECRET', 'PLANNING_TEST_SUPPLIER_EMAIL'], mailInvalid),
    recovery: group(['CRON_SECRET']),
    sandboxPayment: group(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'], paymentInvalid),
  }
  return { ok: Object.values(groups).every(value => value.configured), liveVerified: false, issues, groups }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkDemoEnvironment(await readFile('.env.local', 'utf8'), process.env)
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.ok ? 0 : 1
  } catch {
    console.error('Could not read the local environment file.')
    process.exitCode = 1
  }
}
