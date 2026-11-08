import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createEventSession, type EventSessionKey } from './event-session'

export function useEventSession({ eventId, identity }: EventSessionKey) {
  // Replacing the store also clears the render before effects clean up the previous account.
  const session = useMemo(() => createEventSession({ eventId, identity }), [eventId, identity])
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  useEffect(() => {
    session.start()
    return () => session.stop()
  }, [session])
  return { ...state, refresh: session.refresh, update: session.update, approve: session.approve, cancel: session.cancel }
}
