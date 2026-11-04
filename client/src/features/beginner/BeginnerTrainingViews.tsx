import type { BeginnerProgress } from './beginner-progress'
import { beginnerDate, sessionId } from './beginner-progress'
import { couchTo5k } from './couch-to-5k'

const programme = couchTo5k()

export type BeginnerTrainingStatus = 'confirmed' | 'recorded' | 'planned'

/** Explicit check-ins and temporary provider observations are different facts. */
export function beginnerTrainingStatus(
  progress: BeginnerProgress, week: number, day: 1 | 2 | 3, recorded: ReadonlySet<string>,
): BeginnerTrainingStatus {
  const id = sessionId({ week, day }, progress.revision)
  if (progress.completed.includes(id)) return 'confirmed'
  if (recorded.has(id)) return 'recorded'
  return 'planned'
}

export function beginnerWeekSummary(
  progress: BeginnerProgress, week: number, recorded: ReadonlySet<string>,
) {
  const sessions = programme.filter(session => session.week === week)
  const confirmed = sessions.filter(session => beginnerTrainingStatus(progress, session.week, session.day, recorded) === 'confirmed').length
  const provisional = sessions.filter(session => beginnerTrainingStatus(progress, session.week, session.day, recorded) === 'recorded').length
  return { confirmed, provisional, remaining: sessions.length - confirmed - provisional, total: sessions.length }
}

const STATUS: Record<BeginnerTrainingStatus, { symbol: string; label: string }> = {
  confirmed: { symbol: '✓', label: 'Confirmed complete' },
  recorded: { symbol: '↗', label: 'Recorded via Strava · not confirmed' },
  planned: { symbol: '○', label: 'Scheduled' },
}

export function BeginnerCalendar({
  progress, recorded, onChooseWeek,
}: { progress: BeginnerProgress; recorded: ReadonlySet<string>; onChooseWeek: (week: number) => void }) {
  return <section className="beginner-overview" aria-label="Couch to 5K calendar">
    <p className="field-help">Nine weeks · three sessions a week. Select a week to view its workouts.</p>
    <div className="beginner-weeks">
      {Array.from({ length: 9 }, (_, i) => i + 1).map(week => {
        const summary = beginnerWeekSummary(progress, week, recorded)
        const first = beginnerDate(progress, week, 1)
        return <button type="button" key={week} className="beginner-week-card" aria-current={progress.week === week ? 'step' : undefined}
          onClick={() => onChooseWeek(week)} aria-label={`Week ${week}, from ${first}, ${summary.confirmed} confirmed, ${summary.provisional} recorded via Strava. View this week`}>
          <span className="beginner-week-number">Week {week}</span>
          <span className="field-help">{first}</span>
          <span className="beginner-week-dots" aria-hidden="true">
            {([1, 2, 3] as const).map(day => {
              const state = beginnerTrainingStatus(progress, week, day, recorded)
              return <span key={day} className={`beginner-status is-${state}`}>{STATUS[state].symbol}</span>
            })}
          </span>
          <span className="field-help">{summary.confirmed} confirmed{summary.provisional ? ` · ${summary.provisional} recorded` : ''}</span>
        </button>
      })}
    </div>
    <p className="field-help">✓ Confirmed by you · ↗ Recorded via Strava, not confirmed · ○ Scheduled. Recorded runs are provisional and disappear when provider data expires.</p>
  </section>
}

export function BeginnerProgress({
  progress, recorded,
}: { progress: BeginnerProgress; recorded: ReadonlySet<string> }) {
  const weeks = Array.from({ length: 9 }, (_, i) => beginnerWeekSummary(progress, i + 1, recorded))
  const confirmed = weeks.reduce((sum, week) => sum + week.confirmed, 0)
  const provisional = weeks.reduce((sum, week) => sum + week.provisional, 0)
  const remaining = 27 - confirmed - provisional
  return <section className="beginner-overview" aria-label="Couch to 5K progress">
    <div className="beginner-progress-facts">
      <div><strong>{confirmed}<small> / 27</small></strong><span>Confirmed workouts</span></div>
      <div><strong>{provisional}</strong><span>Recorded via Strava</span></div>
      <div><strong>{remaining}</strong><span>Not yet confirmed or recorded</span></div>
    </div>
    <h3>Week by week</h3>
    <div className="beginner-progress-weeks">
      {weeks.map((week, i) => <div key={i} className="beginner-progress-week">
        <span className="mono">W{i + 1}</span>
        <div className="beginner-progress-track" role="img"
          aria-label={`Week ${i + 1}: ${week.confirmed} confirmed, ${week.provisional} recorded via Strava, ${week.remaining} scheduled`}>
          {week.confirmed > 0 && <span className="beginner-bar-confirmed" style={{ width: `${week.confirmed / 3 * 100}%` }} />}
          {week.provisional > 0 && <span className="beginner-bar-recorded" style={{ width: `${week.provisional / 3 * 100}%` }} />}
        </div>
        <span className="mono">{week.confirmed}/3</span>
      </div>)}
    </div>
    <p className="field-help">Solid = confirmed workouts · Outline = recorded via Strava. We don't judge whether you followed every interval from a recording alone.</p>
    <p className="field-help">Your ninth week builds towards 30 minutes of comfortable running. Reaching 5 km can take longer, and that's okay.</p>
  </section>
}
