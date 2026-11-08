import { createClient } from '@usenaive-sdk/managed-agents'
import { inquiryFieldsSchema } from '../../agent/planning/contract'
import { inquiryToolAccess, readInquiryToolAccess } from './company-tools'
import type { PlanningRecord, PlanningRepository } from './repository'

export function authorizedInquiryCall(record: PlanningRecord, action: { name: string; args: Record<string, unknown> }, env: NodeJS.ProcessEnv): boolean {
  const arrangement = record.view.arrangement
  const inquiry = record.view.inquiry
  if (!env.PLANNING_TEST_SUPPLIER_EMAIL || !arrangement?.controlled
    || arrangement.status === 'stale' || inquiry?.id !== arrangement.inquiryId
    || inquiry.recipient !== env.PLANNING_TEST_SUPPLIER_EMAIL || record.pending || record.view.status !== 'ready'
    || typeof action.args.access !== 'string') return false
  if (!['arrange.read_selected_event', 'arrange.save_venue_inquiry', 'arrange.record_supplier_reply', 'arrange.submit_supplier_offer',
    'arrange.send_vendor_message', 'arrange.confirm_vendor_booking'].includes(action.name)) return false
  if (action.name === 'arrange.save_venue_inquiry') {
    const fields = inquiryFieldsSchema.safeParse(action.args)
    if (!fields.success || fields.data.recipient !== inquiry.recipient) return false
  }
  try {
    const scope = readInquiryToolAccess(action.args.access, env.PLANNING_TOOLS_SECRET!)
    if (scope.expiresAt === undefined && (record.companyAccessExpiresAt ?? 0) <= Date.now()) return false
    if (action.name === 'arrange.save_venue_inquiry' && (scope.paymentId || !scope.replyId && inquiry.delivery)) return false
    const matchesTurn = scope.paymentId ? record.verifiedPayment?.paymentId === scope.paymentId
      : scope.replyId ? inquiry.replies?.at(-1)?.id === scope.replyId : arrangement.status === 'preparing' && !inquiry.delivery
    return !!matchesTurn && scope.conversationId === record.id && scope.inquiryId === inquiry.id && scope.revision === inquiry.revision
  } catch { return false }
}

async function dispatchCompanyTurn(repository: PlanningRepository, record: PlanningRecord, env: NodeJS.ProcessEnv,
  event: 'arrangement_requested' | 'supplier_reply' | 'payment_verified'): Promise<void> {
  const arrangement = record.view.arrangement
  const inquiry = record.view.inquiry
  const replyId = event === 'supplier_reply' ? inquiry?.replies?.at(-1)?.id : undefined
  const paymentId = event === 'payment_verified' ? record.verifiedPayment?.paymentId : undefined
  if (!arrangement?.controlled || ['stale', 'vendor_confirmed'].includes(arrangement.status)
    || !inquiry || inquiry.id !== arrangement.inquiryId || record.pending || record.view.status !== 'ready'
    || event === 'supplier_reply' && !replyId || event === 'payment_verified' && !paymentId
    || !env.NAIVE_API_KEY || !env.NAIVE_COMPANY_AGENT_ID || !env.PLANNING_TOOLS_SECRET) return
  const signal = AbortSignal.timeout(25_000)
  const client = createClient({ apiKey: env.NAIVE_API_KEY, baseUrl: 'https://api.vetta.sh',
    fetch: (input, init) => fetch(input, { ...init, signal }) })
  let companySession = record.companySession
  if (companySession && companySession.arrangementId !== arrangement.id) return
  if (!companySession) {
    // This body and key stay identical even if the creation response is lost.
    const session = await client.sessions.create({ agent_id: env.NAIVE_COMPANY_AGENT_ID,
      identity: env.NAIVE_COMPANY_IDENTITY_ID,
      message: 'Read your supplier coordination skill. Wait for the application to send a saved arrangement event. Do not send email or change an arrangement in this setup turn.',
      budget_micro_usd: 500_000,
      metadata: { conversationId: record.id, arrangementId: arrangement.id, purpose: 'supplier-conversation' },
    }, { idempotencyKey: `arrangement-company:${arrangement.id}` })
    for (let attempt = 0; attempt < 4; attempt++) {
      const latest = await repository.getById(record.id)
      if (!latest || latest.view.arrangement?.id !== arrangement.id) return
      if (latest.companySession) { companySession = latest.companySession; break }
      companySession = { id: session.id, arrangementId: arrangement.id, initialRevision: inquiry.revision }
      const saved = await repository.compareAndSet(latest, { ...latest, companySession })
      if (saved) { break }
      companySession = undefined
    }
  }
  if (!companySession || companySession.arrangementId !== arrangement.id) throw new Error('Supplier session binding needs retry.')
  const revision = event === 'arrangement_requested' ? companySession.initialRevision ?? inquiry.revision : inquiry.revision
  const access = inquiryToolAccess({ conversationId: record.id, inquiryId: inquiry.id, revision,
    ...(replyId ? { replyId } : {}), ...(paymentId ? { paymentId } : {}) }, env.PLANNING_TOOLS_SECRET)
  // Expiration is server state, so a retry does not change the provider's idempotent message.
  let renewed = false
  for (let attempt = 0; attempt < 4; attempt++) {
    const latest = await repository.getById(record.id)
    if (!latest || latest.companySession?.id !== companySession.id || latest.view.arrangement?.status === 'stale'
      || latest.view.inquiry?.id !== inquiry.id || latest.view.inquiry.revision !== inquiry.revision
      || replyId && latest.view.inquiry.replies?.at(-1)?.id !== replyId) return
    const saved = await repository.compareAndSet(latest, { ...latest, companyAccessExpiresAt: Date.now() + 30 * 60_000 })
    if (saved) { renewed = true; break }
  }
  if (!renewed) throw new Error('Supplier access renewal needs retry.')
  await client.sessions.send(companySession.id, { queue: true, message: JSON.stringify({ event, draftAccess: access }) },
    { idempotencyKey: `arrangement-turn:${arrangement.id}:${event}:${replyId ?? paymentId ?? 'initial'}` })
}

export async function continueCompanyReply(repository: PlanningRepository, record: PlanningRecord, env: NodeJS.ProcessEnv, paymentTurn = false): Promise<void> {
  await dispatchCompanyTurn(repository, record, env, paymentTurn ? 'payment_verified' : 'supplier_reply')
}

export async function prepareCompanyInquiry(repository: PlanningRepository, record: PlanningRecord, env: NodeJS.ProcessEnv): Promise<void> {
  const arrangement = record.view.arrangement
  if (!arrangement || !['requested', 'preparing'].includes(arrangement.status)) return
  if (arrangement.status === 'requested') {
    const claimed = await repository.compareAndSet(record, { ...record, view: { ...record.view, version: record.view.version + 1,
      arrangement: { ...arrangement, status: 'preparing', detail: 'We are preparing your venue inquiry. Nothing has been sent yet.' } } })
    if (!claimed) return
    record = claimed
  }
  await dispatchCompanyTurn(repository, record, env, 'arrangement_requested')
}
