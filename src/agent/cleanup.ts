import type { ResearchCheckpointStore, ResearchCleanup } from '../server/research-checkpoint'
import type { ResearchSession } from './session'

// Confirmations are per resource: a late session can arrive after its definition was deleted.
export async function cleanupResearchResources(options: {
  runId: string
  sessionId: string | null
  agentId: string | null
  sessionStopped?: boolean
  sessionOnly?: boolean
  timeoutMs: number
  checkpoints: ResearchCheckpointStore
  session: ResearchSession
}): Promise<ResearchCleanup> {
  const { checkpoints, session, runId, sessionId, agentId } = options
  const previous = (await checkpoints.read(runId))?.cleanup
  let sessionStopped = !sessionId || options.sessionStopped === true ||
    (previous?.sessionId === sessionId && (previous.sessionStopped === true || previous.confirmed))
  let agentDeleted = !agentId ||
    (previous?.agentId === agentId && (previous.agentDeleted === true || previous.confirmed))
  const perCallMs = Math.max(1, Math.floor(options.timeoutMs / (options.sessionOnly ? 1 : 2)))
  if (!sessionStopped) {
    // Cancel is idempotent and accepts a documented terminal conflict; a GET must not gate it.
    try { await session.cancel(sessionId!, AbortSignal.timeout(perCallMs)); sessionStopped = true }
    catch { /* Retain an explicit unresolved stop while still attempting definition cleanup. */ }
  }
  if (!options.sessionOnly && !agentDeleted) {
    try { await session.deleteAgent(agentId!, AbortSignal.timeout(perCallMs)); agentDeleted = true }
    catch { /* A failed deletion must remain retryable without repeating a confirmed stop. */ }
  }
  const cleanup = { sessionId, agentId, sessionStopped, agentDeleted, confirmed: sessionStopped && agentDeleted }
  await checkpoints.recordCleanup(runId, cleanup)
  return cleanup
}
