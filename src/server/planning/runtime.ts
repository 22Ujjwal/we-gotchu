import { notifyPlanningPayment } from './payment-notification'
import { continueArrangement } from './arrangement-followup'
import { arrangementAcknowledgment, sendCustomerNotification } from './customer-notifications'
import { waitUntil } from '@vercel/functions'
import { createCompanyTools } from './company-tools'
import { prepareCompanyInquiry } from './company-preparation'
import { dispatchReplyProcessing, withReplyProcessing } from './reply-dispatch'
import { createConfiguredOfferGenerator } from '../../agent/planning/offer-generator'
import { createConfiguredPlanningAgent } from '../../agent/planning/provider'
import { createConfiguredReplyInterpreter } from '../../agent/planning/reply-interpreter'
import { requireCustomerId } from '../auth'
import { createLocalPlanningRepository, createNeonPlanningStorage } from '../db/client'
import { createAgentMailProvider } from '../email/supplier-inquiries/agentmail'
import { ApiError } from '../events/errors'
import { createPlanningMail } from './mail-integration'
import { processReplyJobs } from './reply-worker'
import { prepareReplyOffer } from './reply-offer'
import { commandPlanning, type PlanningDeps } from './service'

type Storage = Awaited<ReturnType<typeof createLocalPlanningRepository>>
export function createPlanningRuntime(env: NodeJS.ProcessEnv = process.env) {
  let storage: Promise<Storage> | undefined
  let mail: ReturnType<typeof createPlanningMail> | undefined

  async function open(): Promise<Storage> {
    if (env.NODE_ENV === 'development' && env.PLANNING_LOCAL_DB_DIR) {
      return createLocalPlanningRepository(env.PLANNING_LOCAL_DB_DIR)
    }
    if (!env.DATABASE_URL) throw new ApiError(503, 'planning_unavailable', 'Planning storage is not configured.')
    return createNeonPlanningStorage(env.DATABASE_URL)
  }
  async function getStorage() {
    storage ??= open().catch(error => { storage = undefined; throw error })
    return storage
  }
  async function getMail() {
    if (!env.AGENTMAIL_API_KEY || !env.AGENTMAIL_INBOX_ID || !env.AGENTMAIL_WEBHOOK_SECRET) return undefined
    if (!mail) {
      const saved = await getStorage()
      mail = createPlanningMail({ repository: saved.repository, storage: saved.mail, secret: env.AGENTMAIL_WEBHOOK_SECRET,
        provider: createAgentMailProvider({ apiKey: env.AGENTMAIL_API_KEY, inboxId: env.AGENTMAIL_INBOX_ID }) })
    }
    return mail
  }
  const followUp = async (record: import('./repository').PlanningRecord) => {
    const mail = (await getMail())?.transport
    if (!mail || !env.AGENTMAIL_API_KEY || !env.AGENTMAIL_INBOX_ID) return
    await continueArrangement((await getStorage()).repository, record,
      createAgentMailProvider({ apiKey: env.AGENTMAIL_API_KEY, inboxId: env.AGENTMAIL_INBOX_ID }), env)
  }
  const processReplies = async () => {
    const saved = await getStorage()
    const advanceReply = async (job: import('./repository').ReplyJob) => {
      try { await prepareReplyOffer(saved.repository, saved.offers, createConfiguredOfferGenerator(env), job) }
      catch {
        console.error('[planning] Offer preparation could not finish; original reply is retained for the next worker run.')
        return
      }
      const current = await saved.repository.get(job.customerId, job.conversationId)
      if (current) await followUp(current)
    }
    if (env.NAIVE_COMPANY_AGENT_ID && env.PLANNING_TOOLS_SECRET && env.NAIVE_API_KEY) {
      for (const record of await saved.repository.pendingArrangements?.(1) ?? []) {
        await prepareCompanyInquiry(saved.repository, record, env)
        const current = await saved.repository.get(record.customerId, record.id)
        const inquiry = current?.view.inquiry
        const reply = inquiry?.replies?.at(-1)
        if (current && inquiry && reply?.status === 'ready') {
          await advanceReply({ customerId: current.customerId, conversationId: current.id, inquiryId: inquiry.id, replyId: reply.id })
        } else if (current) await followUp(current)
      }
    }
    return processReplyJobs(saved.repository, createConfiguredReplyInterpreter(env), 5, advanceReply)
  }
  return {
    async getCompanyTools() {
      if (!env.PLANNING_TOOLS_SECRET || env.PLANNING_TOOLS_SECRET.length < 32) throw new ApiError(503, 'tools_unavailable', 'Company tools are not configured.')
      const saved = await getStorage()
      const followupTransport = (await getMail())?.transport
      return createCompanyTools(saved.repository, env.PLANNING_TOOLS_SECRET, async record => {
        const arrangement = record.view.arrangement
        const inquiry = record.view.inquiry
        // This local rehearsal may contact only the recipient explicitly configured by the operator.
        if (env.NODE_ENV !== 'development' || !env.PLANNING_TEST_SUPPLIER_EMAIL || !arrangement?.controlled
          || arrangement.inquiryId !== inquiry?.id || arrangement.status !== 'needs_attention'
          || inquiry.recipient !== env.PLANNING_TEST_SUPPLIER_EMAIL || inquiry.delivery) return
        const mail = (await getMail())?.transport
        if (!mail) return
        const view = await commandPlanning({ repository: saved.repository, mail, requireCustomerId: async () => record.customerId,
          agent: () => createConfiguredPlanningAgent(env) }, record.id, {
          kind: 'send_inquiry', requestId: `arrangement-send:${arrangement.id}`, expectedVersion: record.view.version,
          inquiryId: inquiry.id, expectedDraftRevision: inquiry.revision,
        })
        const current = await saved.repository.get(record.customerId, record.id)
        if (!current || current.view.arrangement?.id !== arrangement.id || current.view.arrangement.status === 'stale') return
        const accepted = view.inquiry?.delivery?.status === 'accepted'
        await saved.repository.compareAndSet(current, { ...current, view: { ...current.view, version: current.view.version + 1,
          arrangement: { ...current.view.arrangement, status: accepted ? 'awaiting_reply' : 'needs_attention',
            detail: accepted ? 'The email provider accepted the controlled inquiry. We are waiting for the test supplier reply. Delivery is not yet confirmed.'
              : 'The inquiry send needs review. We will check the saved provider result before trying again.' } } })
      }, env.NODE_ENV === 'development' && followupTransport && env.PLANNING_TEST_SUPPLIER_EMAIL
        ? { transport: followupTransport, recipient: env.PLANNING_TEST_SUPPLIER_EMAIL } : undefined)
    },
    async notifyPayment(checkoutSessionId: string) {
      if (!env.AGENTMAIL_API_KEY || !env.AGENTMAIL_INBOX_ID) return
      const saved = await getStorage()
      await notifyPlanningPayment(saved.store, saved.repository,
        createAgentMailProvider({ apiKey: env.AGENTMAIL_API_KEY, inboxId: env.AGENTMAIL_INBOX_ID }),
        checkoutSessionId, env.APP_URL ?? 'http://localhost:3000')
    },
    async getTransactionStore() { return (await getStorage()).store },
    async getDeps(): Promise<PlanningDeps> {
      return { repository: (await getStorage()).repository, offers: (await getStorage()).offers,
        generateOffer: record => createConfiguredOfferGenerator(env)(record), mail: (await getMail())?.transport, requireCustomerId,
        ...(env.NODE_ENV === 'development' && env.PLANNING_TEST_SUPPLIER_EMAIL ? { testSupplierEmail: env.PLANNING_TEST_SUPPLIER_EMAIL } : {}),
        ...(env.NAIVE_COMPANY_AGENT_ID && env.PLANNING_TOOLS_SECRET && env.NAIVE_API_KEY ? {
          arrange: (record: import('./repository').PlanningRecord) => {
            const work = getStorage().then(async saved => {
              if (env.AGENTMAIL_API_KEY && env.AGENTMAIL_INBOX_ID && record.view.arrangement?.customerEmail) {
                await sendCustomerNotification(saved.repository,
                  createAgentMailProvider({ apiKey: env.AGENTMAIL_API_KEY, inboxId: env.AGENTMAIL_INBOX_ID }),
                  record, `${record.view.arrangement.id}:acknowledgment`, arrangementAcknowledgment(record))
              }
              const current = await saved.repository.get(record.customerId, record.id)
              if (current) await prepareCompanyInquiry(saved.repository, current, env)
            }).catch(() => {
              console.error('[planning] inquiry preparation could not finish')
            })
            waitUntil(work)
          },
        } : {}),
        allowResearchReview: env.NODE_ENV === 'development' && !!env.PLANNING_LOCAL_DB_DIR,
        agent: () => createConfiguredPlanningAgent(env) }
    },
    async getWebhook() {
      const configured = await getMail()
      if (!configured) throw new ApiError(503, 'mail_unavailable', 'Supplier mail is not configured.')
      return withReplyProcessing(configured.webhook, processReplies, waitUntil)
    },
    processReplies,
    dispatchReplies: () => dispatchReplyProcessing(processReplies, waitUntil),
    async close(): Promise<void> {
      const opened = await storage?.catch(() => undefined)
      await opened?.close()
      storage = undefined
      mail = undefined
    },
  }
}

// Development hot reload must reuse the owner of the file-backed database.
const state = globalThis as typeof globalThis & { __planningRuntime?: ReturnType<typeof createPlanningRuntime> }
const runtime = process.env.NODE_ENV === 'development'
  ? state.__planningRuntime ??= createPlanningRuntime()
  : createPlanningRuntime()

export const getPlanningDeps = () => runtime.getDeps()
export const getSupplierMailWebhook = () => runtime.getWebhook()
export const processPlanningReplies = () => runtime.processReplies()

export const dispatchPlanningReplies = () => runtime.dispatchReplies()
export const getPlanningTransactionStore = () => runtime.getTransactionStore()

export const getPlanningCompanyTools = () => runtime.getCompanyTools()

export const notifyPlanningPaymentConfirmed = (checkoutSessionId: string) => runtime.notifyPayment(checkoutSessionId)
