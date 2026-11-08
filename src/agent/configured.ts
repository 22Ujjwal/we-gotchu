import type { Store } from '../server/store'
import type { ResearchPort } from '../server/events/deps'
import { createDiscovery } from '../suppliers/discovery'
import { createResearchIntegration, type IntegrationProviders } from './integration'
import { createResearchSession } from './session'

export function createConfiguredResearch(store: Store, env: NodeJS.ProcessEnv = process.env,
  enrich?: IntegrationProviders['enrich']): ResearchPort {
  let port: ResearchPort | undefined
  const configured = () => {
    if (port) return port
    if (!env.NAIVE_API_KEY || !env.MONID_API_KEY || !env.NAIVE_MODEL) {
      throw new Error('Real research requires NAIVE_API_KEY, MONID_API_KEY and NAIVE_MODEL')
    }
    port = createResearchIntegration({ store, providers: {
      discover: createDiscovery({ apiKey: env.MONID_API_KEY }), enrich,
      session: createResearchSession({ apiKey: env.NAIVE_API_KEY, model: env.NAIVE_MODEL }),
    } })
    return port
  }
  return {
    startResearch: input => configured().startResearch(input),
    advanceResearch: input => configured().advanceResearch(input),
    cancelResearch: sessionId => configured().cancelResearch(sessionId),
  }
}
