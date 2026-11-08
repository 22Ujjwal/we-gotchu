import { describe, expect, it } from 'vitest'
import { createSupplierInquiryTransport } from './transport'
import { InquiryConflict, SendRejected } from './types'
import type { InquiryInput, MailProvider, OperationRepository, SendOperation } from './types'

const input: InquiryInput = {
  requestId: 'request-1', conversationId: 'conversation-1', inquiryId: 'inquiry-1',
  draftRevision: 2, to: 'venue@example.com', subject: 'Approved subject', text: 'Exact approved text.\nNo booking.',
}

function setup() {
  const rows = new Map<string, SendOperation>()
  const sends: unknown[] = []
  const store: OperationRepository = {
    async reserve(intent) {
      const existing = [...rows.values()].find(r => r.input.requestId === intent.input.requestId)
      if (existing) return { created: false, operation: structuredClone(existing) }
      const operation: SendOperation = { ...structuredClone(intent), id: 'op-1', result: { operationId: 'op-1', provider: 'agentmail', status: 'uncertain' } }
      rows.set(operation.id, operation)
      return { created: true, operation: structuredClone(operation) }
    },
    async get(id) { return structuredClone(rows.get(id) ?? null) },
    async saveResult(id, result) { rows.get(id)!.result = structuredClone(result) },
  }
  const provider: MailProvider = {
    inboxId: 'team@agentmail.to',
    async send(body, key) {
      expect(rows.get('op-1')?.result.status).toBe('uncertain')
      sends.push({ body, key })
      return { messageId: 'message-1', threadId: 'thread-1' }
    },
    async getMessage(id) { return { messageId: id, threadId: 'thread-1', inboxId: 'team@agentmail.to', from: 'team@agentmail.to', to: ['venue@example.com'], timestamp: '2026-11-08T12:00:00.000Z' } },
  }
  const create = () => createSupplierInquiryTransport({ operations: store, provider, now: () => new Date('2026-11-08T12:00:00Z') })
  return { rows, sends, store, provider, create }
}

describe('supplier inquiry send recovery', () => {
  it('persists the approved send and reuses its recorded result after restart', async () => {
    const s = setup()
    const first = await s.create().sendInquiry(input)
    expect(first).toEqual({ operationId: 'op-1', provider: 'agentmail', status: 'accepted', messageId: 'message-1', threadId: 'thread-1', acceptedAt: '2026-11-08T12:00:00.000Z' })
    expect(s.sends).toEqual([{ body: { to: 'venue@example.com', subject: 'Approved subject', text: 'Exact approved text.\nNo booking.' }, key: expect.stringMatching(/^[A-Za-z0-9._~-]{1,256}$/) }])
    expect(s.rows.get('op-1')?.input).toEqual(input)
    expect(s.rows.get('op-1')?.result.status).toBe('accepted')
    expect(await s.create().sendInquiry({ ...input })).toEqual(first)
    expect(s.sends).toHaveLength(1)
  })

  it('rejects a changed recipient, text or approval identity for an existing request', async () => {
    const s = setup()
    await s.create().sendInquiry(input)
    for (const change of [{ to: 'other@example.com' }, { text: 'changed' }, { draftRevision: 3 }, { conversationId: 'another' }, { inquiryId: 'another' }, { subject: 'changed' }]) {
      await expect(s.create().sendInquiry({ ...input, ...change })).rejects.toBeInstanceOf(InquiryConflict)
    }
    expect(s.sends).toHaveLength(1)
  })

  it('allows only one concurrent caller to attempt sending', async () => {
    const s = setup()
    const results = await Promise.all([s.create().sendInquiry(input), s.create().sendInquiry(input)])
    expect(results.map(r => r.status).sort()).toEqual(['accepted', 'uncertain'])
    expect(s.sends).toHaveLength(1)
  })

  it('keeps a lost response uncertain across retries and reconciliation', async () => {
    const s = setup()
    s.provider.send = async () => { s.sends.push('accepted but response lost'); throw new Error('sensitive network detail') }
    expect((await s.create().sendInquiry(input)).status).toBe('uncertain')
    expect((await s.create().sendInquiry(input)).status).toBe('uncertain')
    expect((await s.create().reconcileInquiry('op-1'))?.status).toBe('uncertain')
    expect(s.sends).toHaveLength(1)
  })

  it('never sends if saving intent fails', async () => {
    const s = setup()
    s.store.reserve = async () => { throw new Error('database unavailable') }
    await expect(s.create().sendInquiry(input)).rejects.toThrow('database unavailable')
    expect(s.sends).toHaveLength(0)
  })

  it('returns uncertain references if acceptance cannot be persisted, without retrying send', async () => {
    const s = setup()
    s.store.saveResult = async () => { throw new Error('database unavailable') }
    expect(await s.create().sendInquiry(input)).toMatchObject({ status: 'uncertain', messageId: 'message-1', threadId: 'thread-1' })
    expect((await s.create().sendInquiry(input)).status).toBe('uncertain')
    expect(s.sends).toHaveLength(1)
  })

  it('records only established rejection as failed and never exposes provider text', async () => {
    const s = setup()
    s.provider.send = async () => { throw new SendRejected('provider_403') }
    expect(await s.create().sendInquiry(input)).toEqual({ status: 'failed', operationId: 'op-1', provider: 'agentmail', code: 'provider_403', reason: 'Provider rejected the inquiry' })
    expect((await s.create().sendInquiry(input)).status).toBe('failed')
  })

  it('reconciles saved references by read-only lookup and keeps acceptance separate from delivery', async () => {
    const s = setup()
    await s.create().sendInquiry(input)
    s.rows.get('op-1')!.result = { operationId: 'op-1', provider: 'agentmail', status: 'uncertain', messageId: 'message-1' }
    expect(await s.create().reconcileInquiry('op-1')).toMatchObject({ status: 'accepted', messageId: 'message-1', threadId: 'thread-1' })
    expect(s.sends).toHaveLength(1)
    expect(await s.create().reconcileInquiry('missing')).toBeNull()
  })

  it('rejects malformed input before persisting or sending', async () => {
    const s = setup()
    for (const change of [{ to: 'first@example.com,other@example.com' }, { subject: 'hello\r\nBcc: secret@example.com' }, { text: '' }, { requestId: '' }, { draftRevision: -1 }]) {
      await expect(s.create().sendInquiry({ ...input, ...change })).rejects.toThrow()
    }
    expect(s.rows.size).toBe(0)
  })
})
