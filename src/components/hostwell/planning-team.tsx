import { useUser } from '@clerk/tanstack-react-start'
import { usePlanningSession } from '../../lib/hostwell/planning-session'
import { Button } from './ui'
import { PlanningInquiryEditor } from './planning-inquiry'
import { planningBlocked } from './planning-status'

export function ConnectedPlanningTeamPage({ id }: { id: string }) {
  const { user, isLoaded } = useUser()
  if (!isLoaded) return <p role="status">Loading sign-in...</p>
  if (!user) return <a href={`/sign-in?redirect_url=${encodeURIComponent(`/planning/${encodeURIComponent(id)}/team`)}`}
    className="text-[17px] font-semibold underline">Sign in to view team tools</a>
  return <main className="flex flex-1 justify-center px-5 pt-10 pb-8 lg:px-12">
    <PlanningTeamTools key={`${user.id}:${id}`} id={id} />
  </main>
}

/** Operator controls stay off the customer page; the server only returns approvals when research review is allowed. */
function PlanningTeamTools({ id }: { id: string }) {
  const session = usePlanningSession(id)
  const { view } = session
  const blocked = planningBlocked(session, true)
  const notice = session.uncertain ? 'We could not confirm whether the last action was saved. Check the saved status before acting again.' : session.error?.message
  const reply = view?.inquiry?.replies?.at(-1)
  return <div className="flex w-full max-w-[900px] flex-col gap-8">
    <h1 className="text-[34px] font-light">Team view</h1>
    <a href={`/planning/${encodeURIComponent(id)}`} className="self-start underline">Open the customer view</a>
    {session.loading && <p role="status">Loading the saved plan...</p>}
    {notice && <div className="flex flex-col gap-3">
      <p role="alert">{notice}</p>
      <Button className="self-start px-5 py-3" disabled={session.pending || session.loading} onClick={() => void session.refresh()}>
        {session.uncertain ? 'Check saved status' : 'Refresh plan'}</Button>
    </div>}
    {view && !view.canReviewResearch && <p>Team tools are only available in local development.</p>}
    {view?.canReviewResearch && <>
      <section aria-label="Saved state" className="flex flex-col gap-2">
        <p>Research: {view.status}{view.progress ? `, ${view.progress}` : ''}</p>
        {view.error && <p>Research error: {view.error}</p>}
        {view.arrangement && <p>Arrangement: {view.arrangement.status}. {view.arrangement.detail}</p>}
      </section>
      {!!view.activity?.length && <section aria-label="Research activity" className="flex flex-col gap-3">
        <h2 className="text-[22px]">Research activity</h2>
        {view.activity.map((item, index) => <p key={`${item.name}:${index}`}><span className="font-semibold">{item.name}</span>: {item.detail}</p>)}
      </section>}
      {['blocked', 'uncertain'].includes(view.status) && <section aria-label="Research review" className="flex flex-col gap-4">
        <h2 className="text-[22px]">Research review</h2>
        <p>Review the exact request before allowing or declining this one call.</p>
        {!view.approvals?.length && <p>This request needs operator attention. No research call can be approved here.</p>}
        {view.approvals?.map(approval => <div key={approval.id} className="flex flex-col gap-3 border border-sand p-4">
          <p>{approval.tool === 'monid.monid_discover' ? 'Find a research source'
            : approval.tool === 'monid.monid_inspect' ? "Check a research source's inputs"
              : approval.tool === 'monid.monid_get_run' ? 'Read a research result' : 'Request supplier research'}</p>
          <pre className="whitespace-pre-wrap break-words text-[14px]">{JSON.stringify(approval.arguments, null, 2)}</pre>
          <div className="flex flex-wrap gap-3">{(['allow', 'deny'] as const).map(decision => <Button key={decision}
            disabled={session.pending || session.loading || !!session.uncertain || view.status !== 'blocked'}
            className="px-5 py-3" onClick={() => void session.submit({ kind: 'confirm', requestId: crypto.randomUUID(),
              expectedVersion: view.version, approvalId: approval.id, decision })}>
            {decision === 'allow' ? 'Approve this research call' : 'Decline this research call'}
          </Button>)}</div>
        </div>)}
        <Button className="self-start px-5 py-3" disabled={session.pending || session.loading} onClick={() => void session.refresh()}>Check research status</Button>
      </section>}
      <section aria-label="Venue inquiry tools" className="flex flex-col gap-4">
        {view.selections.some(option => option.kind === 'venue') && (!view.inquiry || view.inquiry.status === 'stale' || view.inquiry.delivery?.status === 'failed')
          && <Button className="self-start px-5 py-3" disabled={blocked || view.status !== 'ready'}
            onClick={() => void session.submit({ kind: 'prepare_inquiry', requestId: crypto.randomUUID(), expectedVersion: view.version })}>
            {view.inquiry?.delivery?.status === 'failed' ? 'Prepare a replacement inquiry' : view.inquiry ? 'Replace outdated inquiry draft' : 'Prepare venue inquiry'}
          </Button>}
        {view.inquiry?.delivery?.status === 'uncertain' && <Button className="self-start px-5 py-3" disabled={session.loading || session.pending}
          onClick={() => void session.checkMail()}>Check send status</Button>}
        {view.inquiry?.delivery && <Button className="self-start px-5 py-3" disabled={session.loading || session.pending}
          onClick={() => void session.refreshSaved()}>Check for venue replies</Button>}
        {view.inquiry && <PlanningInquiryEditor key={view.inquiry.id} inquiry={view.inquiry} version={view.version}
          disabled={blocked || view.status !== 'ready'} canSend={!!view.canSendInquiry} submit={session.submit} />}
        {!view.paymentLink && view.inquiry?.status === 'draft' && reply?.status === 'ready'
          && ['quote', 'confirmation'].includes(reply.interpretation?.kind ?? '')
          && <Button className="self-start px-5 py-3" disabled={blocked || view.status !== 'ready'}
            onClick={() => void session.submit({ kind: 'prepare_offer', requestId: crypto.randomUUID(), expectedVersion: view.version })}>
            {view.offer ? 'Update selected offer' : 'Prepare selected offer'}
          </Button>}
      </section>
    </>}
  </div>
}
