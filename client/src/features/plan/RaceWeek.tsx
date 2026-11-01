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
    <p className="field-help">A short, optional checklist. Your training plan is unchanged. Progress stays on this device.</p>
    <ul className="race-week-checklist">
      {RACE_TASKS.filter(task => days === 0 ? task.group === 'day' : true).map(task =>
        <li key={task.id}>
          <label className="field"><input type="checkbox" checked={checked.includes(task.id)} onChange={event => change(task.id, event.target.checked)} /> {task.label}</label>
        </li>)}
    </ul>
    {notice && <p role="status">{notice}</p>}
    <p className="field-help">Use your event's instructions and your usual medical or training guidance for race-specific decisions.</p>
  </details>
}
