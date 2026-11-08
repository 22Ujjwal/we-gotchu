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
  z.object({ kind: z.literal('select'), requestId, expectedVersion: version, optionId: text }).strict(),
])
export type PlanningCommand = z.infer<typeof planningCommandSchema>
export type PlanningMessage = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string }
export type PlanningView = {
  id: string
  version: number
  status: 'working' | 'ready' | 'failed' | 'uncertain'
  messages: PlanningMessage[]
  proposal: PlanningProposal | null
  selections: PlanningOption[]
  progress: string | null
  error: string | null
}

// Server-only implementations satisfy this interface; the browser only receives PlanningView.
export interface PlanningAgent {
  start(input: { conversationId: string; requestId: string; message: string }): Promise<{ sessionId: string; sequence: number }>
  send(input: { sessionId: string; requestId: string; message: string; selections: PlanningOption[] }): Promise<{ sequence: number }>
  read(input: { sessionId: string; afterSequence: number }): Promise<{
    status: PlanningView['status']; sequence: number; proposal: PlanningProposal | null; progress: string | null; error: string | null
  }>
}
