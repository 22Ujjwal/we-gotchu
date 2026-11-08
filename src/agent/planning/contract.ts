import { z } from 'zod'

const text = z.string().trim().min(1)
const publicUrl = z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol), 'Use an HTTP source link.')
export const planningOptionSchema = z.object({
  id: text, kind: z.enum(['venue', 'supply']), name: text, url: publicUrl, why: text,
  facts: z.array(z.object({
    label: text, value: text, sourceUrl: publicUrl, quote: text,
    basis: z.enum(['published', 'estimate']),
  }).strict()),
  unknowns: z.array(text),
}).strict()
export const planningProposalSchema = z.object({
  summary: text, nextQuestion: text.nullable(), options: z.array(planningOptionSchema),
}).strict().refine(value => new Set(value.options.map(option => option.id)).size === value.options.length, 'Option IDs must be unique.')
export type PlanningOption = z.infer<typeof planningOptionSchema>
export type PlanningProposal = z.infer<typeof planningProposalSchema>

const requestId = text.max(128)
export const planningCreateSchema = z.object({ requestId, message: text.max(8000) }).strict()
const version = z.number().int().nonnegative()
export const planningCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('message'), requestId, expectedVersion: version, message: text.max(8000) }).strict(),
  z.object({ kind: z.literal('confirm'), requestId, expectedVersion: version, approvalId: text, decision: z.enum(['allow', 'deny']) }).strict(),
  z.object({ kind: z.literal('select'), requestId, expectedVersion: version, optionId: text }).strict(),
])
export type PlanningCommand = z.infer<typeof planningCommandSchema>
export type PlanningMessage = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string }
export const planningApprovalSchema = z.object({ id: text, tool: text, arguments: z.record(z.string(), z.unknown()) }).strict()
export type PlanningApproval = z.infer<typeof planningApprovalSchema>
export const planningActivitySchema = z.object({
  name: text, status: z.enum(['working', 'waiting', 'blocked', 'done', 'failed']), detail: text,
}).strict()
export type PlanningActivity = z.infer<typeof planningActivitySchema>
export type PlanningView = {
  id: string
  version: number
  status: 'working' | 'ready' | 'failed' | 'uncertain' | 'blocked'
  messages: PlanningMessage[]
  proposal: PlanningProposal | null
  selections: PlanningOption[]
  progress: string | null
  error: string | null
  activity?: PlanningActivity[]
  approvals?: PlanningApproval[]
}

// Server-only implementations satisfy this interface; the browser only receives PlanningView.
export interface PlanningAgent {
  start(input: { conversationId: string; requestId: string; message: string }): Promise<{ sessionId: string; sequence: number }>
  send(input: { sessionId: string; requestId: string; message: string; selections: PlanningOption[] }): Promise<{ sequence: number }>
  confirm?(input: { sessionId: string; approvalId: string; decision: 'allow' | 'deny' }): Promise<void>
  read(input: { sessionId: string; afterSequence: number; approvalId?: string }): Promise<{
    status: PlanningView['status']; sequence: number; proposal: PlanningProposal | null; progress: string | null; error: string | null; approvals?: PlanningApproval[]; activity?: PlanningActivity[]
    confirmation?: { id: string; state: 'pending' | 'closed' }
  }>
}
