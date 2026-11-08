import { describe, expect, it } from 'vitest'
import { CONTRACTS_VERSION, HealthResponse } from './index'

describe('contracts', () => {
  it('parses a health response', () => {
    expect(HealthResponse.parse({ ok: true, contractsVersion: CONTRACTS_VERSION }).ok).toBe(true)
  })
})
