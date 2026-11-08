import type { ReactNode } from 'react'
import type { PlanningView } from '../../agent/planning/contract'
import { EventHeading } from './event-heading'

export function PlanningConversation({ view, form, notice }: {
  view: PlanningView; form: ReactNode; notice: ReactNode
}) {
  const messages = view.messages.filter((message, index) => index > 0 || message.role === 'assistant')
  const proposalText = view.proposal && [view.proposal.summary, view.proposal.nextQuestion].filter(Boolean).join('\n\n')
  const waiting = view.status === 'working' || view.status === 'uncertain'
  return <section className="mx-auto flex w-full max-w-[1000px] flex-col items-center gap-10 pb-10 lg:gap-14 lg:pt-2" aria-label="Plan your event">
    <EventHeading brief={view.brief} />
    <div className="flex w-full max-w-[760px] flex-col gap-6 py-4 sm:py-8">
      <div className="flex flex-col gap-6" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text">
        {messages.map(message => <div key={message.id} className={message.role === 'user'
          ? 'ml-8 self-end border border-cream-line bg-cream px-5 py-4 sm:ml-16'
          : 'mr-4 border-l-2 border-sand pl-5 sm:mr-10'}>
          <p className="mb-2 text-[14px] font-semibold text-stone">{message.role === 'user' ? 'You' : 'Arrange'}</p>
          {message.text.split('\n\n').map((paragraph, index) => <p key={index} className="mb-3 whitespace-pre-wrap break-words text-[18px] leading-8 last:mb-0">{paragraph}</p>)}
        </div>)}
        {view.proposal && !messages.some(message => message.role === 'assistant' && message.text === proposalText) && <div className="border-l-2 border-sand pl-5">
          <p className="mb-2 text-[14px] font-semibold text-stone">Arrange</p>
          <p className="text-[18px] leading-8">{view.proposal.summary}</p>
          {view.proposal.nextQuestion && <p className="mt-3 text-[18px] leading-8">{view.proposal.nextQuestion}</p>}
        </div>}
      </div>
      {waiting && <p role="status" className="text-[15px] leading-6 text-stone">
        {view.status === 'uncertain' ? 'Your answer is saved. We are reconnecting to continue your research.' : view.progress || 'Looking into your event.'}
      </p>}
      {view.status === 'blocked' && <p role="status" className="text-stone">Our team is reviewing a research request. Your plan is saved.</p>}
      {view.status === 'failed' && <p role="status" className="text-stone">Research stopped before we had your options. You can send a message to continue.</p>}
      {notice}
      {form}
    </div>
  </section>
}
