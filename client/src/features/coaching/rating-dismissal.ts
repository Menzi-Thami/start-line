import type { Session, TrainingPlan } from '../../lib/types'

// A per-plan, per-session display preference only; no run or effort data is saved here. Like the device copy of
// check-ins it belongs to one runner: another sign-in or signing out clears it, so on a shared device one runner's
// "Not now" never hides another runner's prompt.
const KEY = 'taperday:rating-dismissals:v1'
const LEGACY_PREFIX = 'taperday.rating.dismissed.'

interface Stored { owner: string | null; keys: string[] }

const ratingKey = (plan: TrainingPlan, session: Pick<Session, 'date' | 'type'>) =>
  `${encodeURIComponent(plan.race.slug ?? plan.race.name)}.${plan.startDate}.${session.date}.${session.type}`

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY)
    const stored: Stored | null = raw ? JSON.parse(raw) : null
    return stored && (typeof stored.owner === 'string' || stored.owner === null) && Array.isArray(stored.keys) ? stored : null
  } catch { return null }
}

export const ratingWasDismissed = (plan: TrainingPlan, session: Pick<Session, 'date' | 'type'>) =>
  read()?.keys.includes(ratingKey(plan, session)) ?? false

export const dismissRating = (plan: TrainingPlan, session: Pick<Session, 'date' | 'type'>) => {
  if (plan.isPrivate) return
  const stored = read() ?? { owner: null, keys: [] }
  const key = ratingKey(plan, session)
  if (stored.keys.includes(key)) return
  try { localStorage.setItem(KEY, JSON.stringify({ owner: stored.owner, keys: [...stored.keys, key] } satisfies Stored)) }
  catch { /* storage unavailable: hide for this visit */ }
}

export function clearRatingDismissals(): void {
  try {
    localStorage.removeItem(KEY)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(LEGACY_PREFIX)) localStorage.removeItem(key)
    }
  } catch { /* Storage may already be unavailable. */ }
}

/** One remembered runner per device: a different account starts with every rating prompt showing again. */
export function activateRatingOwner(owner: string | null): void {
  if (read()?.owner === owner) return
  clearRatingDismissals()
  try { localStorage.setItem(KEY, JSON.stringify({ owner, keys: [] } satisfies Stored)) } catch { /* nothing to keep */ }
}
