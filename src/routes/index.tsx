import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

const steps = [
  'Describe your event and answer any follow-up questions.',
  'Compare venues and supplies, with sources and cancellation terms.',
  'Review the exact total and approve the commitments once.',
  'Track bookings, purchases, cancellations, and refunds in one place.',
]

function Home() {
  return (
    <>
      <h1 className="text-3xl font-bold">Plan an event without the juggling</h1>
      <p className="mt-4 text-lg">
        We Gotchu turns your requirements into one plan with a venue, supplies,
        a cost breakdown, and cancellation terms. Nothing is booked or bought
        until you approve it. Planning is free.
      </p>
      <h2 className="mt-8 text-xl font-semibold">How it works</h2>
      <ol className="mt-4 list-decimal space-y-2 pl-6">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-8 text-sm text-slate-600">
        Event intake is not available yet.
      </p>
    </>
  )
}
