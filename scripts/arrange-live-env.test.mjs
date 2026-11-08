import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEnv, updateEnv } from './arrange-live-env.mjs'

test('sequential setup phases retain every value and quote shell metacharacters', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arrange-env-'))
  const file = join(dir, '.env')
  try {
    writeFileSync(file, 'EXISTING=value\n')
    updateEnv(file, { ARRANGE_AGENTMAIL_INBOX_ID: 'arrange@example.test' })
    updateEnv(file, { ARRANGE_VENUE_EMAIL: 'venue@example.test', ARRANGE_MCP_BEARER: "a'$(false)$b" })
    assert.deepEqual(readEnv(file), { EXISTING: 'value', ARRANGE_AGENTMAIL_INBOX_ID: 'arrange@example.test', ARRANGE_VENUE_EMAIL: 'venue@example.test', ARRANGE_MCP_BEARER: "a'$(false)$b" })
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.ok(readFileSync(file, 'utf8').includes('ARRANGE_AGENTMAIL_INBOX_ID='))
    assert.throws(() => updateEnv(file, { BAD: 'line\nbreak' }), /single line/)
  } finally { rmSync(dir, { recursive: true }) }
})
