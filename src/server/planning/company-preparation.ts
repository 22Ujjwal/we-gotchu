import { createClient } from '@usenaive-sdk/managed-agents'
import { inquiryFieldsSchema } from '../../agent/planning/contract'
import { inquiryToolAccess, readInquiryToolAccess } from './company-tools'
import type { PlanningRecord, PlanningRepository } from './repository'

export function authorizedInquiryCall(record: PlanningRecord, action: { name: string; args: Record<string, unknown> }, env: NodeJS.ProcessEnv): boolean {
  const arrangement = record.view.arrangement
  const inquiry = record.view.inquiry
  if (env.NODE_ENV !== 'development' || !env.PLANNING_TEST_SUPPLIER_EMAIL || !arrangement?.controlled
    || !['preparing', 'awaiting_reply'].includes(arrangement.status) || inquiry?.id !== arrangement.inquiryId
    || record.pending || record.view.status !== 'ready' || action.name !== 'arrange.save_venue_inquiry') return false
  const fields = inquiryFieldsSchema.safeParse(action.args)
  if (!fields.success || fields.data.recipient !== env.PLANNING_TEST_SUPPLIER_EMAIL
    || fields.data.recipient !== inquiry.recipient || typeof action.args.access !== 'string') return false
  try {
    const scope = readInquiryToolAccess(action.args.access, env.PLANNING_TOOLS_SECRET!)
    const matchesTurn = scope.replyId
      ? arrangement.status === 'awaiting_reply' && inquiry.replies?.at(-1)?.id === scope.replyId && inquiry.replies.at(-1)?.status === 'ready'
      : arrangement.status === 'preparing' && !inquiry.delivery
    return !!matchesTurn && scope.conversationId === record.id && scope.inquiryId === inquiry.id && scope.revision === inquiry.revision
  } catch { return false }
}

export async function continueCompanyReply(repository: PlanningRepository, record: PlanningRecord, env: NodeJS.ProcessEnv): Promise<void> {
  const arrangement = record.view.arrangement
  const inquiry = record.view.inquiry
  const reply = inquiry?.replies?.at(-1)
  const companySession = record.companySession
  if (!arrangement?.controlled || arrangement.status !== 'awaiting_reply' || !inquiry || reply?.status !== 'ready'
    || !companySession || companySession.arrangementId !== arrangement.id || !env.PLANNING_TOOLS_SECRET
    || !env.NAIVE_API_KEY || record.companyFollowups?.[reply.id]) return
  const client = createClient({ apiKey: env.NAIVE_API_KEY, baseUrl: 'https://api.vetta.sh',
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }) })
  let sessionId = record.companyReplyTurns?.[reply.id]?.sessionId
  if (!sessionId && record.companyReplyTurns?.[reply.id]) {
    const sessions = await client.sessions.list({ agent_id: env.NAIVE_COMPANY_AGENT_ID, limit: 100 })
    sessionId = sessions.data.find(session => session.metadata?.arrangementId === arrangement.id
      && session.metadata?.replyId === reply.id)?.id
    if (!sessionId) return
  }
  if (!sessionId) {
    const claimed = await repository.compareAndSet(record, { ...record,
      companyReplyTurns: { ...record.companyReplyTurns, [reply.id]: {} } })
    if (!claimed) return
    const access = inquiryToolAccess({ conversationId: record.id, inquiryId: inquiry.id, revision: inquiry.revision,
      replyId: reply.id, expiresAt: Date.now() + 15 * 60_000 }, env.PLANNING_TOOLS_SECRET)
    try {
      const session = await client.sessions.create({
        agent_id: env.NAIVE_COMPANY_AGENT_ID!, identity: env.NAIVE_COMPANY_IDENTITY_ID, outcome: env.NAIVE_COMPANY_OUTCOME_ID,
        budget_micro_usd: 500_000,
        metadata: { conversationId: record.id, arrangementId: arrangement.id, replyId: reply.id, purpose: 'supplier-reply' },
        message: JSON.stringify({
          task: 'A supplier reply has arrived. Read the saved event and original latestReply. Decide the next useful step. If material terms are missing, write one concise follow-up through save_venue_inquiry. Preserve the supplied recipient. Write natural supplier correspondence without test labels. If complete or declined, report that instead. No booking or payment.',
          draftAccess: access,
        }),
      }, { idempotencyKey: `arrangement-reply:${reply.id}` })
      sessionId = session.id
    } catch {
      // A timed-out create may have succeeded. Recover by reply metadata before any further write.
      return
    }
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await repository.get(record.customerId, record.id)
    if (!current || current.view.arrangement?.id !== arrangement.id) return
    if (current.companyReplyTurns?.[reply.id]?.sessionId === sessionId) break
    if (await repository.compareAndSet(current, { ...current,
      companyReplyTurns: { ...current.companyReplyTurns, [reply.id]: { sessionId } } })) break
  }
  const deadline = Date.now() + 120_000
  const confirmed = new Set<string>()
  while (Date.now() < deadline) {
    const current = await repository.get(record.customerId, record.id)
    if (!current || current.view.arrangement?.id !== arrangement.id || current.view.arrangement.status !== 'awaiting_reply'
      || current.view.inquiry?.replies?.at(-1)?.id !== reply.id || current.companyFollowups?.[reply.id]) return
    const active = await client.sessions.get(sessionId)
    if (active.agent_id !== env.NAIVE_COMPANY_AGENT_ID || active.metadata?.replyId !== reply.id
      || active.metadata?.arrangementId !== arrangement.id) return
    for (const action of active.pending_actions ?? []) {
      if (confirmed.has(action.tool_call_id)) continue
      if (!authorizedInquiryCall(current, action, env)) return
      confirmed.add(action.tool_call_id)
      await client.sessions.confirmTool(sessionId, { tool_call_id: action.tool_call_id, decision: 'allow', scope: 'call' })
    }
    if (['failed', 'cancelled', 'completed'].includes(active.status)
      || active.status === 'idle' && active.stop_reason === 'end_turn') return
    await new Promise(resolve => setTimeout(resolve, 4000))
  }
}

export async function prepareCompanyInquiry(repository: PlanningRepository, record: PlanningRecord, env: NodeJS.ProcessEnv): Promise<void> {
  const arrangement = record.view.arrangement
  const inquiry = record.view.inquiry
  if (!arrangement || !inquiry || inquiry.id !== arrangement.inquiryId
    || !['requested', 'preparing'].includes(arrangement.status)) return
  const client = createClient({ apiKey: env.NAIVE_API_KEY!, baseUrl: 'https://api.vetta.sh',
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }) })
  let sessionId = record.companySession?.arrangementId === arrangement.id ? record.companySession.id : undefined
  try {
    if (!sessionId) {
      if (arrangement.status !== 'requested') return
      const claimed = await repository.compareAndSet(record, { ...record, view: { ...record.view, version: record.view.version + 1,
        arrangement: { ...arrangement, status: 'preparing', detail: 'We are preparing your venue inquiry. Nothing has been sent yet.' } } })
      if (!claimed) return
      const access = inquiryToolAccess({ conversationId: record.id, inquiryId: inquiry.id, revision: inquiry.revision,
        expiresAt: Date.now() + 15 * 60_000 }, env.PLANNING_TOOLS_SECRET!)
      const session = await client.sessions.create({ agent_id: env.NAIVE_COMPANY_AGENT_ID!,
        identity: env.NAIVE_COMPANY_IDENTITY_ID,
        outcome: env.NAIVE_COMPANY_OUTCOME_ID,
        message: JSON.stringify({ task: 'Prepare the saved controlled arrangement inquiry. Preserve the supplied recipient. Write natural supplier correspondence without test labels. The application handles authorized email sending after saving. No booking or payment.', draftAccess: access }),
        budget_micro_usd: 500_000, metadata: { conversationId: record.id, arrangementId: arrangement.id, purpose: 'inquiry-preparation' },
      }, { idempotencyKey: `arrangement:${arrangement.id}` })
      sessionId = session.id
      for (let attempt = 0; attempt < 4; attempt++) {
        const current = await repository.get(record.customerId, record.id)
        if (!current || current.view.arrangement?.id !== arrangement.id) return
        if (await repository.compareAndSet(current, { ...current, companySession: { id: session.id, arrangementId: arrangement.id } })) break
      }
    }
    const deadline = Date.now() + 120_000
    const confirmed = new Set<string>()
    while (Date.now() < deadline) {
      const current = await repository.get(record.customerId, record.id)
      if (!current || current.view.arrangement?.id !== arrangement.id || current.view.arrangement.status !== 'preparing') return
      const session = await client.sessions.get(sessionId)
      if (session.metadata?.arrangementId !== arrangement.id || session.agent_id !== env.NAIVE_COMPANY_AGENT_ID) throw new Error('Preparation identity changed')
      for (const action of session.pending_actions ?? []) {
        if (confirmed.has(action.tool_call_id)) continue
        if (!authorizedInquiryCall(current, action, env)) throw new Error('Preparation needs operator review')
        confirmed.add(action.tool_call_id)
        await client.sessions.confirmTool(sessionId, { tool_call_id: action.tool_call_id, decision: 'allow', scope: 'call' })
      }
      if (['failed', 'cancelled', 'completed'].includes(session.status)
        || session.status === 'idle' && session.stop_reason === 'end_turn') break
      await new Promise(resolve => setTimeout(resolve, 4000))
    }
  } catch {
    // A timed-out provider write may still finish. Never create a second session or resend here.
  }
  const current = await repository.get(record.customerId, record.id)
  if (current?.view.arrangement?.id !== arrangement.id || current.view.arrangement.status !== 'preparing') return
  await repository.compareAndSet(current, { ...current, view: { ...current.view, version: current.view.version + 1,
    arrangement: { ...current.view.arrangement, status: 'needs_attention',
      detail: 'Your arrangement request is saved, but preparation needs review. We will check the existing work before trying again.' } } })
}
