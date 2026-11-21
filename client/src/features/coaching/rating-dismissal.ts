import type { Session, TrainingPlan } from '../../lib/types'

/** A per-plan, per-session display preference only; no run or effort data is saved here. */
const ratingKey = (plan: TrainingPlan, session: Pick<Session, 'date' | 'type'>) =>
  `taperday.rating.dismissed.${encodeURIComponent(plan.race.slug ?? plan.race.name)}.${plan.startDate}.${session.date}.${session.type}`

export const ratingWasDismissed = (plan: TrainingPlan, session: Pick<Session, 'date' | 'type'>) => {
  try { return localStorage.getItem(ratingKey(plan, session)) !== null } catch { return false }
}

export const dismissRating = (plan: TrainingPlan, session: Pick<Session, 'date' | 'type'>) => {
  try { localStorage.setItem(ratingKey(plan, session), '1') } catch { /* storage unavailable: hide for this visit */ }
}
