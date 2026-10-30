import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { ActivitySummary, CoachNote as Note, PlanWeek, TrainingPlan } from '../../lib/types'
import { CoachNote } from '../coaching/CoachNote'
import { FEEL_WORDS, reviewWeek, sessionDay, weekAhead, type CheckInFor } from '../coaching/week-review'

interface Props {
  plan: TrainingPlan
  /** This week of the plan. */
  week: PlanWeek
  /** The coach's calls on the plan; this week's leads the panel. */
  coachNotes: readonly Note[]
  today: string
  units: Units
  runs: readonly ActivitySummary[]
  checkInFor?: CheckInFor
}

const day = (date: string) => formatDate(date, 'weekday')

function LastWeek({ week, today, units, runs, checkInFor }: { week: PlanWeek | undefined } & Pick<Props, 'today' | 'units' | 'runs' | 'checkInFor'>) {
  if (!week) {
    return <p className="field-help">Nothing to look back on yet: this is your first week. After it, the coach fits the next one to how it went.</p>
  }
  const review = reviewWeek(week, runs, today, checkInFor)
  const missed = review.missed.filter((s) => s !== review.longRun?.session)
  return (
    <ul className="your-week-list">
      <li>
        <strong className="mono">
          {review.doneRuns} of {review.dueRuns}
        </strong>{' '}
        runs done
      </li>
      <li>
        <strong className="mono">{formatDistance(review.ranKm, units)}</strong> of {formatDistance(review.plannedKm, units)} planned
      </li>
      {review.longRun && (
        <li>
          Long run:{' '}
          {review.longRun.done
            ? review.longRun.ranKm != null
              ? `${formatDistance(review.longRun.ranKm, units)} of ${formatDistance(review.longRun.session.distanceKm, units)}`
              : 'done'
            : 'missed'}
        </li>
      )}
      {review.feel && <li>{FEEL_WORDS[review.feel]}.</li>}
      {missed.length > 0 && <li>Missed: {missed.map(sessionDay).join('; ')}.</li>}
      {review.pain && <li>You noted something sore. Look after it, and say so in your next check-in.</li>}
      {review.checkedIn === 0 && <li className="field-help">Check in after your runs and the coach can tell how they felt, not just that they happened.</li>}
    </ul>
  )
}

function ThisWeek({ plan, week, units }: Pick<Props, 'plan' | 'week' | 'units'>) {
  const ahead = weekAhead(plan, week)
  const change =
    ahead.changeKm == null || ahead.changeKm === 0
      ? null
      : `${ahead.changeKm > 0 ? '▲' : '▼'} ${formatDistance(Math.abs(ahead.changeKm), units)} ${ahead.changeKm > 0 ? 'more than' : 'less than'} last week`
  return (
    <ul className="your-week-list">
      <li>
        <strong className="mono">{formatDistance(ahead.plannedKm, units)}</strong> planned
        {week.isCutback && ', an easier week'}
        {change && <span className={`home-change ${ahead.changeKm! > 0 ? 'home-change-up' : 'home-change-down'}`}> {change}</span>}
      </li>
      {ahead.keySessions.length > 0 && (
        <li>
          Key sessions: {ahead.keySessions.map((s) => `${s.title} (${day(s.date)})`).join(', ')}
        </li>
      )}
      {ahead.longRun && (
        <li>
          Long run: {formatDistance(ahead.longRun.distanceKm, units)} on {day(ahead.longRun.date)}
        </li>
      )}
      {ahead.race && <li>Race day: {day(ahead.race.date)}. Keep the rest of the week easy.</li>}
    </ul>
  )
}

/**
 * The week on one card: the coach's call for it, how last week went and what this one asks for. Built from the
 * coached plan, the runner's own runs (uploads and, while they're kept, synced ones) and their check-ins.
 */
export function YourWeek({ plan, week, coachNotes, today, units, runs, checkInFor }: Props) {
  const note = coachNotes.find((n) => n.weekStart === week.startDate)
  const lastWeek = plan.weeks.find((w) => w.number === week.number - 1)
  return (
    <section className="panel your-week" aria-labelledby="your-week">
      <h2 id="your-week" className="home-card-heading">
        Your week
      </h2>
      {note && <CoachNote note={note} />}
      {week.guidance && <p className="week-guidance">{week.guidance}</p>}
      <div className="your-week-grid">
        <section aria-labelledby="your-week-last">
          <h3 id="your-week-last">Last week</h3>
          <LastWeek week={lastWeek} today={today} units={units} runs={runs} checkInFor={checkInFor} />
        </section>
        <section aria-labelledby="your-week-this">
          <h3 id="your-week-this">
            This week · week {week.number} of {plan.weeks.length}
          </h3>
          <ThisWeek plan={plan} week={week} units={units} />
        </section>
      </div>
    </section>
  )
}
