import { z } from 'zod'

// Placeholder. EventBrief, EventPlan, ApprovedAction, ActionResult and EventSummary
// land here per docs/contracts-draft.md once the team agrees on them.
export const CONTRACTS_VERSION = '0.0.0'

export const HealthResponse = z.object({
  ok: z.boolean(),
  contractsVersion: z.string(),
})
export type HealthResponse = z.infer<typeof HealthResponse>
