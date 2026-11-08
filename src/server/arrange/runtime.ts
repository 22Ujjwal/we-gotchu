import { localCustomerId } from './local-access'
import { createLocalStripe } from './payments'
import { createStripeAdapter } from '../payments/stripe'
import { createEventNotifications } from './notifications'
import { requireCustomerId } from '../auth'
import { createNeonDb, openPgliteDb } from '../db/client'
import { createAgentMailProvider } from '../email/supplier-inquiries/agentmail'
import { ApiError } from '../events/errors'
import { createApp, type ArrangeApp } from './app'
import { createFakeMail, createFakeNaive } from './fakes'
import { createNaiveSessions } from './naive'

// Production wiring from environment variables. Server-only.
// ARRANGE_FAKE_PROVIDERS=true (development only) swaps AgentMail and Naive for
// the in-memory fakes and takes the customer id from ARRANGE_LOCAL_CUSTOMER_ID,
// so the whole slice runs against `bun run dev` on localhost with no provider
// accounts and no Clerk session.

const useFakes = (env: NodeJS.ProcessEnv) => env.NODE_ENV === 'development' && env.ARRANGE_FAKE_PROVIDERS === 'true'

export async function getArrangeCustomerId(request: Request): Promise<string> {
  const local = localCustomerId(process.env, request)
  if (local) return local
  return requireCustomerId()
}

export function createArrangeRuntime(env: NodeJS.ProcessEnv = process.env) {
  let app: Promise<ArrangeApp> | undefined

  async function open(): Promise<ArrangeApp> {
    const fakes = useFakes(env)
    const localDir = env.NODE_ENV === 'development' ? env.ARRANGE_LOCAL_DB_DIR : undefined
    const required = ['AGENTMAIL_API_KEY', 'ARRANGE_AGENTMAIL_INBOX_ID', 'NAIVE_API_KEY', 'NAIVE_ARRANGE_AGENT_ID'] as const
    const missing = fakes ? [] : required.filter(name => !env[name])
    if (missing.length || (!env.DATABASE_URL && !localDir)) {
      console.error('[arrange] not configured; missing', [...missing, ...(env.DATABASE_URL || localDir ? [] : ['DATABASE_URL or ARRANGE_LOCAL_DB_DIR'])].join(', '))
      throw new ApiError(503, 'arrange_unavailable', 'We are not quite ready yet. Please try again shortly.')
    }
    const venueEmail = env.ARRANGE_VENUE_EMAIL ?? (fakes ? 'venue@botanico.test' : undefined)
    if (!venueEmail) throw new ApiError(503, 'arrange_unavailable', 'We are not quite ready yet. Please try again shortly.')
    if (fakes && !localDir) throw new ApiError(503, 'local_database_required', 'Local testing requires its own database directory.')
    const db = !fakes && env.DATABASE_URL ? createNeonDb(env.DATABASE_URL) : (await openPgliteDb(localDir)).db
    return createApp({
      db,
      mail: fakes ? createFakeMail().provider : createAgentMailProvider({ apiKey: env.AGENTMAIL_API_KEY!, inboxId: env.ARRANGE_AGENTMAIL_INBOX_ID! }),
      naive: fakes ? createFakeNaive().naive : createNaiveSessions({ apiKey: env.NAIVE_API_KEY!, agentId: env.NAIVE_ARRANGE_AGENT_ID! }),
      stripe: fakes ? createLocalStripe() : createStripeAdapter(env.STRIPE_SECRET_KEY),
      notify: fakes
        ? async input => ({ messageId: `local-notice:${input.id}` })
        : env.APP_URL ? createEventNotifications({ apiKey: env.AGENTMAIL_API_KEY!, inboxId: env.ARRANGE_AGENTMAIL_INBOX_ID!, appUrl: env.APP_URL }) : undefined,
      config: {
        stripeWebhookSecret: env.ARRANGE_STRIPE_WEBHOOK_SECRET ?? env.STRIPE_WEBHOOK_SECRET,
        appUrl: env.APP_URL,
        seedContacts: [
          { name: env.ARRANGE_VENUE_NAME || 'Cafe Botanico', email: venueEmail, kind: 'venue' },
          ...(env.ARRANGE_SUPPLIER_EMAIL ? [{ name: env.ARRANGE_SUPPLIER_NAME || 'Event supplies', email: env.ARRANGE_SUPPLIER_EMAIL, kind: 'supplier' }] : []),
        ],
        mcpBearer: env.ARRANGE_MCP_BEARER,
        agentMailWebhookSecret: env.ARRANGE_AGENTMAIL_WEBHOOK_SECRET ?? '',
        evidenceMode: fakes ? 'fixture' : 'live',
      },
    })
  }

  return {
    getApp(): Promise<ArrangeApp> {
      app ??= open().catch(error => { app = undefined; throw error })
      return app
    },
  }
}

// Development hot reload must keep one owner of a file-backed PGlite database.
const state = globalThis as typeof globalThis & { __arrangeRuntime?: ReturnType<typeof createArrangeRuntime> }
const runtime = state.__arrangeRuntime ??= createArrangeRuntime()

export const getArrangeApp = () => runtime.getApp()
