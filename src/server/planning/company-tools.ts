import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { inquiryFieldsSchema, planningInquirySchema } from '../../agent/planning/contract'
import type { PlanningRecord, PlanningRepository } from './repository'
import type { SupplierMailTransport } from './supplier-mail'

const scopeSchema = z.object({ conversationId: z.string().min(1), inquiryId: z.string().min(1), revision: z.number().int().positive(), expiresAt: z.number().int(), replyId: z.string().optional() }).strict()
type Scope = z.infer<typeof scopeSchema>
const signature = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url')

// The planner receives access to one draft revision, never a general customer credential.
export function inquiryToolAccess(scope: Scope, secret: string): string {
  if (secret.length < 32) throw new Error('Company tool signing is not configured.')
  const body = Buffer.from(JSON.stringify(scope)).toString('base64url')
  return `${body}.${signature(body, secret)}`
}
export function readInquiryToolAccess(token: string, secret: string): Scope {
  const [body, supplied, extra] = token.split('.')
  if (!body || !supplied || extra || secret.length < 32) throw new Error('Invalid draft access.')
  const expected = Buffer.from(signature(body, secret))
  const actual = Buffer.from(supplied)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Invalid draft access.')
  const scope = scopeSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString()))
  if (scope.expiresAt <= Date.now()) throw new Error('Draft access expired.')
  return scope
}
const readInput = z.object({ access: z.string().min(1).max(2000) }).strict()
const saveInput = inquiryFieldsSchema.extend({
  access: z.string().min(1).max(2000),
  contactSourceUrl: z.url().refine(url => ['http:', 'https:'].includes(new URL(url).protocol)).nullable(),
  contactQuote: z.string().max(2000).nullable(),
}).strict()
const tools = [
  { name: 'read_selected_event', description: 'Read the selected venue, event requirements and inquiry draft using the access supplied with this task. No research refresh or external action.', inputSchema: z.toJSONSchema(readInput), annotations: { readOnlyHint: true } },
  { name: 'save_venue_inquiry', description: 'Save a concise venue inquiry. For an existing customer-authorized controlled arrangement, the application also sends it to the configured test recipient. This tool cannot create approval or book or pay. Preserve a supplied recipient, or use a published venue email supported by contactSourceUrl and an exact contactQuote; otherwise leave recipient empty.', inputSchema: z.toJSONSchema(saveInput), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
]

export function createCompanyTools(repository: PlanningRepository, secret: string, onPrepared?: (record: PlanningRecord) => Promise<void>, followupMail?: { transport: SupplierMailTransport; recipient: string }) {
  async function call(name: string, raw: unknown) {
    const input = name === 'read_selected_event' ? readInput.parse(raw) : name === 'save_venue_inquiry' ? saveInput.parse(raw) : null
    if (!input) throw new Error('Unknown company tool.')
    const scope = readInquiryToolAccess(input.access, secret)
    const record = await repository.getById(scope.conversationId)
    const inquiry = record?.view.inquiry
    if (!record || !inquiry || inquiry.id !== scope.inquiryId || inquiry.status !== 'draft'
      || (!scope.replyId && inquiry.delivery) || (scope.replyId && inquiry.replies?.at(-1)?.id !== scope.replyId) || record.pending || record.view.status !== 'ready' || record.view.arrangement?.status === 'stale'
      || !record.view.selections.some(option => option.kind === 'venue' && option.id === inquiry.venue.id)) {
      throw new Error('The selected event changed. Stop this preparation and keep the saved customer state.')
    }
    if (name === 'read_selected_event') {
      if (inquiry.revision !== scope.revision) throw new Error('The draft has changed. Do not overwrite it.')
      return { brief: record.view.brief, requirements: record.view.messages.filter(message => message.role === 'user').map(message => message.text),
        selections: record.view.selections, inquiry: { recipient: inquiry.recipient, subject: inquiry.subject, text: inquiry.text },
        latestReply: scope.replyId ? inquiry.replies?.at(-1) : undefined,
        offer: scope.replyId ? record.view.offer : undefined,
        controlled: !!record.view.arrangement?.controlled,
        instruction: record.view.arrangement?.controlled ? 'The customer requested a controlled arrangement. Preserve the supplied recipient. Write natural supplier correspondence without test labels. The service handles the authorized test email. No real reservation, purchase or payment is authorized.' : 'Prepare an inquiry only. No supplier contact, reservation, purchase or payment is authorized.' }
    }
    const draft = saveInput.parse(input)
    if ([draft.subject, draft.text, draft.recipient, draft.contactSourceUrl, draft.contactQuote].some(value => value?.includes(input.access))) throw new Error('Invalid draft access in customer content.')
    if (draft.recipient && draft.recipient !== inquiry.recipient && (!draft.contactSourceUrl || !draft.contactQuote?.toLowerCase().includes(draft.recipient.toLowerCase()))) {
      throw new Error('A recipient requires a published contact source and an exact excerpt containing the address. Otherwise leave it empty.')
    }
    if (scope.replyId) {
      if (!followupMail || !record.view.arrangement?.controlled || draft.recipient !== inquiry.recipient
        || draft.recipient !== followupMail.recipient || inquiry.revision !== scope.revision) throw new Error('The selected event changed. Follow-up is not authorized.')
      const replyId = scope.replyId
      const savedDraft = record.companyFollowups?.[replyId]
      const content = { recipient: draft.recipient, subject: draft.subject, text: draft.text }
      if (savedDraft && JSON.stringify(savedDraft.content) !== JSON.stringify(content)) throw new Error('The draft has changed. A follow-up is already saved.')
      const reserved = savedDraft ? record : await repository.compareAndSet(record, { ...record,
        companyFollowups: { ...record.companyFollowups, [replyId]: { content, status: 'uncertain' } } })
      if (!reserved) throw new Error('The event changed while saving.')
      const result = await followupMail.transport.sendInquiry({ requestId: `arrangement-followup:${replyId}`,
        conversationId: record.id, inquiryId: inquiry.id, draftRevision: inquiry.revision,
        to: content.recipient, subject: content.subject, text: content.text })
      const current = await repository.get(record.customerId, record.id)
      if (current?.view.arrangement?.id === record.view.arrangement?.id) {
        await repository.compareAndSet(current, { ...current,
          companyFollowups: { ...current.companyFollowups, [replyId]: { content, status: result.status } },
          view: { ...current.view, version: current.view.version + 1, arrangement: { ...current.view.arrangement!,
            detail: result.status === 'accepted' ? 'We received the supplier reply and asked for the remaining quote details.' : 'The supplier follow-up needs review. We will check its saved status before another send.' } } })
      }
      return { saved: true, sendStatus: result.status }
    }
    const fields = { recipient: draft.recipient, subject: draft.subject, text: draft.text, contactSourceUrl: draft.recipient ? draft.contactSourceUrl : null }
    const requestId = `company-inquiry:${scope.inquiryId}:${scope.revision}`
    const fingerprint = JSON.stringify(fields)
    if (record.requests[requestId] === fingerprint) return { saved: true, revision: inquiry.revision, sent: false }
    if (record.requests[requestId] || inquiry.revision !== scope.revision) throw new Error('The draft has changed. Do not overwrite it.')
    const next = planningInquirySchema.parse({ ...inquiry, ...fields, revision: inquiry.revision + 1, updatedAt: new Date().toISOString() })
    const saved = await repository.compareAndSet(record, { ...record, requests: { ...record.requests, [requestId]: fingerprint },
      view: { ...record.view, version: record.view.version + 1, inquiry: next,
        arrangement: record.view.arrangement ? { ...record.view.arrangement, status: 'needs_attention',
          detail: next.recipient ? 'Your inquiry is prepared and ready for contact authorization. Nothing has been sent yet.' : 'Your inquiry is prepared. We still need a verified venue contact before sending it.' } : undefined } })
    if (!saved) throw new Error('The event changed while saving. Read the current state before taking another action.')
    await onPrepared?.(saved)
    const current = await repository.get(record.customerId, record.id)
    return { saved: true, revision: next.revision, sendStatus: current?.view.inquiry?.delivery?.status ?? 'not_sent' }
  }
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response(null, { status: 405 })
    let rpc: { jsonrpc: string; id?: string | number; method: string; params?: { name?: string; arguments?: unknown } }
    try { rpc = await request.json() }
    catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }, { status: 400 }) }
    if (rpc?.jsonrpc !== '2.0' || typeof rpc.method !== 'string') return Response.json({ jsonrpc: '2.0', id: rpc?.id ?? null, error: { code: -32600, message: 'Invalid request' } }, { status: 400 })
    if (rpc.id === undefined) return new Response(null, { status: 202 })
    let result: unknown
    if (rpc.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'arrange', version: '1.0.0' } }
    else if (rpc.method === 'tools/list') result = { tools }
    else if (rpc.method === 'tools/call') {
      try { result = { content: [{ type: 'text', text: JSON.stringify(await call(rpc.params?.name ?? '', rpc.params?.arguments)) }] } }
      catch (error) { result = { isError: true, content: [{ type: 'text', text: error instanceof z.ZodError ? 'Invalid tool arguments.' : error instanceof Error && /^(Invalid draft|Draft access|The selected|The draft|The event|A recipient|Unknown company)/.test(error.message) ? error.message : 'The operation could not be confirmed. Read the saved state before continuing.' }] } }
    } else return Response.json({ jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: 'Method not found' } })
    return Response.json({ jsonrpc: '2.0', id: rpc.id, result })
  }
}
