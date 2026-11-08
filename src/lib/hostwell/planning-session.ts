import { useEffect, useRef, useState } from 'react'
import type { PlanningCommand, PlanningView } from '../../agent/planning/contract'
import { createPlanningApi, PlanningApiError, type PlanningCreate } from './planning-api'

type Intent = PlanningCreate | PlanningCommand
const api = createPlanningApi()
const fastSavedPolls = 60
const savedFailureLimit = 60
function awaitsSavedUpdate(view: PlanningView | null) {
  return view?.arrangement?.status === 'awaiting_reply'
    || !!view?.inquiry?.replies?.some(reply => reply.status === 'received' || reply.status === 'processing')
}

// The authenticated component is keyed by account and conversation to discard private state together.
export function usePlanningSession(id?: string) {
  const [view, setView] = useState<PlanningView | null>(null)
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(!!id)
  const [error, setError] = useState<PlanningApiError | null>(null)
  const [uncertain, setUncertain] = useState<Intent | null>(null)
  const state = useRef({ active: false, generation: 0, controller: new AbortController(),
    timer: undefined as ReturnType<typeof setTimeout> | undefined, busy: false, reading: false,
    failures: 0, savedPolls: 0, latest: null as PlanningView | null })

  function cancelRead() {
    const current = state.current
    clearTimeout(current.timer)
    current.reading = false
    current.controller.abort()
    current.controller = new AbortController()
    return ++current.generation
  }
  function accept(next: PlanningView) {
    if (state.current.latest && state.current.latest.version > next.version) return
    state.current.latest = next
    setView(previous => {
      if (previous && previous.version > next.version) return previous
      return { ...next, proposal: next.proposal ?? (next.status === 'working' ? previous?.proposal ?? null : null) }
    })
  }
  function schedule(delay: number, savedOnly = false) {
    clearTimeout(state.current.timer)
    if (savedOnly && (state.current.failures >= savedFailureLimit || document.visibilityState === 'hidden')) return
    state.current.timer = setTimeout(() => {
      if (savedOnly) {
        if (document.visibilityState === 'hidden') return
        state.current.savedPolls++
      }
      void read(false, false, savedOnly)
    }, delay)
  }
  function scheduleNext(next: PlanningView) {
    if (next.status === 'working' || next.inquiry?.delivery?.status === 'pending' || ['requested', 'preparing'].includes(next.arrangement?.status ?? '')) schedule(2000)
    else if (next.status === 'blocked') schedule(5000)
    else if (awaitsSavedUpdate(next)) schedule(state.current.savedPolls < fastSavedPolls ? 5000 : 15000, true)
  }
  async function read(manual: boolean, keepError = false, savedOnly = false, reconcileMail = false) {
    const current = state.current
    if (!id || !current.active || current.busy || current.reading) return
    const generation = cancelRead()
    current.reading = true
    if (manual) { setLoading(true); current.savedPolls = 0; current.failures = 0 }
    try {
      const next = await api.read(id, current.controller.signal, savedOnly, reconcileMail)
      if (!current.active || generation !== current.generation) return
      accept(next)
      current.failures = 0
      const confirmationClosed = uncertain && 'kind' in uncertain && uncertain.kind === 'confirm'
        && next.version > uncertain.expectedVersion && next.status !== 'uncertain' && next.canReviewResearch
        && next.approvals && !next.approvals.some(approval => approval.id === uncertain.approvalId)
      const inquiryResolved = uncertain && 'kind' in uncertain && uncertain.kind === 'send_inquiry'
        && next.inquiry?.delivery?.requestId === uncertain.requestId
        && ['accepted', 'failed'].includes(next.inquiry.delivery.status)
      if (confirmationClosed || inquiryResolved) { setUncertain(null); setError(null) }
      else if (!keepError) setError(previous => previous?.uncertain ? previous : null)
      scheduleNext(current.latest ?? next)
    } catch (cause) {
      if (!current.active || generation !== current.generation) return
      const failure = cause instanceof PlanningApiError ? cause : new PlanningApiError(0, false)
      setError(failure)
      if ([401, 403, 404].includes(failure.status)) { setView(null); current.latest = null; setUncertain(null) }
      else if (failure.status === 0 || failure.status >= 500) {
        current.failures++
        schedule(Math.min(2000 * 2 ** current.failures, 16000), savedOnly)
      }
    } finally {
      if (current.active && generation === current.generation) { current.reading = false; setLoading(false) }
    }
  }
  useEffect(() => {
    state.current.active = true
    void read(true, false, true)
    const resume = () => {
      if (document.visibilityState === 'hidden' || state.current.busy || state.current.reading || !awaitsSavedUpdate(state.current.latest)) return
      void read(true, false, true)
    }
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
      state.current.active = false
      cancelRead()
    }
    // Account and route changes remount the owner rather than sharing its state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function submit(intent: Intent): Promise<PlanningView | null> {
    const current = state.current
    if (current.busy || !current.active) return null
    current.busy = true
    const generation = cancelRead()
    setPending(true)
    setError(null)
    try {
      const next = id ? await api.command(id, intent as PlanningCommand, current.controller.signal)
        : await api.create(intent as PlanningCreate, current.controller.signal)
      if (!current.active || generation !== current.generation) return null
      accept(next)
      setUncertain(null)
      current.savedPolls = 0
      current.failures = 0
      if (id) scheduleNext(current.latest ?? next)
      return next
    } catch (cause) {
      if (!current.active || generation !== current.generation) return null
      const failure = cause instanceof PlanningApiError ? cause : new PlanningApiError(0, true)
      setError(failure)
      if (failure.uncertain) setUncertain(intent)
      else {
        setUncertain(null)
        if ([401, 403, 404].includes(failure.status)) { setView(null); current.latest = null }
        if (failure.status === 409) {
          current.busy = false
          await read(true, true)
        }
      }
      return null
    } finally {
      if (current.active && generation <= current.generation) {
        current.busy = false
        setPending(false)
      }
    }
  }
  return { view, pending, loading, error, uncertain, submit,
    refresh: () => read(true), refreshSaved: () => read(true, false, true), checkMail: () => read(true, false, false, true) }
}
