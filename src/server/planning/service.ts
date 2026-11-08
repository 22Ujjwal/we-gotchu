import { buildSelectedOfferPlan } from './offer'
import type { createOfferRepository } from './offer-repository'
import { inquirySendResultSchema, type SupplierMailTransport } from './supplier-mail'
import { prepareInquiry, staleInquiry } from './inquiry'
import { isDeepStrictEqual } from 'node:util'
import { randomUUID } from 'node:crypto'
import { planningCommandSchema, planningCreateSchema, planningProposalSchema, planningApprovalSchema, planningActivitySchema } from '../../agent/planning/contract'
import type { PlanningAgent, PlanningOption, PlanningView } from '../../agent/planning/contract'
import { ApiError } from '../events/errors'
import type { PlanningRecord, PlanningRepository } from './repository'

export type PlanningDeps = {
  repository: PlanningRepository
  offers?: ReturnType<typeof createOfferRepository>
  mail?: SupplierMailTransport
  agent: () => PlanningAgent
  requireCustomerId: () => Promise<string>
  arrange?: (record: PlanningRecord) => void
  approveOffer?: (record: PlanningRecord) => void
  answerSupplier?: (record: PlanningRecord) => void
  refreshArrangement?: (record: PlanningRecord) => Promise<PlanningRecord>
  testSupplierEmail?: string
  allowResearchReview?: boolean
  timeoutMs?: number
  now?: () => number
}
const now = (deps: PlanningDeps) => (deps.now ?? Date.now)()
const timeout = (deps: PlanningDeps) => deps.timeoutMs ?? 55_000
const busy = () => new ApiError(409, 'busy', 'This conversation has a pending or uncertain message. Refresh to check its status.')
const stale = () => new ApiError(409, 'stale_version', 'This conversation changed. Refresh before trying again.')
const uncertainError = 'Delivery could not be confirmed. Refresh to check status. This message will not be sent again automatically.'

async function owned(deps: PlanningDeps, customerId: string, id: string) {
  const record = await deps.repository.get(customerId, id)
  if (!record) throw new ApiError(404, 'not_found', 'Conversation not found.')
  return record
}

function replay(record: PlanningRecord, requestId: string, fingerprint: string): boolean {
  if (!Object.hasOwn(record.requests, requestId)) return false
  if (record.requests[requestId] !== fingerprint) {
    throw new ApiError(409, 'idempotency_conflict', 'This request ID was already used with different input.')
  }
  return true
}

async function bounded<T>(operation: () => Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Planning provider timed out.')), milliseconds) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function save(deps: PlanningDeps, before: PlanningRecord, after: PlanningRecord) {
  const saved = await deps.repository.compareAndSet(before, after)
  if (!saved) throw stale()
  return saved
}

function changed(record: PlanningRecord, update: Partial<PlanningView>): PlanningView {
  return { ...record.view, ...update, version: record.view.version + 1 }
}

// Recovery is allowed only when the provider explicitly supports replaying the original key.
async function deliver(deps: PlanningDeps, record: PlanningRecord, recover = false): Promise<PlanningView> {
  const pending = record.pending!
  let acknowledgement: { sessionId: string; sequence: number } | undefined
  let conflicted = false
  try {
    const result = await bounded(async () => {
      const agent = deps.agent()
      if (pending.kind === 'confirm') {
        if (!agent.confirm || !pending.approval) throw new Error('Approval handler unavailable.')
        await agent.confirm({ sessionId: record.sessionId!, approvalId: pending.approval.id, decision: pending.approval.decision })
        return { sequence: record.sequence }
      }
      if (pending.kind === 'create') {
        return (recover ? agent.recoverStart! : agent.start)({ conversationId: record.id, requestId: pending.requestId, message: pending.message })
      }
      return (recover ? agent.recoverSend! : agent.send)({ sessionId: record.sessionId!, requestId: pending.requestId, message: pending.message, selections: pending.selections })
    }, timeout(deps))
    const sessionId = 'sessionId' in result ? result.sessionId : record.sessionId
    if (typeof sessionId !== 'string' || !sessionId || !Number.isSafeInteger(result.sequence) || result.sequence < record.sequence) {
      throw new Error('Invalid provider acknowledgement.')
    }
    acknowledgement = { sessionId, sequence: result.sequence }
  } catch (error) {
    const failure = error as { name?: string; code?: string; status?: number; requestId?: string }
    conflicted = failure?.status === 409 && failure?.code === 'idempotency_conflict'
    console.error('Planning dispatch could not be confirmed', { kind: pending.kind, recovery: recover,
      name: failure?.name, code: failure?.code, status: failure?.status, requestId: failure?.requestId })
    // An uncertain provider write retains its original request for reconciliation.
  }
  // Mail can update this record while the provider runs. Retry only local settlement.
  let current = record
  for (let attempt = 0; attempt < 5; attempt++) {
    if (current.pending?.requestId !== pending.requestId || current.pending.kind !== pending.kind) return current.view
    const after: PlanningRecord = acknowledgement
      ? { ...current, sessionId: acknowledgement.sessionId, sequence: Math.max(current.sequence, acknowledgement.sequence), pending: null,
          view: changed(current, { status: 'working', error: null, approvals: [] }) }
      : conflicted
        ? { ...current, pending: null, view: changed(current, { status: 'failed', progress: null,
          error: 'The research request conflicted with an earlier attempt. Automatic retries have stopped. Your brief is saved.' }) }
        : { ...current, view: changed(current, { status: 'uncertain', progress: null, error: uncertainError }) }
    const saved = await deps.repository.compareAndSet(current, after)
    if (saved) return saved.view
    current = await owned(deps, record.customerId, record.id)
  }
  return current.view
}

async function deliverInquiry(deps: PlanningDeps, reserved: PlanningRecord): Promise<PlanningView> {
  const inquiry = reserved.view.inquiry!
  const approved = inquiry.delivery!
  let delivery: typeof approved
  try {
    const result = inquirySendResultSchema.parse(await bounded(() => deps.mail!.sendInquiry({
      requestId: approved.requestId, conversationId: reserved.id, inquiryId: inquiry.id,
      draftRevision: approved.draftRevision, to: inquiry.recipient, subject: inquiry.subject, text: inquiry.text,
    }), timeout(deps)))
    delivery = result.status === 'failed'
      ? { ...approved, status: 'failed', error: 'The email provider rejected this inquiry. Nothing was confirmed sent.' }
      : { ...approved, ...result }
  } catch {
    delivery = { ...approved, status: 'uncertain', operationId: approved.requestId,
      error: 'We could not confirm whether the inquiry was sent. It will not be sent again automatically.' }
  }
  // Only retry the database settlement, never the external send.
  let current = reserved
  for (let attempt = 0; attempt < 3; attempt++) {
    const savedInquiry = current.view.inquiry
    if (savedInquiry?.id !== inquiry.id || savedInquiry.delivery?.requestId !== approved.requestId
      || savedInquiry.delivery.status !== 'pending') return current.view
    const saved = await deps.repository.compareAndSet(current, { ...current,
      view: changed(current, { inquiry: { ...savedInquiry, delivery } }) })
    if (saved) return saved.view
    current = await owned(deps, reserved.customerId, reserved.id)
  }
  return current.view
}

export async function createPlanning(deps: PlanningDeps, input: unknown): Promise<PlanningView> {
  const customerId = await deps.requireCustomerId()
  const parsed = planningCreateSchema.safeParse(input)
  if (!parsed.success) throw new ApiError(422, 'invalid_input', 'Provide a request ID and a message of at most 8000 characters.')
  const { requestId, message, brief } = parsed.data
  const id = `planning_${randomUUID()}`
  const fingerprint = JSON.stringify({ kind: 'create', message, ...(brief ? { brief } : {}) })
  const record: PlanningRecord = {
    id, customerId, createRequestId: requestId, initialMessage: message, revision: 0,
    sessionId: null, sequence: 0,
    pending: { kind: 'create', requestId, message, selections: [], expiresAt: now(deps) + Math.max(90_000, timeout(deps) + 5_000) },
    requests: { [requestId]: fingerprint },
    view: {
      id, version: 0, status: 'working',
      ...(brief ? { brief } : {}),
      messages: [{ id: `user:${requestId}`, role: 'user', text: message, createdAt: new Date(now(deps)).toISOString() }],
      proposal: null, selections: [], progress: null, error: null,
    },
  }
  const saved = await deps.repository.insert(record)
  replay(saved, requestId, fingerprint)
  if (saved.id !== id) return saved.view
  return deliver(deps, saved)
}

function toggle(selections: PlanningOption[], options: PlanningOption[], optionId: string): PlanningOption[] {
  if (selections.some(option => option.id === optionId)) return selections.filter(option => option.id !== optionId)
  const option = options.find(candidate => candidate.id === optionId)
  if (!option) throw new ApiError(422, 'invalid_option', 'Choose an option from this proposal.')
  return [...selections.filter(selected => option.kind !== 'venue' || selected.kind !== 'venue'), option]
}

export async function commandPlanning(deps: PlanningDeps, id: string, input: unknown): Promise<PlanningView> {
  const customerId = await deps.requireCustomerId()
  const parsed = planningCommandSchema.safeParse(input)
  if (!parsed.success) throw new ApiError(422, 'invalid_input', 'Provide a valid planning command and version.')
  const command = parsed.data
  const record = await owned(deps, customerId, id)
  const fingerprint = JSON.stringify(command)
  if (replay(record, command.requestId, fingerprint)) return record.view
  if (command.expectedVersion !== record.view.version) throw stale()
  if (record.pending && record.view.status !== 'uncertain' && record.pending.expiresAt > now(deps)) throw busy()
  const requests = { ...record.requests, [command.requestId]: fingerprint }
  if (record.view.inquiry?.delivery?.status === 'pending') throw busy()
  if (command.kind === 'arrange') {
    if (!deps.arrange) throw new ApiError(503, 'arrangement_unavailable', 'Arrangement requests are not connected yet.')
    if (record.pending || record.view.status !== 'ready' || record.view.paymentLink) throw busy()
    if (!record.view.selections.some(option => option.kind === 'venue')) throw new ApiError(422, 'venue_required', 'Choose a setting first.')
    if (record.view.arrangement && record.view.arrangement.status !== 'stale') return record.view
    if (record.view.inquiry?.delivery && record.view.inquiry.delivery.status !== 'accepted') throw new ApiError(409, 'inquiry_in_progress', 'Confirm the existing inquiry send status before arranging it.')
    if (record.view.inquiry?.delivery && deps.testSupplierEmail && record.view.inquiry.recipient !== deps.testSupplierEmail) throw new ApiError(409, 'recipient_changed', 'The saved inquiry belongs to another supplier.')
    let inquiry = record.view.inquiry?.status === 'draft' ? record.view.inquiry : prepareInquiry(record.view, now(deps))
    if (deps.testSupplierEmail && !inquiry.delivery) inquiry = { ...inquiry, revision: inquiry.revision + 1, recipient: deps.testSupplierEmail, contactSourceUrl: null }
    const saved = await save(deps, record, { ...record, requests, companySession: undefined, companyAccessExpiresAt: undefined, view: changed(record, { inquiry,
      arrangement: { id: `arrangement_${randomUUID()}`, inquiryId: inquiry.id, requestedAt: new Date(now(deps)).toISOString(),
        status: inquiry.delivery ? 'awaiting_reply' : 'requested', customerEmail: command.customerEmail, selections: record.view.selections, controlled: !!deps.testSupplierEmail,
        detail: 'Your request is saved. We are preparing the venue inquiry and checking the details. Nothing is booked or paid.' },
    }) })
    deps.arrange(saved)
    return saved.view
  }
  if (command.kind === 'approve_offer') {
    const offer = record.view.offer
    if (!deps.approveOffer || !record.view.arrangement?.controlled || record.view.arrangement.status === 'stale'
      || record.view.paymentLink || record.pending || !offer || offer.id !== command.offerId || offer.revision !== command.offerRevision
      || record.view.inquiry?.replies?.at(-1)?.id !== offer.replyId) throw stale()
    const built = buildSelectedOfferPlan({ offer, selections: record.view.selections,
      contextMessageIds: record.view.messages.filter(message => message.role === 'user').map(message => message.id),
      eventId: 'review', runId: 'review', briefRevision: 1, planId: 'review', planRevision: 1, now: now(deps) })
    if (!built.ok) throw new ApiError(422, 'offer_incomplete', built.reason)
    const saved = await save(deps, record, { ...record, requests, view: changed(record, {
      offerApproval: record.view.offerApproval?.offerId === offer.id && record.view.offerApproval.offerRevision === offer.revision
        ? record.view.offerApproval : { offerId: offer.id, offerRevision: offer.revision, approvedAt: new Date(now(deps)).toISOString() },
      arrangement: { ...record.view.arrangement, status: 'awaiting_offer_confirmation',
        detail: 'You approved the offer. We are asking the supplier to confirm these exact terms before payment.' },
    }) })
    deps.approveOffer(saved)
    return saved.view
  }
  if (command.kind === 'answer_supplier') {
    const question = record.view.supplierQuestion
    if (!deps.answerSupplier || !question || question.answer || question.replyId !== command.replyId
      || record.view.inquiry?.replies?.at(-1)?.id !== question.replyId || record.view.paymentLink
      || !record.view.arrangement || record.view.arrangement.status === 'stale') throw stale()
    const saved = await save(deps, record, { ...record, requests, view: changed(record, {
      supplierQuestion: { ...question, answer: command.answer, answerRequestId: command.requestId },
      offerApproval: undefined,
      arrangement: { ...record.view.arrangement, status: 'awaiting_reply', detail: 'Your answer is saved. We are continuing the supplier conversation.' },
    }) })
    deps.answerSupplier(saved)
    return saved.view
  }
  if (command.kind === 'release_payment') {
    if (!deps.offers) throw new ApiError(503, 'offer_unavailable', 'Offer preparation is not configured.')
    return (await deps.offers.release(customerId, id, record.view.version, command.eventId,
      { id: command.requestId, fingerprint })).view
  }
  if (command.kind === 'prepare_payment') {
    if (!deps.offers) throw new ApiError(503, 'offer_unavailable', 'Offer preparation is not configured.')
    if (record.pending || record.view.status !== 'ready') throw busy()
    await deps.offers.prepare(customerId, id, command.offerId, command.offerRevision, new Date(now(deps)),
      { id: command.requestId, fingerprint })
    return (await owned(deps, customerId, id)).view
  }
  if (command.kind === 'retry_reply') {
    const inquiry = record.view.inquiry
    const reply = inquiry?.replies?.find(item => item.id === command.replyId)
    if (!inquiry || inquiry.id !== command.inquiryId || !reply || reply.status !== 'failed') throw stale()
    if (!reply.message.text.trim()) throw new ApiError(422, 'missing_reply_text', 'The original reply has no plain text to interpret.')
    return (await save(deps, record, { ...record, requests, view: changed(record, { inquiry: { ...inquiry,
      replies: inquiry.replies!.map(item => item.id === reply.id ? { ...item, status: 'received', error: undefined, lease: undefined } : item),
    } }) })).view
  }
  if (command.kind === 'send_inquiry') {
    if (!deps.mail) throw new ApiError(503, 'mail_unavailable', 'Inquiry sending is not connected yet.')
    if (record.pending || record.view.status !== 'ready') throw busy()
    const inquiry = record.view.inquiry
    if (!inquiry || inquiry.id !== command.inquiryId || inquiry.revision !== command.expectedDraftRevision
      || inquiry.status !== 'draft' || inquiry.delivery) throw stale()
    if (!inquiry.recipient) throw new ApiError(422, 'recipient_required', 'Add the venue email address before approving the inquiry.')
    const reserved = await save(deps, record, { ...record, requests, view: changed(record, {
      inquiry: { ...inquiry, delivery: { status: 'pending', requestId: command.requestId,
        draftRevision: inquiry.revision, approvedAt: new Date(now(deps)).toISOString(),
        expiresAt: now(deps) + timeout(deps) + 5_000 } },
    }) })
    return deliverInquiry(deps, reserved)
  }
  if (command.kind === 'prepare_inquiry' || command.kind === 'save_inquiry') {
    if (record.pending || record.view.status !== 'ready') throw busy()
    if (record.view.inquiry?.delivery?.status === 'uncertain') throw busy()
    if (command.kind === 'prepare_inquiry' && record.view.inquiry?.status === 'draft' && record.view.inquiry.delivery?.status !== 'failed') {
      return record.view
    }
    let inquiry = record.view.inquiry
    if (command.kind === 'prepare_inquiry') inquiry = prepareInquiry(record.view, now(deps))
    else {
      if (!inquiry || inquiry.delivery || inquiry.status !== 'draft' || inquiry.id !== command.inquiryId
        || inquiry.revision !== command.expectedDraftRevision) throw stale()
      inquiry = { ...inquiry, revision: inquiry.revision + 1, recipient: command.recipient,
        subject: command.subject, text: command.text, updatedAt: new Date(now(deps)).toISOString(),
        contactSourceUrl: command.recipient === inquiry.recipient ? inquiry.contactSourceUrl : null }
    }
    return (await save(deps, record, { ...record, requests,
      ...(command.kind === 'prepare_inquiry' && record.view.inquiry
        ? { inquiryHistory: [...(record.inquiryHistory ?? []), record.view.inquiry] } : {}),
      view: changed(record, { inquiry }) })).view
  }
  if (command.kind === 'select') {
    const selections = toggle(record.view.selections, record.view.proposal?.options ?? [], command.optionId)
    const selectedVenue = selections.find(option => option.kind === 'venue')
    const previousVenue = record.view.selections.find(option => option.kind === 'venue')
    let inquiry = selectedVenue?.id !== previousVenue?.id ? staleInquiry(record.view) : record.view.inquiry
    if (selectedVenue && !inquiry && !record.pending && record.view.status === 'ready') {
      inquiry = prepareInquiry({ ...record.view, selections }, now(deps))
    }
    return (await save(deps, record, { ...record, requests, view: changed(record, { selections,
      arrangement: record.view.arrangement ? { ...record.view.arrangement, status: 'stale', detail: 'Your selections changed. Review them and request an updated arrangement.' } : undefined,
      inquiry }) })).view
  }
  if (command.kind === 'confirm') {
    if (!deps.allowResearchReview) throw new ApiError(403, 'operator_required', 'Research review is handled by the planning team.')
    if (!record.sessionId || record.pending || record.view.status !== 'blocked'
      || !record.view.approvals?.some(approval => approval.id === command.approvalId)) throw stale()
    const reserved = await save(deps, record, {
      ...record, requests,
      pending: { kind: 'confirm', requestId: command.requestId, message: '', selections: [],
        approval: { id: command.approvalId, decision: command.decision },
        expiresAt: now(deps) + Math.max(90_000, timeout(deps) + 5_000) },
      view: changed(record, { status: 'working', progress: null, error: null }),
    })
    return deliver(deps, reserved)
  }
  if (!record.sessionId || record.pending || ['working', 'uncertain', 'blocked'].includes(record.view.status)) throw busy()
  const reserved = await save(deps, record, {
    ...record, requests,
    pending: {
      kind: record.sessionId ? 'message' : 'create', requestId: command.requestId,
      message: record.sessionId ? command.message : `${record.initialMessage}\nCustomer update: ${command.message}`,
      selections: record.view.selections, expiresAt: now(deps) + Math.max(90_000, timeout(deps) + 5_000),
    },
    view: changed(record, {
      status: 'working', progress: null, error: null, inquiry: staleInquiry(record.view),
      arrangement: record.view.arrangement ? { ...record.view.arrangement, status: 'stale', detail: 'Your event requirements changed. Review the updated options before arranging them.' } : undefined,
      messages: [...record.view.messages, {
        id: `user:${command.requestId}`, role: 'user', text: command.message, createdAt: new Date(now(deps)).toISOString(),
      }],
    }),
  })
  return deliver(deps, reserved)
}

async function reconcileInquiry(deps: PlanningDeps, record: PlanningRecord): Promise<PlanningView> {
  const inquiry = record.view.inquiry
  const delivery = inquiry?.delivery
  if (!inquiry || delivery?.status !== 'uncertain' || !deps.mail?.reconcileInquiry) return record.view
  const result = await bounded(() => deps.mail!.reconcileInquiry!({
    requestId: delivery.requestId, conversationId: record.id, inquiryId: inquiry.id,
  }), timeout(deps))
  if (!result) return record.view
  const checked = inquirySendResultSchema.parse(result)
  let current = record
  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = current.view.inquiry
    if (latest?.id !== inquiry.id || latest.delivery?.requestId !== delivery.requestId || latest.delivery.status !== 'uncertain') return current.view
    const resolved = checked.status === 'failed'
      ? { ...latest.delivery, status: checked.status, error: 'The email provider rejected this inquiry. Nothing was confirmed sent.' }
      : { ...latest.delivery, ...checked, error: checked.status === 'accepted' ? undefined : latest.delivery.error }
    const saved = await deps.repository.compareAndSet(current, { ...current, view: changed(current, { inquiry: { ...latest, delivery: resolved } }) })
    if (saved) return saved.view
    current = await owned(deps, record.customerId, record.id)
  }
  return current.view
}

export async function getPlanning(deps: PlanningDeps, id: string, options: { savedOnly?: boolean; reconcileMail?: boolean } = {}): Promise<PlanningView> {
  const customerId = await deps.requireCustomerId()
  let record = await owned(deps, customerId, id)
  if (options.savedOnly) return record.view
  if (record.view.arrangement?.status === 'preparing' && !record.pending && !record.view.inquiry?.delivery && deps.refreshArrangement) {
    try { return (await deps.refreshArrangement(record)).view }
    catch { throw new ApiError(503, 'company_unavailable', 'Could not check the supplier request. Your saved work is unchanged.') }
  }
  const inquiry = record.view.inquiry
  if (inquiry?.delivery?.status === 'pending' && inquiry.delivery.expiresAt <= now(deps)) {
    const recovered = await deps.repository.compareAndSet(record, { ...record, view: changed(record, {
      inquiry: { ...inquiry, delivery: { ...inquiry.delivery, status: 'uncertain', operationId: inquiry.delivery.requestId,
        error: 'We could not confirm whether the inquiry was sent. It will not be sent again automatically.' } },
    }) })
    record = recovered ?? await owned(deps, customerId, id)
  }
  if (options.reconcileMail) return reconcileInquiry(deps, record)
  if (record.pending && record.view.status !== 'uncertain') {
    if (record.pending.expiresAt > now(deps)) return record.view
    const recovered = await deps.repository.compareAndSet(record, {
      ...record, view: changed(record, { status: 'uncertain', progress: null, error: uncertainError }),
    })
    if (!recovered) return (await owned(deps, customerId, id)).view
    record = recovered
  }
  if (record.pending && record.view.status === 'uncertain' && record.pending.expiresAt <= now(deps)
    && ((!record.sessionId && record.pending.kind === 'create' && deps.agent().recoverStart)
      || (record.sessionId && record.pending.kind === 'message' && deps.agent().recoverSend))) {
    const claimed = await deps.repository.compareAndSet(record, { ...record,
      pending: { ...record.pending, expiresAt: now(deps) + Math.max(90_000, timeout(deps) + 5_000) } })
    if (claimed) return deliver(deps, claimed, true)
    return (await owned(deps, customerId, id)).view
  }
  if (!record.sessionId) return record.view
  let result: Awaited<ReturnType<PlanningAgent['read']>>
  try {
    result = await bounded(() => deps.agent().read({ sessionId: record.sessionId!, afterSequence: record.sequence,
      ...(record.view.status === 'ready' && !record.pending ? { completedSequence: record.sequence } : {}),
      ...(record.pending?.kind === 'confirm' && record.pending.approval ? { approvalId: record.pending.approval.id } : {}),
    }), timeout(deps))
    if (!Number.isSafeInteger(result.sequence) || result.sequence < 0) throw new Error('Invalid sequence.')
    if (result.activity) result.activity = result.activity.map(item => planningActivitySchema.parse(item))
    if (result.approvals) result.approvals = result.approvals.map(approval => planningApprovalSchema.parse(approval))
    if (result.proposal) result.proposal = planningProposalSchema.parse(result.proposal)
  } catch {
    throw new ApiError(503, 'provider_unavailable', 'Could not refresh this conversation. Your saved work is unchanged.')
  }
  // Closing a specific approval is observable without claiming that a message or purchase succeeded.
  const confirmationClosed = record.pending?.kind === 'confirm' && !!record.pending.approval
    && result.confirmation?.id === record.pending.approval.id && result.confirmation.state === 'closed'
  const pending = confirmationClosed ? null : record.pending
  const correctedCompletion = record.view.status === 'ready' && result.status === 'ready' && result.proposal
    && !isDeepStrictEqual(result.proposal, record.view.proposal)
  if (result.sequence < record.sequence || (result.sequence === record.sequence && !confirmationClosed
    && !correctedCompletion && !['failed', 'blocked'].includes(result.status))) return record.view
  const proposal = result.proposal ?? record.view.proposal
  const messages = [...record.view.messages]
  const answersNewTurn = result.status === 'ready' && messages.at(-1)?.role === 'user'
  if (result.proposal && (answersNewTurn || !isDeepStrictEqual(result.proposal, record.view.proposal))) {
    const messageId = `assistant:${record.sessionId}:${result.sequence}`
    const existing = messages.findIndex(message => message.id === messageId)
    if (existing >= 0) {
      messages[existing] = { ...messages[existing], text: [result.proposal.summary, result.proposal.nextQuestion].filter(Boolean).join('\n\n') }
    } else {
      messages.push({
        id: messageId, role: 'assistant',
        text: [result.proposal.summary, result.proposal.nextQuestion].filter(Boolean).join('\n\n'),
        createdAt: new Date(now(deps)).toISOString(),
      })
    }
  }
  const after: PlanningRecord = {
    ...record, pending,
    // The provider can report the final sequence before it reports completion.
    sequence: ['working', 'blocked'].includes(result.status) ? record.sequence : result.sequence,
    view: changed(record, {
      proposal, messages, progress: result.progress, activity: result.activity ?? [], approvals: result.approvals ?? [],
      // A read cannot prove whether an unacknowledged write was accepted.
      status: pending ? 'uncertain' : result.status,
      error: pending ? uncertainError : result.error,
    }),
  }
  if (after.sequence === record.sequence && isDeepStrictEqual({ ...after.view, version: record.view.version }, record.view)) return record.view
  const saved = await deps.repository.compareAndSet(record, after)
  return saved?.view ?? (await owned(deps, customerId, id)).view
}
