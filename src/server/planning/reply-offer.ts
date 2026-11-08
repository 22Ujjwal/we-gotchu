import type { OfferGenerator } from '../../agent/planning/offer-generator'
import type { createOfferRepository } from './offer-repository'
import type { PlanningRepository, ReplyJob } from './repository'

export async function prepareReplyOffer(repository: PlanningRepository,
  offers: ReturnType<typeof createOfferRepository>, generate: OfferGenerator, job: ReplyJob): Promise<void> {
  const record = await repository.get(job.customerId, job.conversationId)
  if (!record || record.pending || record.view.paymentLink || record.view.status !== 'ready') return
  const inquiry = record.view.inquiry
  const reply = inquiry?.replies?.at(-1)
  if (!inquiry || inquiry.id !== job.inquiryId || inquiry.status === 'stale'
    || reply?.id !== job.replyId || reply.status !== 'ready'
    || !['quote', 'confirmation'].includes(reply.interpretation?.kind ?? '')
    || !record.view.selections.some(option => option.kind === 'venue' && option.id === inquiry.venue.id)) return
  // Repeated receipt processing must not regenerate an already saved offer for this reply.
  if (record.view.offer?.replyId === reply.id) return
  const offer = await generate(record)
  // The repository rechecks versions and source identity if the customer changes the plan mid-call.
  await offers.save(record.customerId, record.id, record.view.version, offer)
}
