import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTestPlanningRepository } from '../db/client'
import type { PlanningRecord } from './repository'

function record(id = 'conversation'): PlanningRecord {
  return {
    id, customerId: 'alice', createRequestId: 'create-1', initialMessage: 'A party', revision: 0,
    sessionId: null, sequence: 0, pending: null,
    requests: {},
    view: { id, version: 0, status: 'working', messages: [], proposal: null, selections: [], progress: null, error: null },
  }
}

describe('durable planning repository', () => {
  it('migrates and restores conversations after closing and reopening the database', async () => {
    const path = await mkdtemp(join(tmpdir(), 'planning-db-'))
    try {
      const first = await createTestPlanningRepository(path)
      const saved = record()
      saved.sessionId = 'hosted-session'
      saved.sequence = 17
      await first.repository.insert(saved)
      await first.close()
      const reopened = await createTestPlanningRepository(path)
      expect(await reopened.repository.get('alice', saved.id)).toEqual(saved)
      expect(await reopened.repository.get('bob', saved.id)).toBeNull()
      await reopened.close()
    } finally {
      await rm(path, { recursive: true, force: true })
    }
  })

  it('enforces per-customer create deduplication and atomic revisions', async () => {
    const db = await createTestPlanningRepository()
    try {
      const original = record()
      expect(await db.repository.insert(original)).toEqual(original)
      expect(await db.repository.insert(record('duplicate'))).toEqual(original)
      const results = await Promise.all([
        db.repository.compareAndSet(original, { ...original, sequence: 1 }),
        db.repository.compareAndSet(original, { ...original, sequence: 2 }),
      ])
      expect(results.filter(Boolean)).toHaveLength(1)
      expect((await db.repository.get('alice', original.id))?.revision).toBe(1)
      expect(await db.repository.compareAndSet({ ...original, customerId: 'bob' }, original)).toBeNull()
    } finally {
      await db.close()
    }
  })
})
