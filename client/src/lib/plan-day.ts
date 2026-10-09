import { daysBetween, progressBetween } from './countdown'
import type { TrainingPlan } from './types'

/** What today is, as far as the plan is concerned. */
export type DayKind = 'before' | 'training' | 'rest' | 'race' | 'after'

export function dayKind(plan: TrainingPlan, today: string): DayKind {
  if (today < plan.startDate) return 'before'
  if (today === plan.race.date) return 'race'
  if (today > plan.race.date) return 'after'
  return plan.weeks.some((w) => w.sessions.some((s) => s.date === today)) ? 'training' : 'rest'
}

export interface PlanProgress {
  kind: DayKind
  /** 0 on the plan's first day (and before it), 1 on race day: how far round the ring and along the course. */
  fraction: number
  /** Days until race day; 0 on the day, negative after it. */
  daysToGo: number
  /** Days until the plan starts, while it hasn't. */
  daysToStart: number
}

export function planProgress(plan: TrainingPlan, today: string): PlanProgress {
  return {
    kind: dayKind(plan, today),
    fraction: progressBetween(plan.startDate, plan.race.date, today),
    daysToGo: daysBetween(today, plan.race.date),
    daysToStart: daysBetween(today, plan.startDate),
  }
}
