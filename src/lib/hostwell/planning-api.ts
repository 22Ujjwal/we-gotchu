import { z } from 'zod'
import { arrangementSchema, planningBriefSchema, planningCreateSchema } from '../../agent/planning/contract'
import { selectedOfferSchema, planningPaymentLinkSchema } from '../../agent/planning/offer-contract'
import { planningInquirySchema, planningOptionSchema, planningProposalSchema, planningApprovalSchema, planningActivitySchema, type PlanningCommand, type PlanningView } from '../../agent/planning/contract'

const viewSchema: z.ZodType<PlanningView> = z.object({
  id: z.string().min(1), version: z.number().int().nonnegative(),
  brief: planningBriefSchema.optional(), arrangement: arrangementSchema.optional(),
  status: z.enum(['working', 'ready', 'failed', 'uncertain', 'blocked']),
  messages: z.array(z.object({ id: z.string(), role: z.enum(['user', 'assistant']), text: z.string(), createdAt: z.string() })),
  proposal: planningProposalSchema.nullable(), inquiry: planningInquirySchema.optional(), selections: z.array(planningOptionSchema),
  progress: z.string().nullable(), error: z.string().nullable(), approvals: z.array(planningApprovalSchema).optional(),
  activity: z.array(planningActivitySchema).optional(), canReviewResearch: z.boolean().optional(), canSendInquiry: z.boolean().optional(), canArrange: z.boolean().optional(),
  offer: selectedOfferSchema.optional(), paymentLink: planningPaymentLinkSchema.optional(),
})
export type PlanningCreate = z.infer<typeof planningCreateSchema>
export class PlanningApiError extends Error {
  constructor(readonly status: number, readonly uncertain: boolean) {
    super(uncertain ? 'We could not confirm whether your request was saved. Your draft is kept. Please check the saved status before taking any further action.'
      : status === 409 ? 'Your plan changed. Review the latest plan, then submit again. Your draft is kept.'
        : [401, 403, 404].includes(status) ? 'This plan is not available. Sign in with the account that created it.'
          : status === 422 || status === 400 ? 'Please check your message and try again.'
            : 'We could not load your plan. Check your connection and try again.')
  }
}
export function createPlanningApi() {
  async function request(path: string, signal: AbortSignal, body?: PlanningCreate | PlanningCommand): Promise<PlanningView> {
    let response: Response
    try {
      response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
    } catch (error) {
      if (signal.aborted) throw error
      throw new PlanningApiError(0, !!body)
    }
    if (!response.ok) throw new PlanningApiError(response.status, !!body && response.status >= 500)
    try { return viewSchema.parse(await response.json()) }
    catch { throw new PlanningApiError(response.status, !!body) }
  }
  const path = (id: string) => `/api/planning/${encodeURIComponent(id)}`
  return {
    create: (body: PlanningCreate, signal: AbortSignal) => request('/api/planning', signal, body),
    read: (id: string, signal: AbortSignal, savedOnly = false, reconcileMail = false) => request(`${path(id)}${savedOnly ? '?saved=1' : reconcileMail ? '?mail=1' : ''}`, signal),
    command: (id: string, body: PlanningCommand, signal: AbortSignal) => request(path(id), signal, body),
  }
}
