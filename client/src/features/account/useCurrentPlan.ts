import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { fromRequest, toSearchParams, type PlanInputs } from '../../lib/plan-url'
import type { GeneratePlanRequest } from '../../lib/types'
import { localToday } from '../../lib/format'
import { JOURNEY_CHANGED } from '../journey/useJourney'

/** The runner's one current plan: what they open on, and what a new plan would replace. */
export interface CurrentPlan {
  id: string
  name: string
  inputs: GeneratePlanRequest
  raceDate?: string
}

/** Training ends after race day, including a copy opened offline or an older server response. */
export function currentTraining(plan: CurrentPlan | null | undefined, today: string): CurrentPlan | null | undefined {
  const date = plan?.raceDate ?? plan?.inputs.raceDate
  return date && date < today ? null : plan
}

/**
 * The same saved answers, compared the way the plan link is written. Recent performance is retained with the plan:
 * changing it must enable Save even though it only affects the goal outlook, not the generated workouts.
 */
export function samePlan(a: GeneratePlanRequest, b: GeneratePlanRequest): boolean {
  const left = fromRequest(a)
  const right = fromRequest(b)
  const link = (inputs: PlanInputs) => toSearchParams({ ...inputs,
    raceSnapshot: undefined,
    raceName: inputs.raceSlug ? undefined : inputs.raceName?.trim() || 'Your race',
  }).toString()
  return left !== null && right !== null && link(left) === link(right)
}

/** The same race (catalogue race, or the same named race on the same day): saving then updates the plan in place. */
export function sameRace(a: GeneratePlanRequest, b: GeneratePlanRequest): boolean {
  if (a.raceSlug) return a.raceSlug === b.raceSlug
  return !b.raceSlug && (a.raceName ?? '').trim().toLowerCase() === (b.raceName ?? '').trim().toLowerCase() && a.raceDate === b.raceDate
}

async function fetchCurrent(getToken: () => Promise<string | null>, today: string): Promise<CurrentPlan | null | undefined> {
  const token = await getToken()
  if (!token) return undefined
  const active = (await api.me.plans(token)).find((p) => p.status === 'Active' && (!p.raceDate || p.raceDate >= today))
  if (!active) return null
  const plan = await api.me.plan(token, active.id)
  if (plan.status !== 'Active' || plan.plan.race.date < today) return null
  return { id: plan.id, name: plan.name, inputs: plan.inputs, raceDate: plan.plan.race.date }
}

/**
 * Loads the runner's current plan once they're signed up. `undefined` while it loads (or when it can't be known), `null`
 * when they have none. `refresh` reloads it after a save, a restore or a delete.
 */
export function useCurrentPlan(enabled: boolean, today = localToday()) {
  const auth = useAuth()
  const [loaded, setCurrent] = useState<{ owner: typeof auth; value: CurrentPlan | null | undefined }>({ owner: auth, value: undefined })
  const current = loaded.owner === auth ? loaded.value : undefined
  const sequence = useRef(0)

  const load = useCallback(() => {
    const mine = ++sequence.current
    return fetchCurrent(auth.getToken, today).then(value => { if (mine === sequence.current) setCurrent({ owner: auth, value }) })
  }, [auth, today])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const requests = sequence
    const mine = ++sequence.current
    // If it can't load, the app carries on without it: the builder shows, and saving still asks the API, which knows.
    fetchCurrent(auth.getToken, today)
      .then((found) => { if (!cancelled && mine === sequence.current) setCurrent({ owner: auth, value: found ?? null }) })
      .catch(() => { if (!cancelled && mine === sequence.current) setCurrent({ owner: auth, value: null }) })
    return () => {
      cancelled = true
      requests.current++
    }
  }, [enabled, auth, today])
  useEffect(() => {
    if (!enabled) return
    const refresh = () => { void load().catch(() => undefined) }
    window.addEventListener(JOURNEY_CHANGED, refresh)
    return () => window.removeEventListener(JOURNEY_CHANGED, refresh)
  }, [enabled, load])

  return { current: enabled ? currentTraining(current, today) : undefined, remember: (saved: CurrentPlan) => { sequence.current++; setCurrent({ owner: auth, value: saved }) }, refresh: () => load().catch(() => undefined) }
}
