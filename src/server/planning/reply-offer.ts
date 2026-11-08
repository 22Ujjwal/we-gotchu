import type { OfferGenerator } from '../../agent/planning/offer-generator'
import type { createOfferRepository } from './offer-repository'
import type { PlanningRepository, ReplyJob } from './repository'

export async function prepareReplyOffer(_repository: PlanningRepository,
  _offers: ReturnType<typeof createOfferRepository>, _generate: OfferGenerator, _job: ReplyJob): Promise<void> {}
