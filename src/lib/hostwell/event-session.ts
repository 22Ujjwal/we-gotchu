import type { Brief, EventView } from '../../contracts'
import { createEventApi, EventApiError, mergeEventView } from './event-api'

export type EventSessionKey = { eventId: string | null; identity: string | null }
export type EventSessionState = { view: EventView | null; loading: boolean; error: EventApiError | null; pending: boolean }

// Research results are published a moment before the plan is saved. Keep reading
// briefly so the plan appears, without polling forever if it never does.
function savingPlan(view: EventView): boolean {
  const result = view.researchResult
  return !!result && ['succeeded', 'partial'].includes(view.run?.state ?? '') &&
    Date.now() - Date.parse(result.createdAt) < 30_000
}

function needsPolling(view: EventView): boolean {
  return view.event.status === 'researching' && (view.run?.state === 'running' || savingPlan(view)) ||
    ['awaiting_payment', 'executing', 'canceling'].includes(view.event.status) ||
    view.payment?.refundState === 'pending' ||
    view.payment?.state === 'pending' && !view.event.cancelRequestedAt
}

// Payment confirmation waits on a webhook; research still advances every second.
const pollDelay = (view: EventView) => view.event.status === 'awaiting_payment' ? 5000 : 1000

const inactiveError = () => new EventApiError(0, 'session_inactive', 'This event session is no longer active.')
const asApiError = (error: unknown) => error instanceof EventApiError ? error
  : new EventApiError(0, 'connection_failed', 'Could not load the event. Check your connection.')

// One controller belongs to one identity/event pair. The hook replaces it on either change.
export function createEventSession(key: EventSessionKey, api = createEventApi()) {
  const enabled = !!key.eventId && !!key.identity
  let state: EventSessionState = { view: null, loading: enabled, error: null, pending: false }
  const listeners = new Set<() => void>()
  let active = false
  let generation = 0
  let mutationVersion = 0
  let failures = 0
  let uncertain = false
  let mutationError: EventApiError | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let read: { promise: Promise<void>; abort: AbortController } | undefined
  let writeAbort: AbortController | undefined
  const publish = (patch: Partial<EventSessionState>) => {
    state = { ...state, ...patch }
    listeners.forEach(listener => listener())
  }
  const clearTimer = () => { clearTimeout(timer); timer = undefined }
  const current = (version: number) => active && generation === version
  const schedule = (delay: number) => {
    clearTimer()
    if (active && !state.pending) timer = setTimeout(() => { void load() }, delay)
  }
  const accept = (view: EventView) => {
    if (view.event.eventId !== key.eventId) throw new EventApiError(0, 'event_mismatch', 'The response belongs to a different event.')
    return mergeEventView(state.view, view)
  }

  function load(): Promise<void> {
    if (!active || !enabled || state.pending) return Promise.resolve()
    if (read) return read.promise
    clearTimer()
    const version = generation
    const mutation = mutationVersion
    const abort = new AbortController()
    let nextDelay: number | undefined
    const operation = { abort, promise: Promise.resolve() }
    read = operation
    publish({ loading: !state.view })
    operation.promise = (async () => {
      try {
        const view = await api.read(key.eventId!, state.view?.event.progressSequence, abort.signal)
        if (!current(version) || mutation !== mutationVersion) return
        const merged = accept(view)
        uncertain = false
        failures = 0
        publish({ view: merged, error: mutationError, loading: false })
        if (needsPolling(merged)) nextDelay = pollDelay(merged)
      } catch (error) {
        if (!current(version) || mutation !== mutationVersion || abort.signal.aborted) return
        const failure = asApiError(error)
        const accessDenied = [401, 403, 404].includes(failure.status)
        publish({ error: failure, loading: false, ...(accessDenied ? { view: null } : {}) })
        if (failure.code === 'connection_failed' || [408, 429].includes(failure.status) || failure.status >= 500) {
          nextDelay = Math.min(5000, 1000 * 2 ** Math.min(failures++, 3))
        }
      } finally {
        if (read === operation) read = undefined
        if (current(version) && !state.pending && ![401, 403, 404].includes(state.error?.status ?? 0)) {
          // A mutation may finish before an aborted read settles. It still needs a fresh read.
          if (mutation !== mutationVersion) schedule(1000)
          else if (nextDelay !== undefined) schedule(nextDelay)
        }
      }
    })()
    return operation.promise
  }

  async function mutate<T>(operation: (view: EventView, signal: AbortSignal) => Promise<T>,
    apply: (value: T) => void): Promise<T> {
    if (!active || !state.view) throw inactiveError()
    if (state.pending) throw new EventApiError(0, 'mutation_pending', 'An event action is already in progress.')
    if (uncertain) throw new EventApiError(0, 'outcome_unknown', 'Refresh the event before trying another action.')
    clearTimer()
    mutationVersion++
    read?.abort.abort()
    const version = generation
    const view = state.view
    const abort = new AbortController()
    writeAbort = abort
    mutationError = null
    publish({ pending: true, error: null })
    let reconcile = false
    try {
      const value = await operation(view, abort.signal)
      if (!current(version)) throw inactiveError()
      apply(value)
      reconcile = true
      return value
    } catch (error) {
      if (!current(version)) throw inactiveError()
      const failure = asApiError(error)
      mutationError = failure
      uncertain = failure.code === 'outcome_unknown' || failure.status >= 500
      publish({ error: failure, ...([401, 403, 404].includes(failure.status) ? { view: null } : {}) })
      reconcile = failure.status === 409
      throw failure
    } finally {
      if (current(version)) {
        writeAbort = undefined
        publish({ pending: false })
        if (reconcile) schedule(0)
        else if (state.view && needsPolling(state.view)) schedule(pollDelay(state.view))
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    start() {
      if (active || !enabled) return
      active = true
      generation++
      void load()
    },
    stop() {
      active = false
      generation++
      clearTimer()
      read?.abort.abort()
      read = undefined
      writeAbort?.abort()
      writeAbort = undefined
      uncertain = false
      mutationError = null
      failures = 0
      publish({ view: null, loading: false, error: null, pending: false })
    },
    refresh(): Promise<void> {
      if (!state.pending) mutationError = null
      return load()
    },
    async update(changes: Partial<Brief>, expectedBriefRevision: number): Promise<void> {
      await mutate((_view, signal) => api.update(key.eventId!, expectedBriefRevision, changes, signal),
        view => publish({ view: accept(view) }))
    },
    async approve(): Promise<string> {
      const result = await mutate((view, signal) => {
        const plan = view.plan
        if (!plan || plan.eventId !== key.eventId || plan.briefRevision !== view.event.briefRevision ||
            plan.revision !== view.event.planRevision || view.event.cancelRequestedAt ||
            !['plan_ready', 'awaiting_payment'].includes(view.event.status)) {
          throw new EventApiError(409, 'plan_unavailable', 'Review the current plan before approving.')
        }
        return api.approve(key.eventId!, plan.planId, plan.revision, signal)
      }, result => {
        const view = state.view!
        if (result.approval.eventId !== key.eventId || result.approval.planId !== view.plan?.planId ||
            result.approval.planRevision !== view.plan.revision || result.payment.approvalId !== result.approval.approvalId) {
          throw new EventApiError(0, 'outcome_unknown', 'The approval response did not match this plan. Refresh the event.')
        }
        // These records came from approval, but payment success and booking still require server evidence.
        publish({ view: { ...view, approval: result.approval, payment: result.payment } })
      })
      return result.checkoutUrl
    },
    async cancel(): Promise<void> {
      await mutate((_view, signal) => api.cancel(key.eventId!, signal), view => publish({ view: accept(view) }))
    },
  }
}
