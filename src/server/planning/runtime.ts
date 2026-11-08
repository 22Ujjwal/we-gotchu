import { notifyPlanningPayment } from './payment-notification'
import { arrangementAcknowledgment, notifySupplierOffer, sendCustomerNotification } from './customer-notifications'
import { waitUntil } from '@vercel/functions'
import { createCompanyTools } from './company-tools'
import { createCompanyWebhook } from './company-webhook'
import { finishVendorConfirmation } from './vendor-coordination'
import { continueCompanyReply, prepareCompanyInquiry } from './company-preparation'
import { dispatchReplyProcessing, withReplyProcessing } from './reply-dispatch'
import { createConfiguredPlanningAgent } from '../../agent/planning/provider'
import { requireCustomerId } from '../auth'
import { createLocalPlanningRepository, createNeonPlanningStorage } from '../db/client'
import { createAgentMailProvider } from '../email/supplier-inquiries/agentmail'
import { ApiError } from '../events/errors'
import { createPlanningMail } from './mail-integration'
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
    if (!env.AGENTMAIL_API_KEY || !env.AGENTMAIL_INBOX_ID) return
    await notifySupplierOffer((await getStorage()).repository, record,
      createAgentMailProvider({ apiKey: env.AGENTMAIL_API_KEY, inboxId: env.AGENTMAIL_INBOX_ID }), env.APP_URL ?? 'http://localhost:3000')
  }
  const processReplies = async () => {
    const saved = await getStorage()
    if (!env.NAIVE_COMPANY_AGENT_ID || !env.PLANNING_TOOLS_SECRET || !env.NAIVE_API_KEY) return { processed: 0 }
    const records = new Map<string, import('./repository').PlanningRecord>()
    for (const record of await saved.repository.pendingArrangements?.(5) ?? []) records.set(record.id, record)
    for (const job of await saved.repository.pendingReplyJobs(5, Date.now())) {
      const record = await saved.repository.get(job.customerId, job.conversationId)
      if (record?.view.arrangement && record.view.inquiry?.id === job.inquiryId) records.set(record.id, record)
    }
    await Promise.all([...records.values()].map(async record => {
      if (record.view.inquiry?.delivery) await continueCompanyReply(saved.repository, record, env)
      else await prepareCompanyInquiry(saved.repository, record, env)
    }))
    return { processed: records.size }
  }
  return {
    async getCompanyWebhook() { return createCompanyWebhook((await getStorage()).repository, env) },
    async getCompanyTools() {
      if (!env.PLANNING_TOOLS_SECRET || env.PLANNING_TOOLS_SECRET.length < 32) throw new ApiError(503, 'tools_unavailable', 'Company tools are not configured.')
      const saved = await getStorage()
      const followupTransport = (await getMail())?.transport
      return createCompanyTools(saved.repository, env.PLANNING_TOOLS_SECRET, async record => {
        const arrangement = record.view.arrangement
        const inquiry = record.view.inquiry
        // This rehearsal may contact only the recipient explicitly configured by the operator.
        if (!env.PLANNING_TEST_SUPPLIER_EMAIL || !arrangement?.controlled
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
      }, followupTransport && env.PLANNING_TEST_SUPPLIER_EMAIL
        ? { transport: followupTransport, recipient: env.PLANNING_TEST_SUPPLIER_EMAIL } : undefined,
        { save: saved.offers.save, onSaved: followUp }, {
          verifyPayment: async record => {
            const verified = record.verifiedPayment
            if (!verified) return false
            const payment = await saved.store.getPaymentByCheckoutSession(verified.checkoutSessionId)
            return payment?.paymentId === verified.paymentId && payment.state === 'paid' && payment.refundState === 'none' && payment.mode === 'test'
          },
          onConfirmed: async record => {
            if (!env.AGENTMAIL_API_KEY || !env.AGENTMAIL_INBOX_ID) return
            await finishVendorConfirmation(saved.repository,
              createAgentMailProvider({ apiKey: env.AGENTMAIL_API_KEY, inboxId: env.AGENTMAIL_INBOX_ID }), record, env.APP_URL ?? 'http://localhost:3000')
          },
        })
    },
    async notifyPayment(checkoutSessionId: string) {
      if (!env.AGENTMAIL_API_KEY || !env.AGENTMAIL_INBOX_ID) return
      const saved = await getStorage()
      await notifyPlanningPayment(saved.store, saved.repository,
        createAgentMailProvider({ apiKey: env.AGENTMAIL_API_KEY, inboxId: env.AGENTMAIL_INBOX_ID }),
        checkoutSessionId, env.APP_URL ?? 'http://localhost:3000',
        record => continueCompanyReply(saved.repository, record, env, true))
    },
    async getTransactionStore() { return (await getStorage()).store },
    async getDeps(): Promise<PlanningDeps> {
      return { repository: (await getStorage()).repository, offers: (await getStorage()).offers,
        mail: (await getMail())?.transport, requireCustomerId,
        ...(env.PLANNING_TEST_SUPPLIER_EMAIL ? { testSupplierEmail: env.PLANNING_TEST_SUPPLIER_EMAIL } : {}),
        ...(env.NAIVE_COMPANY_AGENT_ID && env.PLANNING_TOOLS_SECRET && env.NAIVE_API_KEY
          && env.PLANNING_TEST_SUPPLIER_EMAIL && env.AGENTMAIL_API_KEY && env.AGENTMAIL_INBOX_ID && env.AGENTMAIL_WEBHOOK_SECRET ? {
          arrange: (record: import('./repository').PlanningRecord) => {
            const work = getStorage().then(async saved => {
              if (env.AGENTMAIL_API_KEY && env.AGENTMAIL_INBOX_ID && record.view.arrangement?.customerEmail) {
                await sendCustomerNotification(saved.repository,
                  createAgentMailProvider({ apiKey: env.AGENTMAIL_API_KEY, inboxId: env.AGENTMAIL_INBOX_ID }),
                  record, `${record.view.arrangement.id}:acknowledgment`, arrangementAcknowledgment(record))
              }
              const current = await saved.repository.get(record.customerId, record.id)
              if (current?.view.inquiry?.delivery) await continueCompanyReply(saved.repository, current, env)
              else if (current) await prepareCompanyInquiry(saved.repository, current, env)
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
export const getPlanningCompanyWebhook = () => runtime.getCompanyWebhook()

export const notifyPlanningPaymentConfirmed = (checkoutSessionId: string) => runtime.notifyPayment(checkoutSessionId)
