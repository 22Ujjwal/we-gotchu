import type { SupplierReply } from '../../agent/planning/reply-contract'

const labels = { question: 'The venue has a question', refusal: 'The venue cannot accommodate this inquiry',
  tentative: 'Tentative availability', quote: 'Venue quote', confirmation: 'Supplier confirmation received', other: 'Venue reply' }

export function PlanningReplies({ replies, stale }: { replies: SupplierReply[]; stale: boolean }) {
  if (!replies.length) return null
  return <section aria-label="Venue replies" className="flex flex-col gap-5">
    <h2 className="text-[26px] font-light">Replies from the venue</h2>
    {stale && <p role="alert">These replies concern earlier venue or event details. Request an updated quote before using them.</p>}
    {[...replies].sort((a, b) => Date.parse(b.message.receivedAt) - Date.parse(a.message.receivedAt)).map(reply =>
      <article key={reply.id} className="flex flex-col gap-3 border border-sand p-5">
        {reply.message.mode === 'simulated' && <p className="text-stone">Controlled test reply</p>}
        <h3 className="text-xl">{reply.interpretation ? labels[reply.interpretation.kind] : 'Reply received'}</h3>
        <p className="text-stone">From {reply.message.from}</p>
        {reply.interpretation ? <>
          <p>{reply.interpretation.summary}</p>
          <dl className="grid gap-3">{reply.interpretation.facts.map((fact, index) => <div key={index}>
            <dt className="capitalize text-stone">{fact.field}</dt><dd>{fact.value}</dd>
            <details><summary className="cursor-pointer underline">Supplier's wording</summary><blockquote>{fact.quote}</blockquote></details>
          </div>)}</dl>
          {!!reply.interpretation.missing.length && <div><p>Still to confirm</p>
            <ul className="list-disc pl-6">{reply.interpretation.missing.map(item => <li key={item}>{item}</li>)}</ul></div>}
          <p>{reply.interpretation.nextAction}</p>
        </> : <p role="status">{reply.status === 'failed' ? 'We saved this reply but could not interpret it. You can read the original below.'
          : 'We saved the venue reply and are preparing its summary.'}</p>}
        <details><summary className="cursor-pointer underline">Read original reply</summary>
          <p>{reply.message.subject}</p><p className="whitespace-pre-wrap">{reply.message.text}</p>
          <p className="text-sm text-stone">Message reference: {reply.message.messageId}</p>
        </details>
        <p className="text-stone">A quote is not a reservation. No payment or booking is made from this reply.</p>
      </article>)}
  </section>
}
