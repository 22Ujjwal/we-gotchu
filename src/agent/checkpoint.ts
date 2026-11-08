import type { ResearchInput, ResearchResult, Run } from '../contracts'

// Private server state, deliberately excluded from EventView and model prompts.
export type ResearchCleanup = { agentId: string | null; sessionId: string | null; confirmed: boolean; sessionStopped?: boolean; agentDeleted?: boolean }
export type ResearchCheckpoint = {
  cleanup?: ResearchCleanup | null
  sessionStopped?: boolean
  version: number
  input: ResearchInput
  stage: 'discovery' | 'enrichment' | 'agent' | 'session' | 'ranking' | 'correcting' | 'cleanup' | 'delete_agent' | 'done' | 'uncertain'
  evidence: ResearchResult | null
  result: ResearchResult | null
  agentId: string | null
  sessionId: string | null
  lastSequence: number
  correctionAfter: number | null
  correctionsUsed: number
  expiresAt: string
}
export interface ResearchCheckpointStore {
  initialize(checkpoint: ResearchCheckpoint): Promise<void>
  recordCleanup(runId: string, cleanup: ResearchCleanup): Promise<void>
  readBySession(sessionId: string): Promise<ResearchCheckpoint | null>
  read(runId: string): Promise<ResearchCheckpoint | null>
  // Atomically fences the lease, revision and cancellation, saves state and deduplicates progress.
  save(run: Run, expectedVersion: number, checkpoint: ResearchCheckpoint, message?: string): Promise<boolean>
}
