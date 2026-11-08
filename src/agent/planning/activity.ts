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

export function researchProgress(events: { type: string; data: unknown }[]): string {
  const labels: Record<string, string> = {
    'vetta.tools_search': 'Finding research tools', data_search: 'Finding research sources',
    data_describe: 'Checking research sources', data_run: 'Researching venues and supplies',
    'monid.monid_discover': 'Finding research sources', 'monid.monid_inspect': 'Checking research sources',
    'monid.monid_run': 'Researching venues and supplies', 'monid.monid_get_run': 'Reading research results',
    web_search: 'Searching venue and supplier websites', web_fetch: 'Reading venue and supplier pages',
    submit_output: 'Preparing your shortlist',
  }
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]
    if (event.type === 'message.delta' || event.type === 'message.completed') return 'Preparing your event options'
    if (event.type === 'tool.completed') return 'Reviewing research results'
    if (event.type !== 'tool.started' || !event.data || typeof event.data !== 'object') continue
    const data = event.data as Record<string, unknown>
    const name = data.tool_name ?? data.name
    return typeof name === 'string' ? labels[name] ?? 'Researching your event' : 'Researching your event'
  }
  return 'Starting your research'
}
