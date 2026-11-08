import { z } from 'zod'
import { Approval, EventView, Payment, type Brief } from '../../contracts'

export class EventApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string,
    readonly details: Record<string, unknown> = {}) { super(message) }
}

const Checkout = z.object({ approval: Approval, payment: Payment, checkoutUrl: z.url() })
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export function createEventApi(fetcher: Fetcher = (url, init) => fetch(url, init)) {
  async function request<T>(url: string, schema: z.ZodType<T>, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    let response: Response
    try {
      response = await fetcher(url, { method, credentials: 'same-origin', cache: 'no-store', signal,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
    } catch (error) {
      if (signal?.aborted) throw error
      // Retrying a write could duplicate a successful action whose response was lost.
      throw new EventApiError(0, method === 'GET' ? 'connection_failed' : 'outcome_unknown',
        method === 'GET' ? 'Could not load the event. Check your connection.' : 'The action outcome is unknown. Refresh the event before trying again.')
    }
    const invalidResponse = () => new EventApiError(response.status,
      method === 'GET' ? 'invalid_response' : 'outcome_unknown',
      method === 'GET' ? 'The event service returned an invalid response.' : 'The action outcome is unknown. Refresh the event before trying again.')
    let data: unknown
    try { data = await response.json() } catch {
      throw invalidResponse()
    }
    if (!response.ok) {
      const error = data && typeof data === 'object' ? data as Record<string, unknown> : {}
      throw new EventApiError(response.status, typeof error.errorCode === 'string' ? error.errorCode : 'request_failed',
        typeof error.message === 'string' ? error.message : 'The event request failed.', error)
    }
    const parsed = schema.safeParse(data)
    if (!parsed.success) throw invalidResponse()
    return parsed.data
  }
  const path = (id: string) => `/api/events/${encodeURIComponent(id)}`
  return {
    create: (brief: Brief) => request('/api/events', EventView, 'POST', brief),
    read: (id: string, afterSequence?: number, signal?: AbortSignal) => request(
      path(id) + (afterSequence === undefined ? '' : `?afterSequence=${afterSequence}`), EventView, 'GET', undefined, signal),
    update: (id: string, expectedBriefRevision: number, changes: Partial<Brief>, signal?: AbortSignal) => request(
      `${path(id)}/brief`, EventView, 'PATCH', { expectedBriefRevision, changes }, signal),
    approve: (id: string, planId: string, planRevision: number, signal?: AbortSignal) => request(
      `${path(id)}/approve`, Checkout, 'POST', { planId, planRevision }, signal),
    cancel: (id: string, signal?: AbortSignal) => request(`${path(id)}/cancel`, EventView, 'POST', undefined, signal),
  }
}

export function mergeEventView(previous: EventView | null, next: EventView): EventView {
  if (previous?.event.eventId !== next.event.eventId) previous = null
  if (previous) {
    if (next.event.briefRevision < previous.event.briefRevision) return previous
    if (next.event.briefRevision === previous.event.briefRevision) {
      if (next.event.progressSequence < previous.event.progressSequence ||
          next.event.planRevision < previous.event.planRevision ||
          previous.event.cancelRequestedAt && !next.event.cancelRequestedAt) return previous
      // Summary writes can settle before a progress entry is appended.
      // A matching progress cursor alone is not proof that a snapshot is current.
      if (previous.payment && !next.payment || previous.approval && !next.approval) return previous
      if (previous.payment?.paymentId === next.payment?.paymentId && previous.payment && next.payment) {
        if (previous.payment.state !== 'pending' && next.payment.state === 'pending' ||
            previous.payment.refundState === 'succeeded' && next.payment.refundState !== 'succeeded') return previous
      }
    }
  }
  const entries = new Map<number, EventView['progress'][number]>()
  for (const entry of [...(previous?.progress ?? []), ...next.progress]) {
    if (entry.eventId === next.event.eventId && entry.sequence <= next.event.progressSequence) entries.set(entry.sequence, entry)
  }
  return { ...next, progress: [...entries.values()].sort((a, b) => a.sequence - b.sequence) }
}
