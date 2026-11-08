import { isBlocked, type ApprovalSnapshot } from './approvals'
import type { PlanningActivity } from './contract'

export function researchActivity(sessions: ApprovalSnapshot[], events: { type: string; data: unknown }[]): PlanningActivity[] {
  const names = new Map<string, string>()
  for (const event of events) {
    if (event.type !== 'thread.created' || !event.data || typeof event.data !== 'object') continue
    const { thread_id: id, member } = event.data as Record<string, unknown>
    if (typeof id === 'string' && typeof member === 'string') names.set(id, member)
  }
  return sessions.map((session, index) => {
    const name = index === 0 ? 'Event lead' : names.get(session.id) ?? 'Research teammate'
    if (['failed', 'cancelled'].includes(session.status ?? '') || ['error', 'budget_paused', 'max_iterations', 'context_exhausted', 'interrupted'].includes(session.stop_reason ?? '')) {
      return { name, status: 'failed', detail: 'Stopped before completing this work.' }
    }
    if (isBlocked(session)) return { name, status: 'blocked', detail: 'Paused for an internal research review.' }
    if (session.stop_reason === 'awaiting_delegation') return { name, status: 'waiting', detail: 'Waiting for research teammates.' }
    if (['running', 'queued'].includes(session.status ?? '')) return { name, status: 'working', detail: 'Working on options.' }
    if (session.structured_output && ['idle', 'completed'].includes(session.status ?? '')) return { name, status: 'done', detail: 'Research response received.' }
    return { name, status: 'waiting', detail: 'Waiting for the next update.' }
  })
}
