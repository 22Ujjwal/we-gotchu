import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@usenaive-sdk/managed-agents'
import { z } from 'zod'
import { ApiError, json } from '../events/errors'
import { authorizedInquiryCall } from './company-preparation'
import type { PlanningRepository } from './repository'

const eventSchema = z.object({
  id: z.string(), type: z.string(),
  data: z.object({ session_id: z.string().optional() }).passthrough(),
})

export function verifyCompanySignature(raw: string, headers: Headers, secret: string): void {
  const timestamp = headers.get('vetta-timestamp') ?? ''
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    throw new ApiError(401, 'invalid_signature', 'Invalid webhook signature.')
  }
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest()
  const valid = (headers.get('vetta-signature') ?? '').split(',').some(part => {
    const match = /^v1=([a-fA-F0-9]{64})$/.exec(part.trim())
    return !!match && timingSafeEqual(expected, Buffer.from(match[1], 'hex'))
  })
  if (!valid) throw new ApiError(401, 'invalid_signature', 'Invalid webhook signature.')
}

export function createCompanyWebhook(repository: PlanningRepository, env: NodeJS.ProcessEnv) {
  return async (request: Request): Promise<Response> => {
    if (!env.NAIVE_WEBHOOK_SECRET || !env.NAIVE_API_KEY || !env.NAIVE_COMPANY_AGENT_ID) {
      throw new ApiError(503, 'company_unavailable', 'Company webhook is not configured.')
    }
    const raw = await request.text()
    verifyCompanySignature(raw, request.headers, env.NAIVE_WEBHOOK_SECRET)
    let payload: unknown
    try { payload = JSON.parse(raw) } catch { throw new ApiError(400, 'invalid_event', 'Invalid webhook event.') }
    const parsed = eventSchema.safeParse(payload)
    if (!parsed.success) throw new ApiError(400, 'invalid_event', 'Invalid webhook event.')
    const event = parsed.data
    if (event.type !== 'session.idle') return json({ received: true })
    if (!event.data.session_id) throw new ApiError(400, 'invalid_event', 'Missing session ID.')

    // A failed delivery must remain retryable within the provider's ten-second deadline.
    const signal = AbortSignal.timeout(8_000)
    const client = createClient({ apiKey: env.NAIVE_API_KEY, baseUrl: 'https://api.vetta.sh',
      fetch: (input, init) => fetch(input, { ...init, signal }) })
    const session = await client.sessions.get(event.data.session_id)
    if (session.agent_id !== env.NAIVE_COMPANY_AGENT_ID) return json({ received: true })
    const conversationId = session.metadata?.conversationId
    if (typeof conversationId !== 'string') return json({ received: true })
    const record = await repository.getById(conversationId)
    if (!record?.view.arrangement || record.view.arrangement.id !== session.metadata?.arrangementId) return json({ received: true })
    if (!record.companySession) throw new ApiError(503, 'session_pending', 'Session binding is not saved yet.')
    if (record.companySession.id !== session.id || record.companySession.arrangementId !== record.view.arrangement.id
      || record.view.arrangement.status === 'stale') return json({ received: true })

    // Read current state so a delayed event cannot approve a superseded turn.
    for (const action of session.pending_actions ?? []) {
      const current = await repository.getById(record.id)
      if (!current || !authorizedInquiryCall(current, action, env)) {
        if (current?.view.arrangement && current.view.arrangement.status !== 'stale') {
          const saved = await repository.compareAndSet(current, { ...current, view: { ...current.view,
            version: current.view.version + 1, arrangement: { ...current.view.arrangement, status: 'needs_attention',
              detail: 'The supplier session needs review before its next action can proceed.' } } })
          if (!saved) throw new ApiError(503, 'state_changed', 'Retry the review update.')
        }
        return json({ received: true, needsReview: true })
      }
      try {
        await client.sessions.confirmTool(session.id, { tool_call_id: action.tool_call_id, decision: 'allow', scope: 'call' })
      } catch (error) {
        if (!(error instanceof Error && 'status' in error && error.status === 409)) throw error
        const latest = await client.sessions.get(session.id)
        if (latest.pending_actions?.some(pending => pending.tool_call_id === action.tool_call_id)) throw error
      }
    }
    if (['failed', 'cancelled'].includes(session.status) || session.status === 'idle' && session.stop_reason === 'error') {
      const current = await repository.getById(record.id)
      if (current?.view.arrangement?.status === 'preparing') {
        const saved = await repository.compareAndSet(current, { ...current, view: { ...current.view,
          version: current.view.version + 1, arrangement: { ...current.view.arrangement, status: 'needs_attention',
            detail: 'Your request is saved, but the supplier session stopped before saving an inquiry. We will review it.' } } })
        if (!saved) throw new ApiError(503, 'state_changed', 'Retry the completion update.')
      }
    }
    return json({ received: true })
  }
}
