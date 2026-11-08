import { createClient } from '@usenaive-sdk/managed-agents'
import { ApiError } from '../events/errors'
import type { PlanningRecord, PlanningRepository } from './repository'

// Inspect completion without resending a command or approving a provider action.
export async function refreshCompanyStatus(repository: PlanningRepository, record: PlanningRecord, env: NodeJS.ProcessEnv, signal = AbortSignal.timeout(8_000)): Promise<PlanningRecord> {
  const arrangement = record.view.arrangement
  const binding = record.companySession
  if (arrangement?.status !== 'preparing' || !binding || binding.arrangementId !== arrangement.id
    || record.view.status !== 'ready' || record.view.inquiry?.id !== arrangement.inquiryId
    || record.pending || record.view.inquiry?.delivery || !env.NAIVE_API_KEY || !env.NAIVE_COMPANY_AGENT_ID) return record
  const client = createClient({ apiKey: env.NAIVE_API_KEY, baseUrl: 'https://api.vetta.sh',
    fetch: (input, init) => fetch(input, { ...init, signal }) })
  const session = await client.sessions.get(binding.id)
  if (session.agent_id !== env.NAIVE_COMPANY_AGENT_ID || session.metadata?.conversationId !== record.id
    || session.metadata?.arrangementId !== arrangement.id || session.pending_actions?.length) return record
  const failed = ['failed', 'cancelled'].includes(session.status) || session.status === 'idle' && session.stop_reason === 'error'
  if (!failed && (session.status !== 'idle' || session.stop_reason !== 'end_turn')) return record
  let completed = failed
  if (!failed) {
    let cursor = 0
    let requested = false
    // The setup turn also ends normally. Only a processed arrangement message counts.
    while (cursor < session.last_seq) {
      const page = await client.sessions.events(binding.id, { after_seq: cursor, limit: 100 })
      const events = page.data.filter(event => event.seq > cursor && event.seq <= session.last_seq)
      if (!events.length) return record
      for (const event of events) {
        if (event.type === 'message.completed' && event.data.role === 'user'
          && event.data.client_message_id === `arrangement-turn:${arrangement.id}:arrangement_requested:initial`) requested = true
        if (requested && event.type === 'session.idle' && event.seq === session.last_seq) completed = true
      }
      cursor = Math.max(...events.map(event => event.seq))
    }
  }
  if (!completed) return record
  const latestSession = await client.sessions.get(binding.id)
  if (latestSession.last_seq !== session.last_seq || latestSession.status !== session.status || latestSession.pending_actions?.length) return record
  const current = await repository.get(record.customerId, record.id)
  if (!current || current.companySession?.id !== binding.id || current.view.arrangement?.id !== arrangement.id
    || current.view.arrangement.status !== 'preparing' || current.view.status !== 'ready'
    || current.view.inquiry?.id !== arrangement.inquiryId || current.pending || current.view.inquiry?.delivery) return current ?? record
  const saved = await repository.compareAndSet(current, { ...current, view: { ...current.view,
    version: current.view.version + 1, arrangement: { ...current.view.arrangement, status: 'needs_attention',
      detail: 'Your request is saved, but we could not prepare the supplier inquiry. No supplier email is confirmed sent. We need to check the setup before continuing.' } } })
  if (!saved) throw new ApiError(503, 'state_changed', 'The arrangement changed. Check its saved status again.')
  return saved
}
