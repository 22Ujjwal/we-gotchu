import { useEffect, useRef, useState } from 'react'
import type { PlanningCommand, PlanningView } from '../../agent/planning/contract'
import { createPlanningApi, PlanningApiError, type PlanningCreate } from './planning-api'

type Intent = PlanningCreate | PlanningCommand
const api = createPlanningApi()

// The authenticated component is keyed by account and conversation to discard private state together.
export function usePlanningSession(id?: string) {
  const [view, setView] = useState<PlanningView | null>(null)
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(!!id)
  const [error, setError] = useState<PlanningApiError | null>(null)
  const [uncertain, setUncertain] = useState<Intent | null>(null)
  const state = useRef({ active: false, generation: 0, controller: new AbortController(),
    timer: undefined as ReturnType<typeof setTimeout> | undefined, busy: false, failures: 0 })

  function cancelRead() {
    const current = state.current
    clearTimeout(current.timer)
    current.controller.abort()
    current.controller = new AbortController()
    return ++current.generation
  }
  function accept(next: PlanningView) {
    setView(previous => {
      if (previous && previous.version > next.version) return previous
      return { ...next, proposal: next.proposal ?? (next.status === 'working' ? previous?.proposal ?? null : null) }
    })
  }
  function schedule(delay: number) {
    clearTimeout(state.current.timer)
    state.current.timer = setTimeout(() => void read(false), delay)
  }
  async function read(manual: boolean, keepError = false) {
    const current = state.current
    if (!id || !current.active || current.busy) return
    const generation = cancelRead()
    if (manual) setLoading(true)
    try {
      const next = await api.read(id, current.controller.signal)
      if (!current.active || generation !== current.generation) return
      accept(next)
      current.failures = 0
      const confirmationClosed = uncertain && 'kind' in uncertain && uncertain.kind === 'confirm'
        && next.version > uncertain.expectedVersion && next.status !== 'uncertain' && next.canReviewResearch
        && next.approvals && !next.approvals.some(approval => approval.id === uncertain.approvalId)
      if (confirmationClosed) { setUncertain(null); setError(null) }
      else if (!keepError) setError(previous => previous?.uncertain ? previous : null)
      if (next.status === 'working') schedule(2000)
      else if (next.status === 'blocked') schedule(5000)
    } catch (cause) {
      if (!current.active || generation !== current.generation) return
      const failure = cause instanceof PlanningApiError ? cause : new PlanningApiError(0, false)
      setError(failure)
      if ([401, 403, 404].includes(failure.status)) { setView(null); setUncertain(null) }
      else if (failure.status === 0 || failure.status >= 500) {
        current.failures++
        schedule(Math.min(2000 * 2 ** current.failures, 16000))
      }
    } finally {
      if (current.active && generation === current.generation) setLoading(false)
    }
  }
  useEffect(() => {
    state.current.active = true
    void read(true)
    return () => { state.current.active = false; cancelRead() }
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
      if (id && next.status === 'working') schedule(2000)
      else if (id && next.status === 'blocked') schedule(5000)
      return next
    } catch (cause) {
      if (!current.active || generation !== current.generation) return null
      const failure = cause instanceof PlanningApiError ? cause : new PlanningApiError(0, true)
      setError(failure)
      if (failure.uncertain) setUncertain(intent)
      else {
        setUncertain(null)
        if ([401, 403, 404].includes(failure.status)) setView(null)
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
    refresh: () => read(true) }
}
