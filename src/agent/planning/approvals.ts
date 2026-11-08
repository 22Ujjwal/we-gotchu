import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { PlanningApproval } from './contract'

export type ApprovalSnapshot = { id: string; stop_reason: string | null; parent_session_id?: string | null; pending_actions?: unknown[] }
const actionSchema = z.object({ kind: z.literal('tool'), tool_call_id: z.string(), name: z.string(), args: z.record(z.string(), z.unknown()) })
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}
function researchTool(name: string, args: Record<string, unknown>) {
  if (['monid.monid_discover', 'monid.monid_inspect', 'monid.monid_get_run'].includes(name)) return true
  if (name !== 'monid.monid_run') return false
  return args.provider === 'litescrape' && args.endpoint === '/google/maps'
    || args.provider === 'context.dev' && args.endpoint === '/web/scrape/markdown'
    || args.provider === 'channel3' && typeof args.endpoint === 'string'
      && (args.endpoint === '/v1/search' || /^\/v1\/products\/[^/]+$/.test(args.endpoint))
}
export function pendingResearch(sessions: ApprovalSnapshot[]) {
  return sessions.flatMap(session => (session.pending_actions ?? []).flatMap(raw => {
    const parsed = actionSchema.safeParse(raw)
    if (!parsed.success || !researchTool(parsed.data.name, parsed.data.args)) return []
    const action = parsed.data
    // Bind the person's decision to this exact call and arguments, not just a tool name.
    const id = createHash('sha256').update(JSON.stringify(canonical([session.id, action]))).digest('hex')
    const view: PlanningApproval = { id, tool: action.name, arguments: action.args }
    return [{ sessionId: session.id, callId: action.tool_call_id, view }]
  }))
}
export function isBlocked(session: ApprovalSnapshot) {
  return !!session.pending_actions?.length || ['awaiting_approval', 'awaiting_input', 'awaiting_answer'].includes(session.stop_reason ?? '')
}
