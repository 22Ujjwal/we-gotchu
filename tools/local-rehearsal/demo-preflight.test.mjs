import test from 'node:test'
import assert from 'node:assert/strict'
import { checkDemoEnvironment } from './demo-preflight.mjs'

const env = { NODE_ENV: 'development', PLANNING_LOCAL_DB_DIR: '.scratch/test',
  CLERK_SECRET_KEY: 'private-clerk', VITE_CLERK_PUBLISHABLE_KEY: 'public-fixture',
  NAIVE_API_KEY: 'private-naive', NAIVE_PLANNING_AGENT_ID: 'planning-fixture',
  NAIVE_COMPANY_AGENT_ID: 'company-fixture', NAIVE_COMPANY_IDENTITY_ID: 'identity-fixture',
  NAIVE_COMPANY_OUTCOME_ID: 'outcome-fixture', PLANNING_TOOLS_SECRET: 'x'.repeat(32),
  AGENTMAIL_API_KEY: 'private-mail', AGENTMAIL_INBOX_ID: 'sender@example.test',
  AGENTMAIL_WEBHOOK_SECRET: 'private-webhook', PLANNING_TEST_SUPPLIER_EMAIL: 'recipient@example.test',
  CRON_SECRET: 'private-cron', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' }

test('reports configuration groups without claiming live readiness or exposing values', () => {
  const result = checkDemoEnvironment('', env)
  assert.equal(result.ok, true)
  assert.equal(result.liveVerified, false)
  assert.equal(result.groups.research.configured, true)
  assert.equal(result.groups.controlledMail.configured, true)
  for (const value of Object.values(env)) if (value.startsWith('private-') || value.includes('@')) assert.equal(JSON.stringify(result).includes(value), false)
})

test('research can be configured while mail and payment remain blocked', () => {
  const result = checkDemoEnvironment('', { NODE_ENV: 'development', PLANNING_LOCAL_DB_DIR: 'fixture',
    CLERK_SECRET_KEY: 'fixture', VITE_CLERK_PUBLISHABLE_KEY: 'fixture', NAIVE_API_KEY: 'fixture', NAIVE_PLANNING_AGENT_ID: 'fixture' })
  assert.equal(result.groups.research.configured, true)
  assert.equal(result.groups.controlledMail.configured, false)
  assert.ok(result.groups.controlledMail.missing.includes('PLANNING_TEST_SUPPLIER_EMAIL'))
  assert.equal(result.groups.sandboxPayment.configured, false)
})

test('rejects production, duplicate entries, self-send, short tool secret and live Stripe keys', () => {
  const result = checkDemoEnvironment('NAIVE_API_KEY=first\nNAIVE_API_KEY=second', { ...env,
    NODE_ENV: 'production', PLANNING_TOOLS_SECRET: 'short', PLANNING_TEST_SUPPLIER_EMAIL: env.AGENTMAIL_INBOX_ID, STRIPE_SECRET_KEY: 'sk_live_private' })
  assert.equal(result.ok, false)
  assert.ok(result.issues.some(issue => issue.includes('Duplicate')))
  assert.equal(result.groups.controlledMail.configured, false)
  assert.equal(result.groups.sandboxPayment.configured, false)
  assert.equal(JSON.stringify(result).includes('sk_live_private'), false)
})

test('rejects fixture preview mode for the connected demo', () => {
  const result = checkDemoEnvironment('', { ...env, VITE_LOCAL_PREVIEW: 'true' })
  assert.equal(result.ok, false)
  assert.equal(result.groups.research.configured, false)
  assert.ok(result.issues.some(issue => issue.includes('VITE_LOCAL_PREVIEW')))
})
