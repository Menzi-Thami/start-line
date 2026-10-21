import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { Units } from '../../lib/format'
import type { CheckIn, CheckInRequest, Session } from '../../lib/types'

/** What a session needs to show and take a check-in. Only the runner's current saved plan has one. */
export interface SessionCoach {
  today: string
  units: Units
  get: (session: Session) => CheckIn | undefined
  save: (session: Session, answers: CheckInRequest) => Promise<void>
  remove: (session: Session) => Promise<void>
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
  const checkIns = loaded && loaded.planId === planId ? loaded.checkIns : null

  useEffect(() => {
    if (!planId) return
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.checkIns(token, planId) : []))
      .then((list) => !cancelled && setLoaded({ planId, checkIns: new Map(list.map((c) => [key(c.date, c.sessionType), c])) }))
      // Without its check-ins the plan still works; the coach just has nothing to go on yet.
      .catch(() => !cancelled && setLoaded({ planId, checkIns: new Map() }))
    return () => {
      cancelled = true
    }
  }, [planId, auth])

  const token = useCallback(async () => {
    const value = await auth.getToken()
    if (!value) throw new ApiError('Your sign-in has expired. Sign in again to carry on.', 401)
    return value
  }, [auth])

  const save = useCallback(
    async (session: Session, answers: CheckInRequest) => {
      if (!planId) return
      const saved = await api.me.saveCheckIn(await token(), planId, session.date, session.type, answers)
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

  return { ready: checkIns !== null, get, save, remove }
}
