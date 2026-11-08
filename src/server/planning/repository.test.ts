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
  it('does not let idle or already followed-up arrangements starve a ready reply', async () => {
    const db = await createTestPlanningRepository()
    const venue = { id: 'venue', kind: 'venue' as const, name: 'Room', url: 'https://example.com', why: 'Room', facts: [], unknowns: [] }
    const reply = { id: 'reply', status: 'ready' as const, message: {
      provider: 'controlled', messageId: 'message', from: 'supplier@example.com', to: ['planner@example.com'],
      threadId: 'thread', inReplyTo: 'inquiry-message',
      subject: 'Terms', text: 'Please confirm the time.', receivedAt: '2026-11-08T10:00:00Z',
      originalRef: 'controlled:message', mode: 'simulated' as const,
    } }
    try {
      for (const id of ['idle', 'followed-up', 'latest-unready', 'pending', 'payment', 'actionable']) {
        const saved = record(id)
        saved.createRequestId = id
        saved.view.status = 'ready'
        saved.view.arrangement = { id: `arrangement-${id}`, inquiryId: 'inquiry', status: 'awaiting_reply',
          requestedAt: '2026-11-08T09:00:00Z', selections: [venue], detail: 'Waiting', controlled: true }
        saved.view.inquiry = { id: 'inquiry', revision: 1, status: 'draft', recipient: 'supplier@example.com',
          subject: 'Inquiry', text: 'Party', venue, contextMessageIds: [], contactSourceUrl: null,
          updatedAt: '2026-11-08T09:00:00Z', replies: id === 'idle' ? [] : [reply],
        }
        if (id === 'latest-unready') saved.view.inquiry!.replies!.push({ ...reply, id: 'newer', status: 'received' })
        if (id === 'pending') saved.pending = { requestId: 'pending', kind: 'message', message: 'Changed time', selections: [], expiresAt: 0 }
        if (id === 'payment') saved.view.paymentLink = { eventId: 'event', planId: 'plan', planRevision: 1, offerId: 'offer', offerRevision: 1 }
        if (id === 'followed-up') saved.companyFollowups = { reply: { status: 'uncertain',
          content: { recipient: 'supplier@example.com', subject: 'Follow up', text: 'What time?' } } }
        await db.repository.insert(saved)
      }
      expect((await db.repository.pendingArrangements!(1)).map(item => item.id)).toEqual(['actionable'])
      const ready = (await db.repository.get('alice', 'actionable'))!
      await db.repository.compareAndSet(ready, { ...ready, companyFollowups: { reply: { status: 'accepted',
        content: { recipient: 'supplier@example.com', subject: 'Follow up', text: 'What time?' } } } })
      expect(await db.repository.pendingArrangements!(1)).toEqual([])
      for (const status of ['requested', 'preparing'] as const) {
        const pending = record(status)
        pending.createRequestId = status
        pending.view.arrangement = { ...ready.view.arrangement!, status }
        await db.repository.insert(pending)
      }
      expect(await db.repository.pendingArrangements!(1)).toHaveLength(1)
      expect((await db.repository.pendingArrangements!(5)).map(item => item.id).sort()).toEqual(['preparing', 'requested'])
    } finally { await db.close() }
  })

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
