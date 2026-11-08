import { z } from 'zod'

const id = z.string().min(1).max(128)
const requestId = id.describe('Stable ID for this exact action. Reuse it after a lost response; never invent a new ID to retry.')
const conversationId = id.describe('The saved Arrange conversation ID returned by start_event.')
const expectedVersion = z.number().int().nonnegative().describe('The last saved version returned by Arrange. Refresh after a conflict.')
const message = z.string().trim().min(1).max(8000).describe('Event requirements or requested changes; this does not authorize outreach or payment.')
export const toolSchemas = {
  arrange_get_capabilities: z.object({}).strict(),
  arrange_start_event: z.object({ requestId, message }).strict(),
  arrange_get_event: z.object({ conversationId }).strict(),
  arrange_refine_event: z.object({ conversationId, requestId, expectedVersion, message }).strict(),
  arrange_toggle_selection: z.object({ conversationId, requestId, expectedVersion, optionId: id }).strict(),
}
export type ToolName = keyof typeof toolSchemas

const sourceUrl = z.url().max(4000).refine(value => {
  const url = new URL(value)
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
})
const text = z.string().max(8000)
const option = z.object({
  id, kind: z.enum(['venue', 'supply']), name: text, url: sourceUrl, why: text,
  facts: z.array(z.object({ label: text, value: text, sourceUrl, quote: text, basis: z.enum(['published', 'estimate']) })).max(50),
  unknowns: z.array(text).max(50),
})
/** Allowlist strips internal approvals, provider references and all future unknown fields. */
export const publicPlanningSchema = z.object({
  id, version: z.number().int().nonnegative(), status: z.enum(['working', 'ready', 'failed', 'uncertain', 'blocked']),
  proposal: z.object({ summary: text, nextQuestion: text.nullable(), options: z.array(option).max(30) }).nullable(),
  selections: z.array(option).max(30), progress: text.nullable(),
})
