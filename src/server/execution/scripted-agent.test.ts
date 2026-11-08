import { expect, it, vi } from 'vitest'
import { bookedEvent } from '../../contracts'
import { MemoryStore } from '../testing/memory-store'
import { SimulatedSupplierAdapter } from './simulated-adapter'

const current = vi.hoisted(() => ({ deps: undefined as unknown }))
vi.mock('../runtime', () => ({ getExecutionDeps: () => current.deps }))
import { scriptedAgentHooks } from './scripted-agent'

it('settles cancellation and requests the refund when all commitments failed', async () => {
  const store = new MemoryStore()
  store.seed({ event: { ...bookedEvent.event, status: 'canceling', cancelRequestedAt: new Date().toISOString() },
    plan: bookedEvent.plan!, approval: bookedEvent.approval!, payment: bookedEvent.payment! })
  const onAllCanceled = vi.fn(async () => {})
  current.deps = { store, adapterFor: () => new SimulatedSupplierAdapter(), onAllCanceled }
  await store.insertAttempt({ ...bookedEvent.attempts[0], state: 'failed', providerReference: null })
  await scriptedAgentHooks.startSupplierCancellation({ eventId: bookedEvent.event.eventId, paidApprovalIds: [bookedEvent.approval!.approvalId] })
  expect((await store.getEvent(bookedEvent.event.eventId))?.status).toBe('canceled')
  expect(onAllCanceled).toHaveBeenCalledWith(bookedEvent.event.eventId)
})
