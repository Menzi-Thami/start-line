import { formatDistance, type Units } from '../../lib/format'
import { wellOverPlan } from '../../lib/plan-runs'
import type { PlanWeek } from '../../lib/types'
import { trainingKm } from './plan-math'

interface Props {
  weeks: PlanWeek[]
  units: Units
  currentWeek: number | null
  /** Kilometres run in each week that has started, by week number. */
  ran: ReadonlyMap<number, number>
}

/**
 * What was run against what was planned, week by week, in words: the chart's numbers for anyone who doesn't read
 * charts. Short weeks get just the numbers; life happens and the plan carries on.
 */
export function WeekTotals({ weeks, units, currentWeek, ran }: Props) {
  const started = weeks.filter((w) => ran.has(w.number))
  if (started.length === 0) return null
  const number = (km: number) => formatDistance(km, units).replace(` ${units}`, '')

  return (
    <ul className="week-totals">
      {started.map((week) => {
        const planned = trainingKm(week)
        const km = ran.get(week.number) ?? 0
        const isNow = week.number === currentWeek
        return (
          <li className="week-total" key={week.number}>
            <span className="week-total-name">Week {week.number}</span>
            <span className="week-total-numbers">
              Ran {number(km)} of {formatDistance(planned, units)}
              {isNow && ' so far'}
            </span>
            {wellOverPlan(planned, km) && <span className="week-total-note">More than planned. Keep the next easy run easy.</span>}
          </li>
        )
      })}
    </ul>
  )
}
