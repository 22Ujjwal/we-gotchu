import { ResearchInput, ResearchResult, type Candidate } from '../contracts'

export type ResearchProviders = {
  discover: (input: ResearchInput, signal: AbortSignal) => Promise<{
    candidates: Candidate[]
    sourceChecks: ResearchResult['sourceChecks']
  }>
  recommend: (input: ResearchInput, candidates: Candidate[], signal: AbortSignal, correction: boolean) => Promise<unknown>
}

export async function researchEvent(_input: unknown, _providers: ResearchProviders): Promise<ResearchResult> {
  throw new Error('Research workflow is not implemented')
}
