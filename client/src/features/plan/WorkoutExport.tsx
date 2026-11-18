import { useId, useState } from 'react'
import { formatDate } from '../../lib/format'
import type { TrainingPlan } from '../../lib/types'
import { exportTcxWorkout } from '../workout-export/tcx-workout'

/** One run's steps as a .tcx workout file, from the plan's tools row. Import support varies by watch. */
export function WorkoutExport({ plan, today }: { plan: TrainingPlan; today: string }) {
  const id = useId()
  const sessions = plan.weeks.flatMap(week => week.sessions).filter(session => session.steps.length > 0 && session.type !== 'Strength')
  // Start on the next run to come, which is the one a runner is most likely to want on their watch.
  const [selected, setSelected] = useState(() => Math.max(0, sessions.findIndex(session => session.date >= today)))
  const [error, setError] = useState('')
  const chosen = sessions[selected] ?? sessions[0]
  if (!chosen) return null

  function exportSelected() {
    if (!chosen) return
    setError('')
    try {
      const url = URL.createObjectURL(new Blob([exportTcxWorkout(chosen)], { type: 'application/xml;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `taperday-${chosen.date}-${chosen.type.toLowerCase()}.tcx`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export this workout.')
    }
  }

  return (
    <details className="menu workout-export">
      <summary className="button button-quiet">Export to watch</summary>
      <div className="menu-panel">
        <label className="field-label" htmlFor={`${id}-choice`}>Workout</label>
        <select className="input" id={`${id}-choice`} value={selected} onChange={event => { setSelected(Number(event.target.value)); setError('') }}>
          {sessions.map((session, index) => <option key={session.date + ':' + session.type + ':' + index} value={index}>{formatDate(session.date)} · {session.title}</option>)}
        </select>
        <button type="button" className="button button-quiet" onClick={exportSelected}>Download .tcx file</button>
        <p className="menu-help">Experimental: not every watch or app imports it, and target paces are in the notes.</p>
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  )
}
