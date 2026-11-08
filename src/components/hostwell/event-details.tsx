import { assessPlanForApproval, type Candidate, type EventView } from '../../contracts'
import { formatMoney } from '../../lib/hostwell/brief-adapter'
import { ReceiptLoader } from './receipt-loader'
import { Button, Guests, MetaLine } from './ui'

function SourceLink({ url, children }: { url: string; children: React.ReactNode }) {
  // Evidence URLs are provider data, not trusted navigation instructions.
  if (!/^https?:\/\//i.test(url)) return <span>{children} - unavailable link</span>
  return <a href={url} target="_blank" rel="noopener noreferrer" className="underline">{children}</a>
}

function CandidateEvidence({ candidate, currency }: { candidate: Candidate; currency: string }) {
  return <>
    <h2 className="font-script text-[30px] leading-[42px]">{candidate.name}</h2>
    <p>Evidence mode: {candidate.evidenceMode}</p>
    <p>{candidate.priceEstimate === null ? 'Price unknown' : formatMoney(candidate.priceEstimate, currency)}; price basis: {candidate.priceProvenance}</p>
    <p>Taxes and delivery: {candidate.taxesAndDelivery}</p>
    <p>{candidate.whyChosenOrRejected}</p>
    {candidate.quantityInfo && <p>Quantity: {candidate.quantityInfo.needed} needed; {candidate.quantityInfo.packs} packs of {candidate.quantityInfo.packSize}.</p>}
    <p>Cancellation: {candidate.cancellationTerms.known ? candidate.cancellationTerms.summary || 'Known terms; review the source.' : 'Unknown'}</p>
    {candidate.cancellationTerms.sourceUrl && <SourceLink url={candidate.cancellationTerms.sourceUrl}>Cancellation source</SourceLink>}
    <ul>{Object.entries(candidate.verification).map(([field, evidence]) => <li key={field}>
      {field}: {evidence.status}{evidence.note ? `. ${evidence.note}` : ''}
      {evidence.sourceUrl && <> <SourceLink url={evidence.sourceUrl}>Verification source</SourceLink></>}
    </li>)}</ul>
    <ul>{candidate.sources.map((source, i) => <li key={i}><SourceLink url={source.url}>{source.tool} - {source.stage}</SourceLink> retrieved {source.retrievedAt}</li>)}</ul>
    <p>Observed {candidate.observedAt}. Supplier details can change; this is not a booking confirmation.</p>
    {candidate.affiliateDisclosure && <p>{candidate.affiliateDisclosure}</p>}
  </>
}

export function EventDetails({ view, pending, onApprove, onCancel, onEdit }: {
  view: EventView; pending: boolean; onApprove: () => void; onCancel: () => void; onEdit: () => void;
}) {
  const { event, plan, payment, researchResult: result } = view
  const currentPlan = plan && plan.eventId === event.eventId && plan.briefRevision === event.briefRevision && plan.revision === event.planRevision
  const approvable = currentPlan && assessPlanForApproval(plan).ok && !event.cancelRequestedAt &&
    ['plan_ready', 'awaiting_payment'].includes(event.status) && payment?.state !== 'paid'
  const currentResult = result && !result.superseded && result.eventId === event.eventId && result.briefRevision === event.briefRevision
  const ordered = currentResult ? [...result.candidates].sort((a, b) =>
    (result.recommendations.find(r => r.candidateId === a.candidateId)?.rank ?? Infinity) -
    (result.recommendations.find(r => r.candidateId === b.candidateId)?.rank ?? Infinity)) : []
  return <>
    <div className="flex flex-col items-center gap-2 text-center lg:gap-3.5">
      <h1 className="m-0 font-script text-[34px] leading-[48px] font-normal lg:text-[46px] lg:leading-16">{event.brief.eventType}</h1>
      <MetaLine><span>{event.brief.startsAt} ({event.brief.timezone})</span><span>{event.brief.location}</span>
        <Guests n={String(event.brief.headcount)} /><span>Budget {formatMoney(event.brief.budget, event.brief.currency)}</span>
        <button type="button" onClick={onEdit} disabled={pending || !!event.cancelRequestedAt || !!view.approval && !view.approval.revokedAt}
          className="underline decoration-1 [text-underline-position:from-font]">Edit brief</button>
      </MetaLine>
      <p role="status">Event status: {event.status.replaceAll('_', ' ')}</p>
      {view.run?.state === 'unknown' && <p>Research outcome is unknown. Do not restart automatically; reconciliation is needed.</p>}
      {event.status === 'researching' && <p>Research advances while this page is open. Returning after its time limit may require a revised brief; background completion is not guaranteed.</p>}
    </div>
    {event.status === 'researching' && !currentResult && <ReceiptLoader />}
    <section aria-label="Research results" className="flex w-full flex-col items-center gap-5 lg:gap-12 lg:pt-2">
      {currentResult && <div className="w-full max-w-[900px] text-[16px] leading-6 text-body">
        <p>Research: {result.outcome.replaceAll('_', ' ')}. Budget fit: {result.budgetFit}.</p>
        <p>{result.budgetBasis}</p>
        {result.missing.length > 0 && <p>Missing information: {result.missing.join(', ')}</p>}
        {result.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
        {result.sourceChecks.map((source, i) => <p key={i}><SourceLink url={source.url}>{source.tool}</SourceLink>: {source.outcome}. {source.reason} Missing: {source.missingFields.join(', ') || 'none reported'}.</p>)}
      </div>}
      {ordered.map(candidate => {
        const recommendation = result!.recommendations.find(r => r.candidateId === candidate.candidateId)
        return <article key={candidate.candidateId} className="gold-frame rise flex w-full max-w-[468px] shrink-0 p-0.5 shadow-[0_24px_56px_#966E1E2E]">
          <div className="flex w-full flex-col gap-[18px] bg-white p-6 lg:gap-[22px] lg:p-[34px]">
            <CandidateEvidence candidate={candidate} currency={result!.currency} />
            {recommendation && <><p>Matched: {recommendation.matched.join(', ') || 'none confirmed'}</p>
              <p>Unmet: {recommendation.unmet.join(', ') || 'none reported'}</p><p>Unchecked: {recommendation.unchecked.join(', ') || 'none reported'}</p></>}
          </div>
        </article>
      })}
      {!currentPlan && <p>No bookable plan yet.</p>}
    </section>
    {currentPlan && <section aria-label="Current plan" className="flex w-full max-w-[900px] flex-col gap-5 bg-white p-6 lg:p-[34px]">
      <h2 className="font-script text-[30px] leading-[42px]">Plan {plan.planId}, revision {plan.revision}</h2>
      <p>Plan mode: {plan.mode}</p><p>Total: {formatMoney(plan.total, plan.currency)}. Service fee: {formatMoney(plan.serviceFee, plan.currency)}.</p>
      <p>{plan.budgetBasis}</p><p>{plan.agentReasoning}</p><p>Cancellation terms: {plan.cancellationTerms}</p>
      <p>Maximum acceptable cancellation loss: {formatMoney(event.brief.maximumCancellationLoss, event.brief.currency)}</p>
      {plan.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
      <ul>{plan.actions.map(action => <li key={action.actionId} className="py-[13px]">
        <p>{action.supplierName}: {action.target} - {action.quantityOrSchedule}</p><SourceLink url={action.sourceUrl}>Supplier source</SourceLink><p>Action {action.actionId}; mode: {action.mode}; maximum {formatMoney(action.maximumAmount, plan.currency)}.</p>
        <p>Cancellation: {action.cancellationTerms.known ? action.cancellationTerms.summary || 'Review source terms.' : 'Unknown'}</p>
        {action.cancellationTerms.sourceUrl && <SourceLink url={action.cancellationTerms.sourceUrl}>Action terms</SourceLink>}
      </li>)}</ul>
      {approvable && <Button disabled={pending} onClick={onApprove} className="w-full py-[17px] text-[18px] leading-[22px] font-bold">Approve plan and continue to Checkout</Button>}
    </section>}
    <section aria-label="Payment and commitments" className="flex w-full max-w-[900px] flex-col gap-5 text-[16px] leading-6 text-body">
      <p>Payment does not confirm a supplier booking. Only confirmed supplier evidence establishes a commitment.</p>
      {view.approval && <p>Approval expires: {view.approval.expiresAt}. {view.approval.revokedAt ? 'Approval revoked.' : 'Checkout may require fresh approval after expiry.'}</p>}
      {payment ? <><p>Payment: {payment.state}; mode: {payment.mode}; {formatMoney(payment.amount, payment.currency)}</p>
        <p>Refund: {payment.refundState}</p>{payment.refundReason && <p>{payment.refundReason}</p>}</> : <p>No payment recorded.</p>}
      {view.attempts.map(attempt => <article key={attempt.attemptId}>
        <p>{attempt.kind === 'cancel' ? 'Cancellation' : 'Commitment'} {attempt.actionId}: {attempt.state}; mode: {attempt.mode}</p>
        {attempt.evidence ? <p>Supplier evidence: {attempt.evidence.providerReference}. {attempt.evidence.confirmation}</p> : <p>No supplier confirmation evidence recorded.</p>}
        {attempt.actualAmount !== null && <p>Actual amount: {plan?.actions.find(a => a.actionId === attempt.actionId)
          ? formatMoney(attempt.actualAmount, plan.currency) : `${attempt.actualAmount} minor units; currency unavailable`}</p>}
        {attempt.errorReason && <p>{attempt.errorReason}</p>}
        {attempt.state === 'unknown' && <p>Outcome unknown. Do not repeat this supplier action; reconciliation is needed.</p>}
      </article>)}
      {event.cancelRequestedAt && <p>Cancellation requested at {event.cancelRequestedAt}. Review each commitment and refund state separately.</p>}
      {!event.cancelRequestedAt && event.status !== 'canceled' && <>
        <p>Canceling stops further research and requests cancellation of existing commitments. Supplier terms apply; a refund is not guaranteed.</p>
        <Button onClick={onCancel} disabled={pending} className="w-full py-[17px] text-[18px] leading-[22px] font-bold">Cancel event</Button>
      </>}
    </section>
    <section aria-label="Event progress" className="w-full max-w-[900px] text-[16px] leading-6 text-body">
      <h2 className="font-script text-[30px] leading-[42px]">Progress</h2>
      <ol>{view.progress.map(entry => <li key={`${entry.eventId}:${entry.sequence}`}>{entry.message}</li>)}</ol>
    </section>
  </>
}
