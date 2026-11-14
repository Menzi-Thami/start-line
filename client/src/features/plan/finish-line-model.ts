import type { TrainingPlan } from '../../lib/types'
import { sessionKey } from './plan-math'

/** Only training runs count. The race is a separate milestone and strength has its own tracker. */
export function finishLineSummary(plan: TrainingPlan, today: string, confirmed: ReadonlySet<string>, provisional: ReadonlySet<string>) {
  const sessions = plan.weeks.flatMap(week => week.sessions).filter(session => session.type !== 'Race' && session.type !== 'Strength')
  const completed = sessions.filter(session => confirmed.has(sessionKey(session)))
  const synced = sessions.filter(session => !confirmed.has(sessionKey(session)) && provisional.has(sessionKey(session)))
  const distanceKm = Math.round(completed.reduce((sum, session) => sum + (session.distanceKm || 0), 0) * 10) / 10
  const lastTrainingDate = sessions.reduce((last, session) => session.date > last ? session.date : last, '')
  const allConfirmed = sessions.length > 0 && completed.length === sessions.length
  const trainingEnded = !!lastTrainingDate && today >= lastTrainingDate
  const racePassed = today > plan.race.date
  return {
    total: sessions.length,
    completed: completed.length,
    provisional: synced.length,
    distanceKm,
    weeks: plan.weeks.length,
    allConfirmed,
    trainingEnded,
    racePassed,
    // Never award a full-plan badge merely because a date passed or a temporary Strava copy exists.
    earned: allConfirmed,
    visible: allConfirmed || (racePassed && sessions.length > 0),
  }
}
