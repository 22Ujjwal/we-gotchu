import { displayCopy } from '../../lib/hostwell/display-copy'
export function ProposalSummary({ summary, nextQuestion }: { summary: string; nextQuestion: string | null }) {
  summary = displayCopy(summary)
  nextQuestion = nextQuestion ? displayCopy(nextQuestion) : null
  const firstSentence = new Intl.Segmenter('en', { granularity: 'sentence' }).segment(summary)[Symbol.iterator]().next().value?.segment.trim() ?? summary
  const longSummary = summary.length > 240
  const clampSummary = longSummary && firstSentence.length > 240
  const questionEnd = nextQuestion?.indexOf('?') ?? -1
  const primaryQuestion = nextQuestion && questionEnd >= 0 ? nextQuestion.slice(0, questionEnd + 1).trim() : nextQuestion
  return <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3 text-center text-[18px] leading-7">
    <p className={`whitespace-pre-line ${clampSummary ? 'line-clamp-2' : ''}`}>{longSummary && !clampSummary ? firstSentence : summary}</p>
    {primaryQuestion && <p className="font-semibold">{primaryQuestion}</p>}
  </div>
}
