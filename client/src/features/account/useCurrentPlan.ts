import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { fromRequest, toSearchParams, type PlanInputs } from '../../lib/plan-url'
import type { GeneratePlanRequest } from '../../lib/types'

/** The runner's one current plan: what they open on, and what a new plan would replace. */
export interface CurrentPlan {
  id: string
  name: string
  inputs: GeneratePlanRequest
}

/**
 * The same plan when the answers are the same, compared the way the plan link is written. A recent result is left out:
 * it only feeds the goal outlook, never the plan, and a saved plan doesn't keep it.
 */
export function samePlan(a: GeneratePlanRequest, b: GeneratePlanRequest): boolean {
  const left = fromRequest(a)
  const right = fromRequest(b)
  const link = (inputs: PlanInputs) => toSearchParams({ ...inputs, recent: undefined }).toString()
  return left !== null && right !== null && link(left) === link(right)
}

/** The same race (catalogue race, or the same named race on the same day): saving then updates the plan in place. */
export function sameRace(a: GeneratePlanRequest, b: GeneratePlanRequest): boolean {
  if (a.raceSlug) return a.raceSlug === b.raceSlug
  return !b.raceSlug && (a.raceName ?? '').trim().toLowerCase() === (b.raceName ?? '').trim().toLowerCase() && a.raceDate === b.raceDate
}

async function fetchCurrent(getToken: () => Promise<string | null>): Promise<CurrentPlan | null | undefined> {
  const token = await getToken()
  if (!token) return undefined
  const active = (await api.me.plans(token)).find((p) => p.status === 'Active')
  if (!active) return null
  const plan = await api.me.plan(token, active.id)
  return { id: plan.id, name: plan.name, inputs: plan.inputs }
}

/**
 * Loads the runner's current plan once they're signed up. `undefined` while it loads (or when it can't be known), `null`
 * when they have none. `refresh` reloads it after a save, a restore or a delete.
 */
export function useCurrentPlan(enabled: boolean) {
  const auth = useAuth()
  const [current, setCurrent] = useState<CurrentPlan | null | undefined>(undefined)

  const load = useCallback(() => fetchCurrent(auth.getToken).then(setCurrent), [auth])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // If it can't load, the app carries on without it: the builder shows, and saving still asks the API, which knows.
    fetchCurrent(auth.getToken)
      .then((found) => !cancelled && setCurrent(found ?? null))
      .catch(() => !cancelled && setCurrent(null))
    return () => {
      cancelled = true
    }
  }, [enabled, auth])

  return { current: enabled ? current : undefined, refresh: () => load().catch(() => undefined) }
}
