import { createDetailEnricher } from '../suppliers/details'
import { ApiError } from '../server/events/errors'
import type { Store } from '../server/store'
import type { ResearchPort } from '../server/events/deps'
import { createDiscovery } from '../suppliers/discovery'
import { createResearchIntegration, type IntegrationProviders } from './integration'
import { createResearchSession } from './session'

export function createConfiguredResearch(store: Store, env: NodeJS.ProcessEnv = process.env,
  enrich?: IntegrationProviders['enrich']): ResearchPort {
  let port: ResearchPort | undefined
  const validateConfiguration = () => {
    if (env.RESEARCH_MODE && !['real', 'simulated'].includes(env.RESEARCH_MODE)) {
      throw new ApiError(503, 'research_not_configured', 'RESEARCH_MODE must be real or simulated.')
    }
    if (!env.NAIVE_API_KEY?.trim() || !env.MONID_API_KEY?.trim() || !env.NAIVE_RESEARCH_AGENT_ID?.trim()) {
      throw new ApiError(503, 'research_not_configured', 'Real research requires NAIVE_API_KEY, MONID_API_KEY and NAIVE_RESEARCH_AGENT_ID.')
    }
    if (!store.researchCheckpoints) {
      throw new ApiError(503, 'research_not_configured', 'Real research requires durable checkpoint storage.')
    }
  }
  const configured = () => {
    validateConfiguration()
    if (port) return port
    port = createResearchIntegration({ store, providers: {
      discover: createDiscovery({ apiKey: env.MONID_API_KEY! }),
      enrich: enrich ?? createDetailEnricher({ apiKey: env.MONID_API_KEY! }),
      session: createResearchSession({ apiKey: env.NAIVE_API_KEY!, agentId: env.NAIVE_RESEARCH_AGENT_ID! }),
    } })
    return port
  }
  return {
    validateConfiguration,
    startResearch: input => configured().startResearch(input),
    advanceResearch: input => configured().advanceResearch(input),
    cancelResearch: run => configured().cancelResearch(run),
  }
}
