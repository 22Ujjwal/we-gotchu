import { beforeEach, expect, it, vi } from 'vitest'
import type { PlanningRecord, PlanningRepository } from './repository'

const sessions = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), get: vi.fn(), confirmTool: vi.fn() }))
vi.mock('@usenaive-sdk/managed-agents', () => ({ createClient: () => ({ sessions }) }))
import { continueCompanyReply } from './company-preparation'

beforeEach(() => vi.resetAllMocks())

it.each([false, true])('reuses the saved conversation with an uncertain first send: %s', async (uncertain) => {
  let record = { id: 'conversation', customerId: 'customer', pending: null,
    companySession: { id: 'existing-session', arrangementId: 'arrangement' },
    view: { status: 'ready', arrangement: { id: 'arrangement', inquiryId: 'inquiry', controlled: true, status: 'awaiting_reply' },
      inquiry: { id: 'inquiry', revision: 3, replies: [{ id: 'reply', status: 'ready' }] } },
  } as PlanningRecord
  const repository: PlanningRepository = {
    getById: async () => record,
    pendingReplyJobs: async () => [],
    insert: async (value) => value,
    get: async () => record,
    compareAndSet: async (_before: PlanningRecord, after: PlanningRecord) => (record = after),
  }
  sessions.create.mockResolvedValue({ id: 'new-session' })
  sessions.send.mockResolvedValue({ session_id: 'existing-session', accepted_seq: 2 })
  if (uncertain) sessions.send.mockRejectedValueOnce(new Error('Response lost'))
  sessions.get.mockResolvedValue({ agent_id: 'supplier', metadata: { arrangementId: 'arrangement' }, status: 'idle', stop_reason: 'end_turn' })
  const env = { NAIVE_COMPANY_AGENT_ID: 'supplier', NAIVE_API_KEY: 'key', PLANNING_TOOLS_SECRET: 's'.repeat(32) }
  await continueCompanyReply(repository, record, env).catch(() => undefined)
  await continueCompanyReply(repository, record, env).catch(() => undefined)
  await continueCompanyReply(repository, record, env).catch(() => undefined)
  expect(sessions.create).not.toHaveBeenCalled()
  expect(sessions.send).toHaveBeenCalledTimes(3)
  expect(sessions.send.mock.calls[0]).toEqual(sessions.send.mock.calls[1])
  expect(sessions.send.mock.calls[1]).toEqual(sessions.send.mock.calls[2])
  expect(sessions.send).toHaveBeenCalledWith('existing-session', { message: expect.any(String), queue: true },
    { idempotencyKey: 'arrangement-turn:arrangement:supplier_reply:reply' })
})
