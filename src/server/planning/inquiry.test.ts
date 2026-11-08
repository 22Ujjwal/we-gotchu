import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { PlanningAgent, PlanningOption } from '../../agent/planning/contract'
import { createTestPlanningRepository } from '../db/client'
import { commandPlanning, createPlanning, getPlanning, type PlanningDeps } from './service'

const venue: PlanningOption = {
  id: 'room', kind: 'venue', name: 'Test Room', url: 'https://example.com/room', why: 'Seats 12', unknowns: ['Date availability'],
  facts: [{ label: 'Contact', value: 'events@example.com', quote: 'For events email events@example.com', sourceUrl: 'https://example.com/contact', basis: 'published' }],
}
let db: Awaited<ReturnType<typeof createTestPlanningRepository>>
let deps: PlanningDeps
let agent: PlanningAgent
beforeEach(async () => {
  db = await createTestPlanningRepository()
  agent = {
    start: vi.fn(async () => ({ sessionId: 'session', sequence: 1 })),
    send: vi.fn(async () => ({ sequence: 3 })),
    read: vi.fn(async () => ({ status: 'ready' as const, sequence: 2, proposal: { summary: 'One room', nextQuestion: null, options: [venue] }, progress: null, error: null })),
  }
  deps = { repository: db.repository, agent: () => agent, requireCustomerId: async () => 'customer' }
})
afterEach(async () => db.close())
async function selected() {
  const created = await createPlanning(deps, { requestId: 'create', message: 'Dinner for 12 on December 12, noon to 3pm Pacific. Budget USD 300.' })
  const ready = await getPlanning(deps, created.id)
  return commandPlanning(deps, ready.id, { kind: 'select', requestId: 'select', expectedVersion: ready.version, optionId: venue.id })
}

test('draft and edits persist with source and version checks, without sending to the planner or email', async () => {
  let view = await selected()
  const command = { kind: 'prepare_inquiry', requestId: 'draft', expectedVersion: view.version }
  view = await commandPlanning(deps, view.id, command)
  expect(view.inquiry).toMatchObject({ status: 'draft', revision: 1, recipient: 'events@example.com', contactSourceUrl: 'https://example.com/contact', venue })
  expect(view.inquiry?.text).toContain('Dinner for 12')
  expect(view.inquiry?.text).toContain('cancellation')
  expect((await commandPlanning(deps, view.id, command)).inquiry).toEqual(view.inquiry)
  const edit = { kind: 'save_inquiry', requestId: 'edit', expectedVersion: view.version, inquiryId: view.inquiry!.id,
    expectedDraftRevision: 1, recipient: 'host@example.com', subject: 'Our dinner', text: 'Please confirm the total for our dinner.' }
  view = await commandPlanning(deps, view.id, edit)
  expect(view.inquiry).toMatchObject({ revision: 2, recipient: 'host@example.com', contactSourceUrl: null, subject: edit.subject, text: edit.text })
  expect((await getPlanning(deps, view.id)).inquiry).toEqual(view.inquiry)
  await expect(commandPlanning(deps, view.id, { ...edit, requestId: 'stale', expectedVersion: view.version })).rejects.toMatchObject({ status: 409 })
  expect(agent.send).not.toHaveBeenCalled()
})

test('unverified contacts stay empty and changing the selected venue invalidates the saved draft', async () => {
  vi.mocked(agent.read).mockResolvedValue({ status: 'ready', sequence: 2, proposal: { summary: 'Room', nextQuestion: null,
    options: [{ ...venue, facts: [{ ...venue.facts[0], basis: 'estimate' }] }] }, progress: null, error: null })
  let view = await selected()
  view = await commandPlanning(deps, view.id, { kind: 'prepare_inquiry', requestId: 'draft', expectedVersion: view.version })
  expect(view.inquiry).toMatchObject({ recipient: '', contactSourceUrl: null })
  view = await commandPlanning(deps, view.id, { kind: 'select', requestId: 'remove', expectedVersion: view.version, optionId: venue.id })
  expect(view.inquiry?.status).toBe('stale')
  expect(view.inquiry?.venue.id).toBe(venue.id)
  await expect(commandPlanning(deps, view.id, { kind: 'prepare_inquiry', requestId: 'without-venue', expectedVersion: view.version })).rejects.toMatchObject({ status: 422 })
})

test('a new customer message marks the draft stale without changing its text', async () => {
  let view = await selected()
  view = await commandPlanning(deps, view.id, { kind: 'prepare_inquiry', requestId: 'draft', expectedVersion: view.version })
  const draft = view.inquiry!
  view = await commandPlanning(deps, view.id, { kind: 'message', requestId: 'change-date', expectedVersion: view.version, message: 'Move the dinner to December 19.' })
  expect(view.inquiry).toEqual({ ...draft, status: 'stale' })
  await expect(commandPlanning(deps, view.id, { kind: 'save_inquiry', requestId: 'old-draft', expectedVersion: view.version,
    inquiryId: draft.id, expectedDraftRevision: draft.revision, recipient: draft.recipient, subject: draft.subject, text: draft.text })).rejects.toMatchObject({ status: 409 })
})

test('approves the exact saved draft once and records acceptance without claiming delivery', async () => {
  let view = await selected()
  view = await commandPlanning(deps, view.id, { kind: 'prepare_inquiry', requestId: 'draft', expectedVersion: view.version })
  const draft = view.inquiry!
  const sendInquiry = vi.fn(async () => ({ status: 'accepted' as const, messageId: 'mail-1', threadId: 'thread-1', acceptedAt: '2026-11-08T10:00:00Z' }))
  deps.mail = { sendInquiry }
  const command = { kind: 'send_inquiry', requestId: 'approved-send', expectedVersion: view.version, inquiryId: draft.id, expectedDraftRevision: draft.revision }
  const result = await commandPlanning(deps, view.id, command)
  expect(result.inquiry?.delivery).toMatchObject({ status: 'accepted', requestId: command.requestId, draftRevision: 1, messageId: 'mail-1' })
  expect(sendInquiry).toHaveBeenCalledExactlyOnceWith({ requestId: command.requestId, conversationId: view.id,
    inquiryId: draft.id, draftRevision: 1, to: draft.recipient, subject: draft.subject, text: draft.text })
  expect((await commandPlanning(deps, view.id, command)).inquiry).toEqual(result.inquiry)
  await expect(commandPlanning(deps, view.id, { ...command, requestId: 'second-click', expectedVersion: result.version })).rejects.toMatchObject({ status: 409 })
  expect(sendInquiry).toHaveBeenCalledTimes(1)
})

test('an unconfirmed mail send persists uncertainty and cannot be resent or edited', async () => {
  let view = await selected()
  view = await commandPlanning(deps, view.id, { kind: 'prepare_inquiry', requestId: 'draft', expectedVersion: view.version })
  deps.mail = { sendInquiry: vi.fn(async () => { throw new Error('Connection dropped after provider accepted mail') }) }
  const draft = view.inquiry!
  const command = { kind: 'send_inquiry', requestId: 'uncertain-send', expectedVersion: view.version, inquiryId: draft.id, expectedDraftRevision: draft.revision }
  view = await commandPlanning(deps, view.id, command)
  expect(view.inquiry?.delivery?.status).toBe('uncertain')
  expect((await getPlanning(deps, view.id)).inquiry?.delivery?.status).toBe('uncertain')
  await commandPlanning(deps, view.id, command)
  await expect(commandPlanning(deps, view.id, { kind: 'save_inquiry', requestId: 'edit-sent', expectedVersion: view.version,
    inquiryId: draft.id, expectedDraftRevision: draft.revision, recipient: draft.recipient, subject: draft.subject, text: 'Changed' })).rejects.toMatchObject({ status: 409 })
  expect(deps.mail.sendInquiry).toHaveBeenCalledTimes(1)
})

test('a rejected inquiry can be replaced explicitly while its attempted message is retained', async () => {
  let view = await selected()
  view = await commandPlanning(deps, view.id, { kind: 'prepare_inquiry', requestId: 'draft', expectedVersion: view.version })
  deps.mail = { sendInquiry: vi.fn(async () => ({ status: 'failed' as const, code: 'recipient_rejected', reason: 'Recipient rejected' })) }
  const draft = view.inquiry!
  view = await commandPlanning(deps, view.id, { kind: 'send_inquiry', requestId: 'rejected-send', expectedVersion: view.version, inquiryId: draft.id, expectedDraftRevision: 1 })
  expect(view.inquiry?.delivery?.status).toBe('failed')
  const replacement = await commandPlanning(deps, view.id, { kind: 'prepare_inquiry', requestId: 'replace-rejected', expectedVersion: view.version })
  expect(replacement.inquiry?.id).not.toBe(draft.id)
  expect(replacement.inquiry?.delivery).toBeUndefined()
  expect((await db.repository.get('customer', view.id))?.inquiryHistory?.[0].delivery?.status).toBe('failed')
  expect(deps.mail.sendInquiry).toHaveBeenCalledTimes(1)
})
