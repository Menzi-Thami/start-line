import { formatDate, formatDuration, parseTimeSpan } from '../../lib/format'
import type { CoachNote } from '../../lib/types'
import { latestPaced } from './fitness'

/**
 * Why the Paces tab shows the paces it does, once the coach has a view on the runner's fitness. Without one, the tab's
 * usual line (paces from the goal) stands.
 */
export function PacesIntro({ notes, goalSeconds }: { notes: CoachNote[] | undefined; goalSeconds: number }) {
  const latest = latestPaced(notes)
  const fitness = latest?.fitness ? parseTimeSpan(latest.fitness) : null
  if (!latest) return null

  if (fitness !== null) {
    return fitness > goalSeconds ? (
      <p className="tab-intro">
        Your recent runs point to about <strong>{formatDuration(fitness)}</strong> for this race, so your training paces follow that fitness
        today and move as you get fitter. Race-pace runs stay at your goal of {formatDuration(goalSeconds)}.
      </p>
    ) : (
      <p className="tab-intro">
        Your recent runs point to about <strong>{formatDuration(fitness)}</strong>, ahead of your goal of {formatDuration(goalSeconds)}. Your
        paces stay at the goal’s; the coach will say when it’s time to aim higher.
      </p>
    )
  }

  const percent = Math.round(Math.abs(latest.paceFactor - 1) * 100)
  return latest.paceFactor > 1 ? (
    <p className="tab-intro">
      Your hard sessions have felt very hard, so your training paces are {percent}% easier for now. Race-pace runs stay at your goal.
    </p>
  ) : (
    <p className="tab-intro">
      Your hard sessions have felt easy, so your training paces are {percent}% quicker. Race-pace runs stay at your goal.
    </p>
  )
}

/** Predicted race time, week by week, from the coach's calls: progress measured by fitness, not the calendar. */
export function PredictedTimes({ notes, goalSeconds }: { notes: CoachNote[] | undefined; goalSeconds: number }) {
  const points = (notes ?? [])
    .map((n) => ({ week: n.weekStart, seconds: n.fitness ? parseTimeSpan(n.fitness) : null }))
    .filter((p): p is { week: string; seconds: number } => p.seconds !== null)
  if (points.length === 0) return null

  const first = points[0]!
  const last = points.at(-1)!
  const change = first.seconds - last.seconds
  return (
    <>
      <h3>Predicted race time</h3>
      <p>
        From your best recent efforts, week by week. Your goal is {formatDuration(goalSeconds)}.
        {points.length > 1 && change > 0 && ` You’re ${formatDuration(change)} quicker than when the coach first had a view.`}
      </p>
      <ol className="predicted-times">
        {points.map((p) => (
          <li key={p.week} className={p.seconds <= goalSeconds ? 'is-at-goal' : undefined}>
            <span>Week of {formatDate(p.week, 'dayMonth')}</span>
            <span className="mono">{formatDuration(p.seconds)}</span>
          </li>
        ))}
      </ol>
    </>
  )
}
