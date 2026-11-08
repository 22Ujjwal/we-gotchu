import { expect, it, vi } from 'vitest'
import type { PlanningRecord } from './repository'
import { venueImagesGet } from './venue-images-http'
const record: PlanningRecord = {
  id: 'c1', customerId: 'alice', createRequestId: 'r1', initialMessage: 'party', revision: 1,
  sessionId: 's1', sequence: 1, pending: null, requests: {},
  view: { id: 'c1', version: 4, status: 'ready', messages: [], selections: [], progress: null, error: null,
    proposal: { summary: 'Ready', nextQuestion: null, options: [{ id: 'v1', kind: 'venue', name: 'Harbor Loft', url: 'https://harborloft.example.com', why: 'Fits', facts: [], unknowns: [] }] } },
}
const setup = (owner = 'alice') => ({
  requireCustomerId: async () => owner,
  repository: { get: async (customer: string) => customer === 'alice' ? structuredClone(record) : null },
})
it('checks ownership before any external access', async () => {
  const read = vi.fn()
  const response = await venueImagesGet(setup('bob'), 'c1', 'v1', { read })
  expect(response.status).toBe(404)
  expect(read).not.toHaveBeenCalled()
})
it('rejects unauthenticated callers and missing options', async () => {
  const read = vi.fn()
  const response = await venueImagesGet({ ...setup(), requireCustomerId: async () => { throw { status: 401 } } }, 'c1', 'v1', { read })
  expect(response.status).toBe(401)
  expect((await venueImagesGet(setup(), 'c1', 'absent', { read })).status).toBe(404)
  expect(read).not.toHaveBeenCalled()
})
it('uses the saved URL and returns independent versioned image results', async () => {
  const read = vi.fn(async () => '<title>Harbor Loft</title><img src="/room.jpg" alt="Harbor Loft interior">')
  const response = await venueImagesGet(setup(), 'c1', 'v1', { read, resolve: async () => ['93.184.216.34'] })
  expect(read).toHaveBeenCalledWith(record.view.proposal!.options[0].url)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toMatchObject({ optionId: 'v1', version: 4, status: 'available', images: [{ url: 'https://harborloft.example.com/room.jpg' }] })
})
it.each(['failure', 'missing', 'private', 'timeout'])('keeps proposals unchanged on %s images', async mode => {
  const deps = setup()
  const before = await deps.repository.get('alice')
  const response = await venueImagesGet(deps, 'c1', 'v1', {
    timeoutMs: 20,
    read: async () => {
      if (mode === 'failure') throw new Error('private provider detail')
      if (mode === 'timeout') return new Promise<string>(() => {})
      return mode === 'missing' ? '<title>Harbor Loft</title>' : '<title>Harbor Loft</title><meta property="og:image" content="https://images.example.com/photo.jpg">'
    }, resolve: async () => ['10.0.0.1'],
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.images).toEqual([])
  expect(JSON.stringify(body)).not.toContain('private provider detail')
  expect(await deps.repository.get('alice')).toEqual(before)
  expect(before?.view.proposal?.summary).toBe('Ready')
})
