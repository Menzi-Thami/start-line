import { useState } from 'react'
import type { TrainingPlan } from '../../lib/types'
import { daysBetween } from '../../lib/countdown'
import { completedTasks, raceChecklistKey, RACE_TASKS } from '../race-week/checklist'

export function RaceWeek({ plan, today }: { plan: TrainingPlan; today: string }) {
  return <RaceChecklist key={raceChecklistKey(plan.race.date, plan.race.name)} plan={plan} today={today} />
}

function RaceChecklist({ plan, today }: { plan: TrainingPlan; today: string }) {
  const days = daysBetween(today, plan.race.date)
  const key = raceChecklistKey(plan.race.date, plan.race.name)
  // The plan is the source of truth: never manufacture a taper workout.
  const raceDay = new Date(`${plan.race.date}T12:00:00Z`)
  const firstDay = new Date(raceDay)
  firstDay.setUTCDate(firstDay.getUTCDate() - 6)
  const start = firstDay.toISOString().slice(0, 10)
  const sessions = plan.weeks.flatMap(week => week.sessions)
    .filter(session => session.date >= start && session.date <= plan.race.date)
    .sort((a, b) => a.date.localeCompare(b.date))
  const formatDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const [checked, setChecked] = useState<string[]>(() => {
    try { return completedTasks(localStorage.getItem(key)) } catch { return [] }
  })
  const [notice, setNotice] = useState('')
  if (days < 0 || days > 7) return null
  const change = (id: string, done: boolean) => {
    const next = done ? [...new Set([...checked, id])] : checked.filter(item => item !== id)
    setChecked(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setNotice('Race-week checklist saved on this device.')
    } catch { setNotice('Your changes are visible here but could not be saved on this device.') }
  }
  return <details className="disclosure" open={days <= 2}>
    <summary>Race week · {days === 0 ? 'race day' : days + ' days to go'} · {checked.length}/{RACE_TASKS.length} ready</summary>
    <h3>Final seven days</h3>
    <p className="field-help">Sessions below come from your current training plan; any edits you made to the plan remain the source of truth. This checklist does not add workouts.</p>
    <ol aria-label="Scheduled race-week sessions">
      {sessions.length > 0 ? sessions.map((session, index) =>
        <li key={`${session.date}-${session.type}-${index}`}>
          <strong>{formatDay(session.date)}</strong> — {session.title}
          {Number.isFinite(session.distanceKm) && session.distanceKm > 0 ? ` · ${session.distanceKm} km` : ''}
        </li>
      ) : <li>No sessions are scheduled in the current plan for these dates. Check your plan and event details.</li>}
    </ol>
    <h3>Race-day preparation</h3>
    <p className="field-help">For pacing, use the targets in your training plan and adjust to conditions and how you feel. Use familiar food and hydration practices, check the organiser's weather and course notices, and avoid new kit on race day.</p>
    <p className="field-help">After the event, prioritise recovery and record your result when ready; this checklist does not automatically alter future sessions or send reminders.</p>
    <p className="field-help">A short, optional checklist. All tasks stay visible on race day, including anything still outstanding. Your training plan is unchanged. Progress stays on this device.</p>
    <ul className="race-week-checklist">
      {RACE_TASKS.map(task =>
        <li key={task.id}>
          <label className="field"><input type="checkbox" checked={checked.includes(task.id)} onChange={event => change(task.id, event.target.checked)} /> {task.label}</label>
        </li>)}
    </ul>
    {notice && <p role="status">{notice}</p>}
    <p className="field-help">Use your event's instructions and your usual medical or training guidance for race-specific decisions.</p>
  </details>
}
