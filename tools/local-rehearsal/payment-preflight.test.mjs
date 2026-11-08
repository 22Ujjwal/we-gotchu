import assert from 'node:assert/strict'
import test from 'node:test'
import { checkPaymentEnvironment } from './payment-preflight.mjs'

const env = {
  NODE_ENV: 'development',
  PLANNING_LOCAL_DB_DIR: '.scratch/local-planning-db',
  STRIPE_SECRET_KEY: 'sk_test_controlled_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_controlled_fixture',
}

test('accepts explicit local sandbox configuration without returning credentials', () => {
  const result = checkPaymentEnvironment('STRIPE_WEBHOOK_SECRET=fixture\n', env)
  assert.deepEqual(result, { ok: true, issues: [] })
  assert.equal(JSON.stringify(result).includes(env.STRIPE_SECRET_KEY), false)
})

test('rejects duplicate assignments even when the loaded value looks valid', () => {
  const result = checkPaymentEnvironment('STRIPE_WEBHOOK_SECRET=first\n export STRIPE_WEBHOOK_SECRET =second\n', env)
  assert.equal(result.ok, false)
  assert.deepEqual(result.issues, ['Duplicate environment entry: STRIPE_WEBHOOK_SECRET'])
})

test('rejects live keys, missing signing secret and nonlocal runtime', () => {
  const result = checkPaymentEnvironment('', { ...env, NODE_ENV: 'production', PLANNING_LOCAL_DB_DIR: '', STRIPE_SECRET_KEY: 'sk_live_controlled_fixture', STRIPE_WEBHOOK_SECRET: '' })
  assert.equal(result.ok, false)
  assert.equal(result.issues.length, 4)
  assert.equal(JSON.stringify(result).includes('sk_live_controlled_fixture'), false)
})
