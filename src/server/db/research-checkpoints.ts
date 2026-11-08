import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import type { ResearchCheckpointStore } from '../../agent/checkpoint'
import type { Db } from './store-impl'
import { events, progressEntries, runs } from './schema'

class RejectedCheckpoint extends Error {}

export function createResearchCheckpointStore(db: Db): ResearchCheckpointStore {
  return {
    async initialize(checkpoint) {
      const { input } = checkpoint
      await db.update(runs).set({ researchCheckpoint: checkpoint })
        .where(and(eq(runs.id, input.runId), eq(runs.eventId, input.eventId),
          eq(runs.briefRevision, input.briefRevision), eq(runs.state, 'running'), isNull(runs.researchCheckpoint)))
    },
    async recordCleanup(runId, cleanup) {
      await db.update(runs).set({
        researchCheckpoint: sql`jsonb_set(${runs.researchCheckpoint}, '{cleanup}', ${JSON.stringify(cleanup)}::jsonb)`,
      }).where(eq(runs.id, runId))
    },
    async readBySession(sessionId) {
      const [row] = await db.select({ checkpoint: runs.researchCheckpoint }).from(runs).where(eq(runs.naiveSessionId, sessionId))
      return row?.checkpoint ?? null
    },
    async read(runId) {
      const [row] = await db.select({ checkpoint: runs.researchCheckpoint }).from(runs).where(eq(runs.id, runId))
      return row?.checkpoint ?? null
    },
    async save(run, expectedVersion, checkpoint, message) {
      if (!run.advancingUntil || checkpoint.input.runId !== run.runId ||
          checkpoint.input.eventId !== run.eventId || checkpoint.input.briefRevision !== run.briefRevision) return false
      try {
        return await db.transaction(async tx => {
          // Match the event-first lock order used by brief updates and result publication.
          const [event] = await tx.update(events).set({
            progressSequence: message ? sql`${events.progressSequence} + 1` : sql`${events.progressSequence}`,
          }).where(and(eq(events.id, run.eventId), eq(events.briefRevision, run.briefRevision),
            isNull(events.cancelRequestedAt))).returning()
          if (!event) throw new RejectedCheckpoint()
          const [saved] = await tx.update(runs).set({
            researchCheckpoint: sql`jsonb_set(${JSON.stringify({ ...checkpoint, version: expectedVersion + 1 })}::jsonb, '{cleanup}', coalesce(${runs.researchCheckpoint}->'cleanup', 'null'::jsonb))`,
            naiveSessionId: checkpoint.sessionId,
            lastSequence: sql`greatest(${runs.lastSequence}, ${checkpoint.lastSequence})`,
            correctionsUsed: checkpoint.correctionsUsed,
          }).where(and(eq(runs.id, run.runId), eq(runs.state, 'running'),
            eq(runs.advancingUntil, new Date(run.advancingUntil!)), gt(runs.advancingUntil, new Date()),
            sql`${runs.researchCheckpoint}->>'version' = ${String(expectedVersion)}`)).returning({ id: runs.id })
          if (!saved) throw new RejectedCheckpoint()
          if (message) await tx.insert(progressEntries).values({
            eventId: run.eventId, sequence: event.progressSequence, actor: 'agent', message, createdAt: new Date(),
          })
          return true
        })
      } catch (error) {
        if (error instanceof RejectedCheckpoint) return false
        throw error
      }
    },
  }
}
