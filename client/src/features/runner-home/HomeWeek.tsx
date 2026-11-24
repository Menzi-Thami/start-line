import { addDays, formatDate, formatDistance, formatDuration, parseTimeSpan, type Units } from '../../lib/format'
import { count } from '../../lib/plural'
import { strengthSummary } from '../../lib/strength'
import type { ActivitySummary, PlanWeek, Session, TrainingPlan } from '../../lib/types'
import type { SessionCoach } from '../coaching/useCheckIns'
import { PHASES } from '../plan/copy'
import { WorkoutArtwork } from '../shared/WorkoutArtwork'
import { recordingForToday } from './today-recording'
import './home-week.css'

function runState(session: Session, coach: SessionCoach | undefined, runs: readonly ActivitySummary[], today: string) {
  const own = coach?.get(session)
  const recording = recordingForToday(session, coach, runs)
  const label = own?.status === 'Skipped' ? 'Skipped' : own?.status === 'CutShort' ? 'Cut short' : own?.status === 'Done' ? 'Done' : recording?.source.kind === 'Strava' ? 'Recorded via Strava' : recording ? 'Recorded run' : !coach ? 'Planned session' : session.date < today ? 'Not logged' : 'Scheduled'
  return { own, recording, label, counted: !!own && own.status !== 'Skipped' || !!recording }
}

/** The whole dated week, with large rows. Opening a recording reuses its real ID and measurements. */
export function HomeWeek({ plan, week, today, units, runs, coach, onOpenPlan, onOpenDay, onOpenRun }: {
  plan: TrainingPlan; week: PlanWeek; today: string; units: Units; runs: readonly ActivitySummary[]; coach?: SessionCoach
  onOpenPlan: () => void; onOpenDay?: (date: string) => void; onOpenRun: (id: string) => void
}) {
  const training = week.sessions.filter(session => session.type !== 'Strength' && session.type !== 'Race')
  const progress = training.map(session => runState(session, coach, runs, today))
  const logged = progress.filter(value => value.counted).length
  return <section className="home-week-workouts" aria-label="This week">
    <header className="home-week-heading">
      <div><p className="plan-kicker">Week {week.number} of {plan.weeks.length} · {PHASES[week.phase]}</p><h2>Your week.</h2><p className="field-help">{plan.race.name} · {formatDistance(plan.race.distanceKm, units)} · {formatDate(plan.race.date)}</p></div>
      <button type="button" className="link-button" onClick={onOpenPlan}>View this week <span aria-hidden="true">→</span></button>
    </header>
    {training.length > 0 && coach && <div className="home-week-completion"><div className="home-week-progress" aria-hidden="true">{progress.map((value, index) => <span key={index} className={value.counted ? 'is-recorded' : ''} />)}</div><p className="field-help">{logged} of {count(training.length, 'run')} logged or recorded</p></div>}
    <ol className="home-workout-list" aria-label="This week’s workouts">
      {Array.from({ length: 7 }, (_, index) => {
        const date = addDays(week.startDate, index)
        const sessions = week.sessions.filter(session => session.date === date)
        const running = sessions.filter(session => session.type !== 'Strength')
        const first = running[0] ?? sessions[0]
        const outside = date < plan.startDate || date > plan.race.date
        const state = running[0] ? runState(running[0], coach, runs, today) : null
        const own = state?.own?.status !== 'Skipped' ? state?.own : undefined
        const recording = state?.recording
        const actualKm = own?.distanceKm ?? recording?.distanceKm
        const duration = own?.duration ? parseTimeSpan(own.duration) : recording?.movingSeconds
        const known = actualKm != null || duration != null
        const title = outside ? 'Outside this plan' : running.length ? running.map(session => session.title).join(' + ') : first ? 'Strength day' : 'Rest day'
        const measure = outside ? 'Outside your training schedule' : known ? [actualKm != null ? formatDistance(actualKm, units) : '', duration != null ? `${formatDuration(duration)}${!own?.duration && recording ? ' moving' : ''}` : ''].filter(Boolean).join(' · ')
          : running.length ? `${formatDistance(running.reduce((sum, session) => sum + session.distanceKm, 0), units)} planned` : first ? strengthSummary(first) : 'No run scheduled'
        return <li key={date} className={date === today ? 'is-today' : undefined}>
          <button type="button" className="home-workout-button" data-date={date} disabled={outside} aria-current={date === today ? 'date' : undefined} onClick={() => recording ? onOpenRun(recording.id) : onOpenDay ? onOpenDay(date) : onOpenPlan()}>
            <WorkoutArtwork session={first} outside={outside} />
            <span className="home-workout-copy"><span className="home-workout-date"><time dateTime={date}>{formatDate(date, 'weekday')} · {formatDate(date, 'dayMonth')}</time>{date === today && <span className="home-workout-today">Today</span>}</span><strong>{title}</strong>{running.length > 0 && sessions.some(session => session.type === 'Strength') && <span className="home-workout-strength">+ Strength</span>}<span className="home-workout-measure">{measure}</span>{state && <span className={`home-workout-status${state.counted ? ' is-recorded' : ''}`}>{state.counted && <span aria-hidden="true">{own?.status === 'CutShort' ? '−' : recording && !own ? '↗' : '✓'} </span>}{state.label}{own?.activityId && !recording ? ' · recording unavailable' : ''}</span>}</span>
            {!outside && <span className="home-workout-arrow" aria-hidden="true">→</span>}
          </button>
        </li>
      })}
    </ol>
  </section>
}
