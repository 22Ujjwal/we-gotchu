import { waitUntil } from '@vercel/functions'
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
import type { PlanningDeps } from './service'

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
  const processReplies = async () => {
    const saved = await getStorage()
    return processReplyJobs(saved.repository, createConfiguredReplyInterpreter(env), 5,
      job => prepareReplyOffer(saved.repository, saved.offers, createConfiguredOfferGenerator(env), job))
  }
  return {
    async getTransactionStore() { return (await getStorage()).store },
    async getDeps(): Promise<PlanningDeps> {
      return { repository: (await getStorage()).repository, offers: (await getStorage()).offers,
        generateOffer: record => createConfiguredOfferGenerator(env)(record), mail: (await getMail())?.transport, requireCustomerId,
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
