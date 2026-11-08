import { calculateOfferCosts } from '../../agent/planning/offer-contract'
import type { MailProvider } from '../email/supplier-inquiries/types'
import { continueCompanyReply } from './company-preparation'
import type { PlanningRecord, PlanningRepository } from './repository'
import { offerReadyEmail, sendCustomerNotification } from './customer-notifications'

export async function continueArrangement(repository: PlanningRepository, record: PlanningRecord,
  provider: MailProvider, env: NodeJS.ProcessEnv): Promise<void> {
  const arrangement = record.view.arrangement
  const inquiry = record.view.inquiry
  const reply = inquiry?.replies?.at(-1)
  if (!arrangement || !arrangement.controlled || env.NODE_ENV !== 'development'
    || !['awaiting_reply', 'offer_ready'].includes(arrangement.status)
    || record.pending || record.view.paymentLink || inquiry?.id !== arrangement.inquiryId || inquiry.status !== 'draft'
    || inquiry.recipient !== env.PLANNING_TEST_SUPPLIER_EMAIL || reply?.status !== 'ready') return
  const offer = record.view.offer?.replyId === reply.id ? record.view.offer : undefined
  const costs = offer && calculateOfferCosts(offer)
  if (offer && !offer.missing.length && costs?.ok && (!offer.expiresAt || Date.parse(offer.expiresAt) > Date.now())) {
    await repository.compareAndSet(record, { ...record, view: { ...record.view, version: record.view.version + 1,
      arrangement: { ...arrangement, status: 'offer_ready', detail: 'The supplier terms are ready. Review the complete offer before approving payment.' } } })
    await sendCustomerNotification(repository, provider, record, `${arrangement.id}:offer:${offer.id}:${offer.revision}`,
      offerReadyEmail(record, costs.total, env.APP_URL ?? 'http://localhost:3000'))
    return
  }
  await continueCompanyReply(repository, record, env)
}
