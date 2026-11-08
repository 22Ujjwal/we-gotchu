import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { EventView } from '../../contracts'
import { previewFromBrief } from '../../lib/hostwell/brief-adapter'
import { ApiError } from '../events/errors'
import type { PlanningRecord } from './repository'
import { commandPlanning, type PlanningDeps } from './service'

const inputSchema = z.object({ candidateId: z.string().min(1), briefRevision: z.number().int(), customerEmail: z.email() }).strict()

// Reuse saved research without pretending its discovery metadata is supplier evidence.
export async function arrangeResearchedEvent(deps: PlanningDeps, event: EventView, input: unknown) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) throw new ApiError(422, 'invalid_input', 'Choose a venue and provide your email.')
  const customerId = await deps.requireCustomerId()
  const { candidateId, briefRevision, customerEmail } = parsed.data
  const research = event.researchResult
  if (event.event.briefRevision !== briefRevision || !research || research.superseded || research.briefRevision !== briefRevision) {
    throw new ApiError(409, 'stale_research', 'Your brief changed. Refresh your options.')
  }
  if (event.payment || event.event.cancelRequestedAt) throw new ApiError(409, 'event_locked', 'This event already has a payment or cancellation in progress.')
  const candidate = research.candidates.find(item => item.candidateId === candidateId && item.kind === 'venue')
  if (!candidate) throw new ApiError(422, 'venue_required', 'Choose a venue from this event.')
  if (!deps.arrange) throw new ApiError(503, 'arrange_unavailable', 'Supplier coordination is not configured.')
  const key = createHash('sha256').update(JSON.stringify([event.event.eventId, briefRevision, candidateId])).digest('hex')
  const id = `planning_${key}`
  const brief = previewFromBrief(event.event.brief)
  const message = `Arrange the selected venue for this event. Customer brief: ${JSON.stringify(event.event.brief)}. Venue: ${candidate.name}. Source: ${candidate.sources[0].url}. Research estimates are not supplier quotes.`
  const venue = { id: candidateId, kind: 'venue' as const, name: candidate.name, url: candidate.sources[0].url,
    why: 'Selected by the customer.', facts: [], unknowns: ['Confirm availability, total price and cancellation terms.'] }
  const record: PlanningRecord = { id, customerId, createRequestId: `event:${key}`, initialMessage: message,
    revision: 0, sessionId: null, sequence: 0, pending: null, requests: {},
    view: { id, version: 0, status: 'ready', brief, selections: [venue], progress: null, error: null,
      messages: [{ id: `event:${key}`, role: 'user', text: message, createdAt: new Date().toISOString() }],
      proposal: { summary: 'Your selected venue.', nextQuestion: null, options: [venue] } } }
  const saved = await deps.repository.insert(record)
  if (saved.view.arrangement) return saved.view
  return commandPlanning(deps, saved.id, { kind: 'arrange', requestId: `arrange:${key}`, expectedVersion: saved.view.version, customerEmail })
}
