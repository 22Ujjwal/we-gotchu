import { z } from 'zod'
import { Candidate, ResearchInput, ResearchResult } from '../contracts'

export type Discovery = {
  candidates: Candidate[]
  sourceChecks: ResearchResult['sourceChecks']
  warnings?: string[]
}
export type ResearchProviders = {
  enrich?: (input: ResearchInput, evidence: Discovery, signal: AbortSignal) => Promise<Discovery>
  discover: (input: ResearchInput, signal: AbortSignal) => Promise<Discovery>
  recommend: (input: ResearchInput, candidates: Candidate[], signal: AbortSignal, correction: boolean) => Promise<unknown>
}
export type ResearchOptions = {
  timeoutMs?: number
  signal?: AbortSignal
  onProgress?: (stage: 'discovering' | 'investigating' | 'recommending' | 'finished') => void
}

// The model may select and order evidence, but cannot author supplier facts.
export const Ranking = z.object({ candidateIds: z.array(z.string().min(1)).min(1) }).strict()
const MAX_CANDIDATES = 12

export async function researchEvent(
  rawInput: unknown,
  providers: ResearchProviders,
  options: ResearchOptions = {},
): Promise<ResearchResult> {
  const identity = ResearchInput.omit({ brief: true }).parse(rawInput)
  const parsed = ResearchInput.safeParse(rawInput)
  const rawCurrency = (rawInput as { brief?: { currency?: unknown } }).brief?.currency
  // XXX is the ISO 4217 code for "no currency". It only appears on awaiting_input results,
  // because a brief without a valid currency always fails ResearchInput below.
  const currency = typeof rawCurrency === 'string' && rawCurrency.length === 3 ? rawCurrency : 'XXX'
  const base: ResearchResult = {
    ...identity, outcome: 'failed', missing: [], candidates: [], recommendations: [],
    budgetFit: 'unknown', budgetBasis: 'Discovery does not establish final event costs.',
    currency, warnings: [], sourceChecks: [], superseded: false,
    createdAt: new Date().toISOString(),
  }
  if (!parsed.success) {
    return ResearchResult.parse({
      ...base, outcome: 'awaiting_input',
      missing: [...new Set(parsed.error.issues.filter(issue => issue.path[0] === 'brief')
        .map(issue => String(issue.path[1] ?? 'brief')))],
    })
  }
  const input = parsed.data
  const timeoutMs = options.timeoutMs ?? 120_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Research timeout must be a positive integer')
  const deadline = AbortSignal.timeout(timeoutMs)
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline
  let evidence: Discovery = { candidates: [], sourceChecks: [] }
  const withEvidenceWarnings = (...warnings: string[]) => [...(evidence.warnings ?? []), ...warnings]
  const progress = (stage: Parameters<NonNullable<ResearchOptions['onProgress']>>[0]) => options.onProgress?.(stage)
  // A provider must honor the signal; the race also bounds a faulty provider's wait.
  const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
    signal.throwIfAborted()
    let stop: () => void = () => {}
    const aborted = new Promise<never>((_, reject) => {
      stop = () => reject(new Error('Research interrupted'))
      signal.addEventListener('abort', stop, { once: true })
    })
    try { return await Promise.race([operation(), aborted]) }
    finally { signal.removeEventListener('abort', stop) }
  }
  try {
    progress('discovering')
    const discovery = await bounded(() => providers.discover(input, signal))
    const ids = new Set<string>()
    let candidates: Candidate[] = []
    let skipped = 0
    // One malformed or repeated search result must not discard the rest of the evidence.
    for (const raw of discovery.candidates) {
      if (candidates.length >= MAX_CANDIDATES) break
      const candidate = Candidate.safeParse(raw)
      if (!candidate.success || ids.has(candidate.data.candidateId)) { skipped++; continue }
      ids.add(candidate.data.candidateId)
      candidates.push(candidate.data)
    }
    evidence = {
      ...discovery, candidates,
      warnings: [...(discovery.warnings ?? []), ...(skipped ? [`${skipped} invalid or duplicate discovery results were skipped.`] : [])],
    }
    if (!candidates.length) return { ...base, sourceChecks: evidence.sourceChecks, warnings: withEvidenceWarnings('No usable supplier candidates were found.') }
    if (providers.enrich) {
      progress('investigating')
      const enriched = await bounded(() => providers.enrich!(input, structuredClone(evidence), signal))
      const validated = ResearchResult.parse({ ...base, ...enriched })
      if (validated.candidates.length !== candidates.length || validated.candidates.some((c, i) =>
        c.candidateId !== candidates[i].candidateId || c.supplierId !== candidates[i].supplierId || c.kind !== candidates[i].kind)) {
        throw new Error('Detail enrichment changed candidate identities')
      }
      evidence = { candidates: validated.candidates, sourceChecks: validated.sourceChecks, warnings: validated.warnings }
      candidates = evidence.candidates
    }
    progress('recommending')
    let ranking: z.infer<typeof Ranking> | undefined
    for (let turn = 0; turn < 2; turn++) {
      const output = Ranking.safeParse(await bounded(() => providers.recommend(input, candidates, signal, turn === 1)))
      if (output.success && output.data.candidateIds.every(id => ids.has(id)) &&
          new Set(output.data.candidateIds).size === output.data.candidateIds.length) {
        ranking = output.data
        break
      }
    }
    if (!ranking) {
      return ResearchResult.parse({ ...base, ...evidence, outcome: 'partial', warnings: withEvidenceWarnings('Recommendation output failed validation; only retrieved evidence is shown.') })
    }
    // Include unranked evidence after the model selection, without inventing options.
    const ordered = [...ranking.candidateIds, ...candidates.map(c => c.candidateId).filter(id => !ranking.candidateIds.includes(id))]
    const result = ResearchResult.parse({
      ...base, ...evidence, outcome: 'partial',
      recommendations: ordered.map((candidateId, index) => ({
        candidateId, rank: index + 1, matched: [], unmet: [],
        unchecked: ['Final costs, event-date availability, capacity fit, required quantities, and cancellation terms remain unconfirmed.'],
      })),
      warnings: withEvidenceWarnings('Discovery candidates are not confirmed bookings or final quotes.'),
    })
    progress('finished')
    return result
  } catch {
    // Provider exceptions can contain credentials or raw responses; never return them.
    return ResearchResult.parse({
      ...base, ...evidence,
      outcome: options.signal?.aborted ? 'canceled' : evidence.candidates.length ? 'partial' : 'failed',
      warnings: withEvidenceWarnings(signal.aborted ? 'Research stopped before completion.' : 'A research provider failed; remaining details are unverified.'),
    })
  }
}
