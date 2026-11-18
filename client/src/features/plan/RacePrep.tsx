import { forwardRef, useState } from 'react'
import { daysBetween } from '../../lib/countdown'
import { formatDate, formatDistance, formatDuration, parseTimeSpan, type Units } from '../../lib/format'
import type { TrainingPlan } from '../../lib/types'
import { inRaceWeek } from './plan-math'
import { completedTasks, raceChecklistKey, RACE_TASKS } from '../race-week/checklist'

/**
 * Race prep, in race week only: the race-day message, an even-pace goal table and a short checklist kept on this device.
 * The week's sessions are the plan's own, shown just above it, so nothing here adds or changes a workout.
 */
export const RacePrep = forwardRef<HTMLElement, { plan: TrainingPlan; today: string; units: Units }>(function RacePrep({ plan, today, units }, ref) {
  if (!inRaceWeek(plan, today)) return null
  return <RacePrepCard key={raceChecklistKey(plan.race.date, plan.race.name)} ref={ref} plan={plan} today={today} units={units} />
})

const RacePrepCard = forwardRef<HTMLElement, { plan: TrainingPlan; today: string; units: Units }>(function RacePrepCard({ plan, today, units }, ref) {
  const key = raceChecklistKey(plan.race.date, plan.race.name)
  const days = daysBetween(today, plan.race.date)
  const raceDay = days === 0
  const [checked, setChecked] = useState<string[]>(() => {
    try { return completedTasks(localStorage.getItem(key)) } catch { return [] }
  })
  const [notice, setNotice] = useState('')
  const goal = parseTimeSpan(plan.goalTime) ?? 0
  const distance = plan.race.distanceKm
  const interval = distance > 42.2 ? 10 : 5
  const checkpoints: number[] = []
  if (distance > 0 && goal > 0) {
    for (let km = interval; km < distance && checkpoints.length < 30; km += interval) checkpoints.push(km)
    checkpoints.push(distance)
  }
  const change = (id: string, done: boolean) => {
    const next = done ? [...new Set([...checked, id])] : checked.filter(item => item !== id)
    setChecked(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setNotice('')
    } catch { setNotice('Your ticks show here but couldn’t be saved on this device.') }
  }
  return (
    <section ref={ref} id="race-prep" tabIndex={-1} className="panel race-prep preparation-card" aria-labelledby="race-prep-title">
      {raceDay ? (
        <div className="race-day-card">
          <span className="race-day-confetti" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 41) % 100}%`, animationDelay: `-${(i % 5) * 0.35}s`, animationDuration: `${1.8 + (i % 4) * 0.4}s` }} />
            ))}
          </span>
          <p className="mono">{formatDate(plan.race.date, 'long').toUpperCase()}</p>
          <h3 id="race-prep-title">It’s race day.</h3>
          <p>Start at goal pace, not faster, and save something for the second half. Enjoy it.</p>
        </div>
      ) : (
        <>
          <p className="plan-kicker">Race week · {days === 1 ? '1 day' : `${days} days`} to go</p>
          <h3 id="race-prep-title">Prepare for {plan.race.name}</h3>
          <p>Keep the last runs easy, sleep well and use kit and food you know.</p>
        </>
      )}
      <ul className="race-week-checklist" aria-label="Race checklist">
        {RACE_TASKS.map(task => (
          <li key={task.id}>
            <label className="field"><input type="checkbox" checked={checked.includes(task.id)} onChange={event => change(task.id, event.target.checked)} /> {task.label}</label>
          </li>
        ))}
      </ul>
      <p className="field-help">{checked.length} of {RACE_TASKS.length} ready · saved on this device.</p>
      {notice && <p role="status">{notice}</p>}
      {checkpoints.length > 0 && (
        <>
          <h4>Goal-time checkpoints</h4>
          <p className="field-help">Even pace for {formatDuration(goal)}, from your own start. Hills and conditions change it.</p>
          <table className="race-checkpoints">
            <thead><tr><th scope="col">Distance</th><th scope="col">Elapsed time</th></tr></thead>
            <tbody>{checkpoints.map(km => <tr key={km}><th scope="row">{formatDistance(km, units)}{km === distance ? ' · Finish' : ''}</th><td>{formatDuration(Math.round(goal * km / distance))}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </section>
  )
})
