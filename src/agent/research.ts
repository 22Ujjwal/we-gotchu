import { ResearchInput, ResearchResult, type Candidate } from '../contracts'

export type ResearchProviders = {
  discover: (input: ResearchInput, signal: AbortSignal) => Promise<{
    candidates: Candidate[]
    sourceChecks: ResearchResult['sourceChecks']
  }>
  recommend: (input: ResearchInput, candidates: Candidate[], signal: AbortSignal, correction: boolean) => Promise<unknown>
}

export async function researchEvent(rawInput: unknown, providers: ResearchProviders): Promise<ResearchResult> {
  const parsed = ResearchInput.safeParse(rawInput)
  if (!parsed.success) {
    // Invalid identities are programmer errors; invalid brief fields need customer input.
    const identity = ResearchInput.omit({ brief: true }).parse(rawInput)
    const currency = (rawInput as { brief?: { currency?: unknown } }).brief?.currency
    if (typeof currency !== 'string' || currency.length !== 3) throw parsed.error
    return ResearchResult.parse({
      ...identity, outcome: 'awaiting_input',
      missing: [...new Set(parsed.error.issues.filter(issue => issue.path[0] === 'brief').map(issue => String(issue.path[1] ?? 'brief')))],
      candidates: [], recommendations: [], budgetFit: 'unknown', budgetBasis: 'Essential requirements need clarification.',
      currency, warnings: [], sourceChecks: [], superseded: false, createdAt: new Date().toISOString(),
    })
  }
  const input = parsed.data
  const signal = new AbortController().signal
  const evidence = await providers.discover(input, signal)
  const output = await providers.recommend(input, evidence.candidates, signal, false) as { candidateIds: string[] }
  return ResearchResult.parse({
    contractVersion: input.contractVersion, eventId: input.eventId,
    runId: input.runId, briefRevision: input.briefRevision,
    outcome: 'partial', missing: [], candidates: evidence.candidates,
    recommendations: output.candidateIds.map((candidateId, index) => ({
      candidateId, rank: index + 1, matched: [], unmet: [], unchecked: ['Supplier details require verification.'],
    })),
    budgetFit: 'unknown', budgetBasis: 'Discovery does not establish final event costs.',
    currency: input.brief.currency, warnings: ['Supplier availability and final costs are unverified.'],
    sourceChecks: evidence.sourceChecks, superseded: false, createdAt: new Date().toISOString(),
  })
}
