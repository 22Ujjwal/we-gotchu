import { useEffect, useRef, useState } from 'react'
import { createEventApi, EventApiError } from '../../lib/hostwell/event-api'
import { emptyDraft } from '../../lib/hostwell/brief-adapter'
import { BriefForm } from './brief-form'

export function BriefIntake({ identity, onCreated }: { identity: string | null; onCreated: (eventId: string) => void }) {
  if (!identity) return <a href="/sign-in?redirect_url=%2F" className="text-[17px] font-semibold underline">Sign in to plan your event</a>
  return <AuthenticatedIntake key={identity} onCreated={onCreated} />
}

function AuthenticatedIntake({ onCreated }: { onCreated: (eventId: string) => void }) {
  const [pending, setPending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  return <BriefForm initial={emptyDraft} pending={pending} disabled={uncertain} onSubmit={async brief => {
    setPending(true)
    try {
      const result = await createEventApi().create(brief)
      if (active.current) onCreated(result.event.eventId)
    } catch (error) {
      if (active.current && (!(error instanceof EventApiError) || error.status === 0 || error.status >= 500 || error.code === 'invalid_response')) setUncertain(true)
      throw error
    } finally { if (active.current) setPending(false) }
  }} />
}
