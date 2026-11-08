import { Brief, Candidate, EventView } from '../../contracts/records'

export interface RecoveryInput {
  view: EventView
  expectedBriefRevision: number
  expectedPlanRevision: number
  disruption: { unavailableActionIds?: string[]; headcount?: number }
  /** Independent research leads, in the event's currency; never reservations. */
  candidates?: Candidate[]
}

export interface CandidateComparison {
  /** Parsed detached lead retains evidence mode, provenance, sources and timestamps. */
  candidate: Candidate
  candidateId: string
  estimatedReplacementSpend: number | null
  taxesAndDelivery: Candidate['taxesAndDelivery']
  replacementCancellationTermsKnown: boolean
  /** Contract terms alone cannot establish a retained charge or refund. */
  retainedCancellationCharges: null
  totalRecoveryCost: null
  reservationConfirmed: false
}

export interface RecoveryPreview {
  eventId: string
  sourceBriefRevision: number
  sourcePlanRevision: number
  proposedBriefRevision: number
  affectedActionIds: string[]
  preservedActionIds: string[]
  reconcileActionIds: string[]
  safeToResearchActionIds: string[]
  researchBrief: Brief
  candidateComparisons: CandidateComparison[]
  requiresFreshApproval: true
}

/** Pure proposal only. The caller must load an authorized current snapshot and
 * recheck revisions when applying any later change; this creates no plan. */
export function previewRecovery(input: RecoveryInput): RecoveryPreview {
  const view = EventView.parse(input.view)
  const { event, plan } = view
  if (event.status === 'canceled' || event.status === 'canceling' || event.cancelRequestedAt !== null) {
    throw new Error('Cancellation has started; recovery is unavailable')
  }
  if (!plan || event.briefRevision !== input.expectedBriefRevision || event.planRevision !== input.expectedPlanRevision ||
      plan.eventId !== event.eventId || plan.briefRevision !== event.briefRevision || plan.revision !== event.planRevision) {
    throw new Error('A current matching event and plan revision is required')
  }
  const unavailable = input.disruption.unavailableActionIds ?? []
  const headcount = input.disruption.headcount
  if (headcount !== undefined && (!Number.isSafeInteger(headcount) || headcount <= 0)) {
    throw new Error('Headcount must be a positive integer')
  }
  if (unavailable.length === 0 && (headcount === undefined || headcount === event.brief.headcount)) {
    throw new Error('Report an unavailable action or changed headcount')
  }
  const ids = new Set(plan.actions.map(action => action.actionId))
  if (ids.size !== plan.actions.length || unavailable.some(id => !ids.has(id)) ||
      plan.actions.some(action => action.dependsOn.some(id => !ids.has(id)))) {
    throw new Error('Recovery requires valid unique action IDs and dependencies')
  }
  const affected = new Set(headcount !== undefined && headcount !== event.brief.headcount ? ids : unavailable)
  let changed = true
  while (changed) {
    changed = false
    for (const action of plan.actions) {
      if (!affected.has(action.actionId) && action.dependsOn.some(id => affected.has(id))) {
        affected.add(action.actionId)
        changed = true
      }
    }
  }
  const affectedActionIds = plan.actions.filter(action => affected.has(action.actionId)).map(action => action.actionId)
  // Any possibly active commitment or cancellation must be checked before
  // replacement execution; succeeded commitments also need cancellation review.
  const reconcile = new Set(view.attempts.filter(attempt => affected.has(attempt.actionId) &&
    ['pending', 'running', 'unknown', 'succeeded'].includes(attempt.state)).map(attempt => attempt.actionId))
  return {
    eventId: event.eventId,
    sourceBriefRevision: event.briefRevision,
    sourcePlanRevision: event.planRevision,
    proposedBriefRevision: event.briefRevision + 1,
    affectedActionIds,
    preservedActionIds: plan.actions.filter(action => !affected.has(action.actionId)).map(action => action.actionId),
    reconcileActionIds: affectedActionIds.filter(id => reconcile.has(id)),
    safeToResearchActionIds: affectedActionIds.filter(id => !reconcile.has(id)),
    researchBrief: Brief.parse({ ...event.brief, headcount: headcount ?? event.brief.headcount }),
    candidateComparisons: (input.candidates ?? []).map(candidate => {
      const lead = Candidate.parse(candidate)
      return {
        candidate: lead,
        candidateId: lead.candidateId,
        estimatedReplacementSpend: lead.priceEstimate,
        taxesAndDelivery: lead.taxesAndDelivery,
        replacementCancellationTermsKnown: lead.cancellationTerms.known,
        retainedCancellationCharges: null,
        totalRecoveryCost: null,
        reservationConfirmed: false,
      }
    }),
    requiresFreshApproval: true,
  }
}
