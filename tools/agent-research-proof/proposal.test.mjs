import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowedResearchCall } from './proposal.mjs'
const action = { name: 'monid.monid_run', args: { provider: 'channel3', endpoint: '/v1/search', maxCost: 0.05 } }
test('research proof permits a priced search, but not transactions or unbounded spend', () => {
  assert.equal(allowedResearchCall(action, 0), true)
  assert.equal(allowedResearchCall({ ...action, args: { ...action.args, endpoint: '/purchase' } }, 0), false)
  assert.equal(allowedResearchCall({ ...action, args: { ...action.args, maxCost: undefined } }, 0), false)
  assert.equal(allowedResearchCall(action, 8), false)
})
