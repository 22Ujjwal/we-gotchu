export function ProposalSummary({ summary, nextQuestion }: { summary: string; nextQuestion: string | null }) {
  const firstSentence = new Intl.Segmenter('en', { granularity: 'sentence' }).segment(summary)[Symbol.iterator]().next().value?.segment.trim() ?? summary
  const longSummary = summary.length > 240
  const clampSummary = longSummary && firstSentence.length > 240
  const questionEnd = nextQuestion?.indexOf('?') ?? -1
  const primaryQuestion = nextQuestion && questionEnd >= 0 ? nextQuestion.slice(0, questionEnd + 1).trim() : nextQuestion
  const questionContext = !!nextQuestion && questionEnd >= 0 && !!nextQuestion.slice(questionEnd + 1).trim()
  const expandable = longSummary || questionContext
  return <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3 text-center text-[18px] leading-7">
    <p className={`whitespace-pre-line ${clampSummary ? 'line-clamp-3' : ''}`}>{longSummary && !clampSummary ? firstSentence : summary}</p>
    {expandable && <details className="text-left">
      <summary className="cursor-pointer text-center text-[16px] underline underline-offset-4">Details</summary>
      {longSummary && <p className="mt-4 whitespace-pre-line">{summary}</p>}
      {questionContext && <p className="mt-4 whitespace-pre-line">{nextQuestion}</p>}
    </details>}
    {primaryQuestion && <p className="font-semibold">{primaryQuestion}</p>}
  </div>
}
