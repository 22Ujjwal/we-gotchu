import { eventMailSubject } from './customer-notifications'
import { supplierConversationGuidance } from '../../agent/planning/company'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { inquiryFieldsSchema, planningInquirySchema } from '../../agent/planning/contract'
import type { PlanningRecord, PlanningRepository } from './repository'
import { supplierOfferInputSchema, validateSupplierOffer } from '../../agent/planning/offer-generator'
import { calculateOfferCosts, type SelectedOffer } from '../../agent/planning/offer-contract'
import { replyInterpretationSchema } from '../../agent/planning/reply-contract'
import { recordSupplierReply } from './replies'
import { sendVendorNote } from './vendor-coordination'
import type { createOfferRepository } from './offer-repository'
import type { SupplierMailTransport } from './supplier-mail'
import { ApiError } from '../events/errors'

export function authorizeCompanyTransport(request: Request, env: NodeJS.ProcessEnv = process.env): void {
  const secret = env.PLANNING_TOOLS_BEARER
  if (!secret || secret.length < 32) throw new ApiError(503, 'tools_unavailable', 'Company tool transport is not configured.')
  const expected = Buffer.from(`Bearer ${secret}`)
  const supplied = Buffer.from(request.headers.get('authorization') ?? '')
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new ApiError(401, 'unauthorized', 'Company tool authentication is required.')
  }
}

const scopeSchema = z.object({ conversationId: z.string().min(1), inquiryId: z.string().min(1), revision: z.number().int().positive(), expiresAt: z.number().int().optional(), replyId: z.string().optional(), paymentId: z.string().optional() }).strict()
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
  if (scope.expiresAt !== undefined && scope.expiresAt <= Date.now()) throw new Error('Draft access expired.')
  return scope
}
const readInput = z.object({ access: z.string().min(1).max(2000) }).strict()
const saveInput = inquiryFieldsSchema.extend({
  access: z.string().min(1).max(2000),
  contactSourceUrl: z.url().refine(url => ['http:', 'https:'].includes(new URL(url).protocol)).nullable(),
  contactQuote: z.string().max(2000).nullable(),
}).strict()
const offerInput = z.object({ access: readInput.shape.access, offer: supplierOfferInputSchema }).strict()
const replyInput = z.object({ access: readInput.shape.access, interpretation: replyInterpretationSchema }).strict()
const vendorInput = z.object({ access: readInput.shape.access, stage: z.enum(['quote_acknowledgment', 'booking_confirmation']),
  subject: z.string().min(1).max(500), text: z.string().min(1).max(12000) }).strict()
const tools = [
  { name: 'record_supplier_reply', description: 'Record your interpretation of the original latest supplier reply. Facts must contain exact excerpts. Distinguish a quote from an explicit booking confirmation. Do this before submitting an offer or confirming a booking.', inputSchema: z.toJSONSchema(replyInput), annotations: { readOnlyHint: false, idempotentHint: true } },
  { name: 'send_vendor_message', description: 'Send your message to the saved authorized supplier. Acknowledge a saved quote, or ask for booking confirmation after verified sandbox payment. No new recipient, real booking or charge.', inputSchema: z.toJSONSchema(vendorInput), annotations: { readOnlyHint: false, idempotentHint: true } },
  { name: 'confirm_vendor_booking', description: 'Record an explicit vendor confirmation after the paid booking request. Requires a saved confirmation interpretation with source facts. Sends the customer a final confirmation.', inputSchema: z.toJSONSchema(readInput), annotations: { readOnlyHint: false, idempotentHint: true } },
  { name: 'submit_supplier_offer', description: 'Submit supplier terms for the selected options. Amounts are integer currency minor units. Include exact sourceQuotes from the saved supplier conversation. Interpret included or waived costs as zero, not unknown. Calculate derived prices from the cited rates. Genuinely unknown costs stay null and unresolved terms stay in missing. You may correct an incomplete, unapproved offer using the same reply. Inspect readyForReview and missing in the result. The application validates and saves the offer and notifies the customer when complete. This does not approve or pay.', inputSchema: z.toJSONSchema(offerInput), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
  { name: 'read_selected_event', description: 'Read the selected venue, event requirements and inquiry draft using the access supplied with this task. No research refresh or external action.', inputSchema: z.toJSONSchema(readInput), annotations: { readOnlyHint: true } },
  { name: 'save_venue_inquiry', description: 'Save a concise venue inquiry. For an existing customer-authorized controlled arrangement, the application also sends it to the configured test recipient. This tool cannot create approval or book or pay. Preserve a supplied recipient, or use a published venue email supported by contactSourceUrl and an exact contactQuote; otherwise leave recipient empty.', inputSchema: z.toJSONSchema(saveInput), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
]

function parseToolCall(name: string, raw: unknown) {
  switch (name) {
    case 'read_selected_event': return { name, input: readInput.parse(raw) } as const
    case 'confirm_vendor_booking': return { name, input: readInput.parse(raw) } as const
    case 'save_venue_inquiry': return { name, input: saveInput.parse(raw) } as const
    case 'submit_supplier_offer': return { name, input: offerInput.parse(raw) } as const
    case 'record_supplier_reply': return { name, input: replyInput.parse(raw) } as const
    case 'send_vendor_message': return { name, input: vendorInput.parse(raw) } as const
    default: throw new Error('Unknown company tool.')
  }
}

function offerResult(offer: SelectedOffer) {
  const costs = calculateOfferCosts(offer)
  return { saved: true, offerId: offer.id, revision: offer.revision,
    readyForReview: costs.ok && !offer.missing.length,
    missing: [...offer.missing, ...(!costs.ok ? [costs.reason] : [])] }
}

export function createCompanyTools(repository: PlanningRepository, secret: string, onPrepared?: (record: PlanningRecord) => Promise<void>, followupMail?: { transport: SupplierMailTransport; recipient: string }, offerActions?: { save: ReturnType<typeof createOfferRepository>['save']; onSaved: (record: PlanningRecord) => Promise<void> }, vendorActions?: { verifyPayment: (record: PlanningRecord) => Promise<boolean>; onConfirmed: (record: PlanningRecord) => Promise<void> }, onReply?: (record: PlanningRecord) => Promise<void>) {
  async function call(name: string, raw: unknown) {
    const tool = parseToolCall(name, raw)
    const input = tool.input
    const scope = readInquiryToolAccess(input.access, secret)
    const record = await repository.getById(scope.conversationId)
    const inquiry = record?.view.inquiry
    if (!record || scope.expiresAt === undefined && (record.companyAccessExpiresAt ?? 0) <= Date.now()
      || !inquiry || inquiry.id !== scope.inquiryId || inquiry.status !== 'draft'
      || (!scope.replyId && !scope.paymentId && inquiry.delivery) || (scope.paymentId && record.verifiedPayment?.paymentId !== scope.paymentId) || (scope.replyId && inquiry.replies?.at(-1)?.id !== scope.replyId) || record.pending || record.view.status !== 'ready' || record.view.arrangement?.status === 'stale'
      || !record.view.selections.some(option => option.kind === 'venue' && option.id === inquiry.venue.id)) {
      throw new Error('The selected event changed. Stop this preparation and keep the saved customer state.')
    }
    if (tool.name === 'read_selected_event') {
      if (inquiry.revision !== scope.revision) throw new Error('The draft has changed. Do not overwrite it.')
      return { interpretationGuidance: supplierConversationGuidance, brief: record.view.brief, requirements: record.view.messages.filter(message => message.role === 'user').map(message => message.text),
        selections: record.view.selections, inquiry: { recipient: inquiry.recipient, subject: inquiry.subject, text: inquiry.text },
        latestReply: scope.replyId ? inquiry.replies?.at(-1) : undefined,
        supplierReplies: inquiry.replies ?? [],
        customerQuestion: record.view.supplierQuestion, approvedOffer: record.view.offerApproval,
        offer: record.view.offer, verifiedPayment: record.verifiedPayment, vendorBooking: record.vendorBooking, vendorMessages: record.vendorNotes,
        controlled: !!record.view.arrangement?.controlled,
        instruction: record.view.arrangement?.controlled ? 'The customer requested a controlled arrangement. Preserve the supplied recipient. Write natural supplier correspondence without test labels. The service handles the authorized test email. No real reservation, purchase or payment is authorized. If the supplier asks a customer question, record its interpretation as question with a clear nextAction for the customer; the application emails it. Read customerQuestion.answer before following up. If approvedOffer exists and payment is absent, classify a reply as confirmation only when it explicitly confirms availability and every approved term unchanged; include an availability fact and exact excerpt and set confirmsApprovedOffer true only for unchanged approved terms. Changed terms require a new quote and customer approval. For an unchanged confirmation, record_supplier_reply is sufficient; do not replace the offer or send a booking request.' : 'Prepare an inquiry only. No supplier contact, reservation, purchase or payment is authorized.' }
    }
    if (tool.name === 'record_supplier_reply') {
      if (!scope.replyId || inquiry.revision !== scope.revision) throw new Error('The selected reply changed.')
      const interpretation = tool.input.interpretation
      await recordSupplierReply(repository, { customerId: record.customerId, conversationId: record.id, inquiryId: inquiry.id },
        scope.replyId, interpretation)
      const saved = await repository.getById(record.id)
      const reply = saved?.view.inquiry?.replies?.at(-1)
      if (reply?.status !== 'ready') throw new Error('The selected reply could not be recorded. Supply exact excerpts from the original message.')
      if (saved) await onReply?.(saved)
      return { saved: true, interpretation: reply.interpretation }
    }
    if (tool.name === 'send_vendor_message') {
      const note = tool.input
      if (!followupMail || !record.view.arrangement?.controlled || inquiry.recipient !== followupMail.recipient
        || inquiry.revision !== scope.revision || note.subject.includes(input.access) || note.text.includes(input.access)) throw new Error('The selected vendor message is not authorized.')
      const payment = record.verifiedPayment
      const booking = note.stage === 'booking_confirmation'
      if (booking ? !payment || !vendorActions || !await vendorActions.verifyPayment(record) : !scope.replyId || record.view.offer?.replyId !== scope.replyId) {
        throw new Error('The selected event does not support this vendor message yet.')
      }
      const key = booking ? `booking:${payment!.paymentId}` : `quote:${record.view.offer!.id}:${record.view.offer!.revision}`
      const result = await sendVendorNote(repository, followupMail.transport, record, followupMail.recipient,
        { key, subject: note.subject, text: note.text })
      if (booking && result?.status === 'accepted') {
        for (let attempt = 0; attempt < 4; attempt++) {
          const current = await repository.getById(record.id)
          if (!current?.view.arrangement || current.vendorBooking?.paymentId === payment!.paymentId) break
          if (await repository.compareAndSet(current, { ...current, vendorBooking: { paymentId: payment!.paymentId, noteKey: key },
            view: { ...current.view, version: current.view.version + 1, arrangement: { ...current.view.arrangement,
              status: 'awaiting_vendor_confirmation', detail: 'Payment received. We have asked the supplier to confirm your arrangement.' } } })) break
        }
      }
      return { sendStatus: result?.status ?? 'uncertain' }
    }
    if (tool.name === 'confirm_vendor_booking') {
      const reply = inquiry.replies?.at(-1)
      if (!scope.replyId || !vendorActions || !await vendorActions.verifyPayment(record)
        || reply?.interpretation?.kind !== 'confirmation' || !reply.interpretation.facts.length) throw new Error('The selected reply does not establish vendor confirmation.')
      await vendorActions.onConfirmed(record)
      const current = await repository.getById(record.id)
      return { confirmed: current?.vendorBooking?.confirmedReplyId === scope.replyId }
    }
    if (tool.name === 'submit_supplier_offer') {
      if (!offerActions || !scope.replyId || inquiry.revision !== scope.revision || record.view.paymentLink
        || !record.view.arrangement?.controlled) throw new Error('The selected event cannot accept an offer.')
      const { offer: proposed } = tool.input
      const request = { id: `company-offer:${scope.replyId}`, fingerprint: JSON.stringify(proposed) }
      const previous = record.requests[request.id]
      if (previous === request.fingerprint) {
        await offerActions.onSaved(record)
        return offerResult(record.view.offer!)
      }
      if (previous && (!record.view.offer || record.view.offer.replyId !== scope.replyId || record.view.offerApproval
        || !record.view.offer.missing.length && calculateOfferCosts(record.view.offer).ok)) {
        throw new Error('The draft has changed. A complete or approved offer is already saved for this reply.')
      }
      const offer = validateSupplierOffer(record, proposed)
      const saved = await offerActions.save(record.customerId, record.id, record.view.version, offer, request)
      await offerActions.onSaved(saved)
      return offerResult(offer)
    }
    if (scope.paymentId || !scope.replyId && inquiry.delivery) throw new Error('The selected event cannot save an inquiry with this access.')
    const draft = tool.input
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
      const result = await sendVendorNote(repository, followupMail.transport, record, followupMail.recipient,
        { key: `followup:${replyId}`, requestId: `arrangement-followup:${replyId}`, subject: content.subject, text: content.text })
      if (!result) throw new Error('The event changed while saving.')
      const current = await repository.get(record.customerId, record.id)
      if (current?.view.arrangement?.id === record.view.arrangement?.id) {
        await repository.compareAndSet(current, { ...current,
          view: { ...current.view, version: current.view.version + 1, arrangement: { ...current.view.arrangement!,
            detail: result.status === 'accepted' ? 'We received the supplier reply and asked for the remaining quote details.' : 'The supplier follow-up needs review. We will check its saved status before another send.' } } })
      }
      return { saved: true, sendStatus: result.status }
    }
    const fields = { recipient: draft.recipient, subject: eventMailSubject(draft.subject, record.id), text: draft.text, contactSourceUrl: draft.recipient ? draft.contactSourceUrl : null }
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
      catch (error) { result = { isError: true, content: [{ type: 'text', text: error instanceof z.ZodError ? 'Invalid tool arguments.' : error instanceof Error && /^(Invalid draft|Draft access|The selected|The draft|The event|A recipient|Unknown company|A current venue|Select the quoted|Customer spending|Offer )/.test(error.message) ? error.message : 'The operation could not be confirmed. Read the saved state before continuing.' }] } }
    } else return Response.json({ jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: 'Method not found' } })
    return Response.json({ jsonrpc: '2.0', id: rpc.id, result })
  }
}
