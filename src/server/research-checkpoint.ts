import type { ResearchInput, ResearchResult, Run } from '../contracts'

// Private server state, deliberately excluded from EventView and model prompts.
export type ResearchCleanup = { agentId: string | null; sessionId: string | null; confirmed: boolean; sessionStopped?: boolean; agentDeleted?: boolean; unresolvedOperation?: boolean }
export type ResearchCheckpoint = Pick<Run, 'naiveSessionId' | 'lastSequence' | 'correctionsUsed'> & {
  cleanup?: ResearchCleanup | null
  sessionStopped?: boolean
  readFailures?: number
  investigatedCandidateIds?: string[]
  pendingOperation?: { kind: 'agent' | 'session' | 'correction'; idempotencyKey: string; startedAt: string } | null
  version: number
  input: ResearchInput
  stage: 'discovery' | 'investigating' | 'agent' | 'session' | 'ranking' | 'correcting' | 'cleanup' | 'delete_agent' | 'done' | 'uncertain'
  evidence: ResearchResult | null
  result: ResearchResult | null
  agentId: string | null
  correctionAfter: number | null
  expiresAt: string
}
export interface ResearchCheckpointStore {
  initialize(checkpoint: ResearchCheckpoint): Promise<void>
  recordCleanup(runId: string, cleanup: ResearchCleanup): Promise<void>
  read(runId: string): Promise<ResearchCheckpoint | null>
  // Atomically fences the lease, revision and cancellation, saves state and deduplicates progress.
  save(run: Run, expectedVersion: number, checkpoint: ResearchCheckpoint, message?: string): Promise<boolean>
}
