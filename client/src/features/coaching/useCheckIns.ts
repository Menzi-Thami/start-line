import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdjustmentActions } from './PlanAdjustment'
import { useAuth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { Units } from '../../lib/format'
import type { CheckIn, CheckInRequest, Session, SyncedCompletion } from '../../lib/types'

/** What a session needs to show and take a check-in. Only the runner's current saved plan has one. */
export interface SessionCoach {
  today: string
  units: Units
  get: (session: Session) => CheckIn | undefined
  save: (session: Session, answers: CheckInRequest) => Promise<void>
  remove: (session: Session) => Promise<void>
  adjustments?: AdjustmentActions
  entries?: readonly CheckIn[]
  saveAdditional?: (id: string, session: Session, answers: CheckInRequest) => Promise<void>
  removeAdditional?: (id: string) => Promise<void>
  /** A held Strava run that completes the session, worked out by the API on each read and never stored. */
  synced?: (session: Pick<Session, 'date' | 'type'>) => SyncedCompletion | undefined
}

const key = (date: string, type: string) => `${date}|${type}`

/**
 * The runner's check-ins on their saved plan, loaded once and kept in step as they check in. Null while loading, or
 * when there's no saved plan to check in on.
 */
export function useCheckIns(planId: string | null) {
  const auth = useAuth()
  // Kept with the plan they belong to, so switching plans never shows the last plan's check-ins.
  const [loaded, setLoaded] = useState<{ planId: string; checkIns: Map<string, CheckIn> } | null>(null)
  const [failedPlanId, setFailedPlanId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const mutations = useRef(new Map<string, number>())
  const checkIns = loaded && loaded.planId === planId ? loaded.checkIns : null

  useEffect(() => {
    if (!planId) return
    let cancelled = false
    const version = mutations.current.get(planId) ?? 0
    auth
      .getToken()
      .then((token) => {
        if (!token) throw new ApiError('Sign in again to load your saved runs.', 401)
        return api.me.checkIns(token, planId)
      })
      .then((list) => {
        if (cancelled || version !== (mutations.current.get(planId) ?? 0)) return
        setLoaded({ planId, checkIns: new Map(list.map((c) => [c.isAdditional ? c.id! : key(c.date, c.sessionType), c])) })
        setFailedPlanId(null)
      })
      // A failed request is not an empty history. Keep any loaded entries and offer a retry.
      .catch(() => !cancelled && setFailedPlanId(planId))
    return () => {
      cancelled = true
    }
  }, [planId, auth, attempt])
  const retry = useCallback(() => { setFailedPlanId(null); setAttempt(value => value + 1) }, [])

  const token = useCallback(async () => {
    const value = await auth.getToken()
    if (!value) throw new ApiError('Your sign-in has expired. Sign in again to carry on.', 401)
    return value
  }, [auth])

  const save = useCallback(
    async (session: Session, answers: CheckInRequest) => {
      if (!planId) return
      const saved = await api.me.saveCheckIn(await token(), planId, session.date, session.type, answers)
      mutations.current.set(planId, (mutations.current.get(planId) ?? 0) + 1)
      setLoaded((current) =>
        current?.planId === planId ? { planId, checkIns: new Map(current.checkIns).set(key(saved.date, saved.sessionType), saved) } : current,
      )
    },
    [planId, token],
  )

  const remove = useCallback(
    async (session: Session) => {
      if (!planId) return
      await api.me.deleteCheckIn(await token(), planId, session.date, session.type)
      mutations.current.set(planId, (mutations.current.get(planId) ?? 0) + 1)
      setLoaded((current) => {
        if (current?.planId !== planId) return current
        const next = new Map(current.checkIns)
        next.delete(key(session.date, session.type))
        return { planId, checkIns: next }
      })
    },
    [planId, token],
  )

  const get = useCallback((session: Session) => checkIns?.get(key(session.date, session.type)), [checkIns])

  const saveAdditional = useCallback(async (id: string, session: Session, answers: CheckInRequest) => {
    if (!planId) return
    const saved = await api.me.saveAdditionalRun(await token(), planId, id, session.date, session.type, answers)
    mutations.current.set(planId, (mutations.current.get(planId) ?? 0) + 1)
    setLoaded((current) => current?.planId === planId ? { planId, checkIns: new Map(current.checkIns).set(id, saved) } : current)
  }, [planId, token])
  const removeAdditional = useCallback(async (id: string) => {
    if (!planId) return
    await api.me.deleteAdditionalRun(await token(), planId, id)
    mutations.current.set(planId, (mutations.current.get(planId) ?? 0) + 1)
    setLoaded((current) => {
      if (current?.planId !== planId) return current
      const next = new Map(current.checkIns)
      next.delete(id)
      return { planId, checkIns: next }
    })
  }, [planId, token])

  return { ready: checkIns !== null, failed: planId !== null && failedPlanId === planId, retry, get, save, remove, entries: checkIns ? [...checkIns.values()] : [], saveAdditional, removeAdditional }
}
