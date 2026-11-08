import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createLocalPlanningRepository } from '../../src/server/db/client'
import { createConfiguredReplyInterpreter } from '../../src/agent/planning/reply-interpreter'
import { receivePlanningReply, interpretReply } from '../../src/server/planning/replies'
import type { PlanningRecord } from '../../src/server/planning/repository'

if (process.env.REPLY_LIVE_PROOF !== '1' || process.env.NODE_ENV !== 'development' || !process.env.PLANNING_LOCAL_DB_DIR) {
  throw new Error('Requires explicit local development storage and REPLY_LIVE_PROOF=1. Calls the model, never email.')
}
const sourceId = process.argv[2]
if (!sourceId) throw new Error('Pass an existing local conversation ID to reuse its authenticated owner.')
const storage = await createLocalPlanningRepository(process.env.PLANNING_LOCAL_DB_DIR)
try {
  const source = await storage.repository.getById(sourceId)
  if (!source) throw new Error('The source conversation was not found in the local database.')
  const interpret = createConfiguredReplyInterpreter()
  const checkedInterpret: typeof interpret = async input => {
    try { return await interpret(input) }
    catch (cause) {
      const error = cause as { name?: string; status?: number; code?: string; requestId?: string }
      console.log(JSON.stringify({ interpretationFailure: { name: error.name, status: error.status, code: error.code, requestId: error.requestId } }))
      throw cause
    }
  }
  if (sourceId.startsWith('planning_replyproof_') && source.view.inquiry?.replies?.length) {
    const inquiry = source.view.inquiry
    const reply = inquiry.replies![0]
    await interpretReply(storage.repository, { customerId: source.customerId, conversationId: sourceId, inquiryId: inquiry.id }, reply.id, checkedInterpret)
    const saved = (await storage.repository.getById(sourceId))!.view
    const folder = `.scratch/verification/reply-proof-${sourceId}`
    await mkdir(folder, { recursive: true })
    await writeFile(`${folder}/view.json`, JSON.stringify(saved, null, 2))
    console.log(JSON.stringify({ conversationId: sourceId, reply: saved.inquiry!.replies![0], emailSent: false }))
    if (saved.inquiry!.replies![0].status !== 'ready') process.exitCode = 1
  } else {
  const id = `planning_replyproof_${randomUUID()}`
  const createdAt = new Date().toISOString()
  const venue = { id: 'controlled-room', kind: 'venue' as const, name: 'Controlled test room', url: 'https://example.com/room',
    why: 'Synthetic venue for supplier reply verification. No real reservation.', facts: [], unknowns: ['Awaiting supplier reply'] }
  const record: PlanningRecord = {
    id, customerId: source.customerId, createRequestId: id, initialMessage: 'Controlled reply verification', revision: 0,
    sessionId: null, sequence: 0, pending: null, requests: {}, view: { id, version: 0, status: 'ready',
      messages: [{ id: `${id}:brief`, role: 'user', text: 'Controlled test. Room for 12 adults, December 12, 2026, noon to 3pm Pacific, budget USD 300.', createdAt }],
      proposal: { summary: 'Controlled supplier reply test. No real venue contacted.', nextQuestion: null, options: [venue] },
      selections: [venue], progress: null, error: null, inquiry: {
        id: `inquiry_${randomUUID()}`, revision: 1, status: 'draft', venue, recipient: 'venue@example.com',
        subject: 'Controlled test only', text: 'Please confirm availability, all-in room price and cancellation for 12 adults on December 12, 2026, noon to 3pm America/Los_Angeles.',
        contactSourceUrl: null, contextMessageIds: [`${id}:brief`], updatedAt: createdAt,
        delivery: { status: 'accepted', requestId: `${id}:fixture-send`, draftRevision: 1, approvedAt: createdAt,
          expiresAt: 0, messageId: `${id}:sent`, threadId: `${id}:thread`, acceptedAt: createdAt },
      },
    },
  }
  await storage.repository.insert(record)
  const message = { provider: 'controlled-fixture', messageId: `${id}:reply`, threadId: `${id}:thread`, inReplyTo: `${id}:sent`,
    from: 'venue@example.com', to: ['planner@example.com'], subject: 'Controlled quote',
    text: 'We can offer the room for 12 adults on December 12, 2026, noon to 3pm America/Los_Angeles. The room price is USD 200. Tax and cleaning are extra; we have not calculated them. A USD 50 deposit is included in the room price. Cancellation terms will follow. This is a quote only, not a reservation.',
    receivedAt: new Date().toISOString(), originalRef: `${id}:controlled-original`, mode: 'simulated' }
  const result = await receivePlanningReply(storage.repository, id, record.view.inquiry!.id, message, checkedInterpret)
  const saved = (await storage.repository.getById(id))!
  const reply = saved.view.inquiry!.replies!.find(item => item.id === result.replyId)!
  const folder = `.scratch/verification/reply-proof-${id}`
  await mkdir(folder, { recursive: true })
  await writeFile(`${folder}/view.json`, JSON.stringify(saved.view, null, 2))
  console.log(JSON.stringify({ conversationId: id, url: `http://localhost:3000/planning/${id}`, status: reply.status,
    interpretation: reply.interpretation, evidence: `${folder}/view.json`, emailSent: false }))
  if (reply.status !== 'ready') process.exitCode = 1
  }
} finally {
  await storage.close()
}
