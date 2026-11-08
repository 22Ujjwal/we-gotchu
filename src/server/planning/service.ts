import { isDeepStrictEqual } from 'node:util'
import { randomUUID } from 'node:crypto'
import { planningCommandSchema, planningCreateSchema, planningProposalSchema, planningApprovalSchema, planningActivitySchema } from '../../agent/planning/contract'
import type { PlanningAgent, PlanningOption, PlanningView } from '../../agent/planning/contract'
import { ApiError } from '../events/errors'
import type { PlanningRecord, PlanningRepository } from './repository'

export type PlanningDeps = {
  repository: PlanningRepository
  agent: () => PlanningAgent
  requireCustomerId: () => Promise<string>
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

// A failed or timed-out write may have reached the provider. Never retry it here.
async function deliver(deps: PlanningDeps, record: PlanningRecord): Promise<PlanningView> {
  const pending = record.pending!
  let after: PlanningRecord
  try {
    const result = await bounded(async () => {
      const agent = deps.agent()
      if (pending.kind === 'confirm') {
        if (!agent.confirm || !pending.approval) throw new Error('Approval handler unavailable.')
        await agent.confirm({ sessionId: record.sessionId!, approvalId: pending.approval.id, decision: pending.approval.decision })
        return { sequence: record.sequence }
      }
      if (pending.kind === 'create') {
        return agent.start({ conversationId: record.id, requestId: pending.requestId, message: pending.message })
      }
      return agent.send({ sessionId: record.sessionId!, requestId: pending.requestId, message: pending.message, selections: pending.selections })
    }, timeout(deps))
    const sessionId = 'sessionId' in result ? result.sessionId : record.sessionId
    if (typeof sessionId !== 'string' || !sessionId || !Number.isSafeInteger(result.sequence) || result.sequence < record.sequence) {
      throw new Error('Invalid provider acknowledgement.')
    }
    after = {
      ...record, sessionId, sequence: result.sequence, pending: null,
      view: changed(record, { status: 'working', error: null, approvals: [] }),
    }
  } catch {
    after = { ...record, view: changed(record, { status: 'uncertain', progress: null, error: uncertainError }) }
  }
  // Database failures are not provider failures and must not trigger another send.
  const saved = await deps.repository.compareAndSet(record, after)
  return saved?.view ?? (await owned(deps, record.customerId, record.id)).view
}

export async function createPlanning(deps: PlanningDeps, input: unknown): Promise<PlanningView> {
  const customerId = await deps.requireCustomerId()
  const parsed = planningCreateSchema.safeParse(input)
  if (!parsed.success) throw new ApiError(422, 'invalid_input', 'Provide a request ID and a message of at most 8000 characters.')
  const { requestId, message } = parsed.data
  const id = `planning_${randomUUID()}`
  const fingerprint = JSON.stringify({ kind: 'create', message })
  const record: PlanningRecord = {
    id, customerId, createRequestId: requestId, initialMessage: message, revision: 0,
    sessionId: null, sequence: 0,
    pending: { kind: 'create', requestId, message, selections: [], expiresAt: now(deps) + Math.max(90_000, timeout(deps) + 5_000) },
    requests: { [requestId]: fingerprint },
    view: {
      id, version: 0, status: 'working',
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
  if (command.kind === 'select') {
    const selections = toggle(record.view.selections, record.view.proposal?.options ?? [], command.optionId)
    return (await save(deps, record, { ...record, requests, view: changed(record, { selections }) })).view
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
      kind: 'message', requestId: command.requestId, message: command.message,
      selections: record.view.selections, expiresAt: now(deps) + Math.max(90_000, timeout(deps) + 5_000),
    },
    view: changed(record, {
      status: 'working', progress: null, error: null,
      messages: [...record.view.messages, {
        id: `user:${command.requestId}`, role: 'user', text: command.message, createdAt: new Date(now(deps)).toISOString(),
      }],
    }),
  })
  return deliver(deps, reserved)
}

export async function getPlanning(deps: PlanningDeps, id: string): Promise<PlanningView> {
  const customerId = await deps.requireCustomerId()
  let record = await owned(deps, customerId, id)
  if (record.pending && record.view.status !== 'uncertain') {
    if (record.pending.expiresAt > now(deps)) return record.view
    const recovered = await deps.repository.compareAndSet(record, {
      ...record, view: changed(record, { status: 'uncertain', progress: null, error: uncertainError }),
    })
    if (!recovered) return (await owned(deps, customerId, id)).view
    record = recovered
  }
  if (!record.sessionId) return record.view
  let result: Awaited<ReturnType<PlanningAgent['read']>>
  try {
    result = await bounded(() => deps.agent().read({ sessionId: record.sessionId!, afterSequence: record.sequence,
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
  if (result.sequence < record.sequence || (result.sequence === record.sequence && !confirmationClosed && !['failed', 'blocked'].includes(result.status))) return record.view
  const proposal = result.proposal ?? record.view.proposal
  const messages = [...record.view.messages]
  const answersNewTurn = result.status === 'ready' && messages.at(-1)?.role === 'user'
  if (result.proposal && (answersNewTurn || !isDeepStrictEqual(result.proposal, record.view.proposal))) {
    const messageId = `assistant:${record.sessionId}:${result.sequence}`
    if (!messages.some(message => message.id === messageId)) {
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
