import { useState } from 'react'
import { formatDate, type Units } from '../../lib/format'
import type { TrainingPlan } from '../../lib/types'
import { exportTcxWorkout } from '../workout-export/tcx-workout'

export function WorkoutExport({ plan, units }: { plan: TrainingPlan; units: Units }) {
  const sessions = plan.weeks.flatMap(week => week.sessions).filter(session => session.steps.length > 0 && session.type !== 'Strength')
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState('')
  const chosen = sessions[selected] ?? sessions[0]

  function saveFile(name: string, contents: string, type: string) {
    const url = URL.createObjectURL(new Blob([contents], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function exportSelected() {
    if (!chosen) return
    setError('')
    try {
      const name = `taperday-${chosen.date}-${chosen.type.toLowerCase()}.tcx`
      saveFile(name, exportTcxWorkout(chosen), 'application/xml;charset=utf-8')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export this workout.')
    }
  }

  function saveText() {
    const rows = ['Taperday session overview', 'Race: ' + plan.race.name, 'Units: ' + units,
      ...plan.weeks.flatMap(week => week.sessions.map(s => [formatDate(s.date), s.title, s.distanceKm + ' km'].join(' · ')))]
    saveFile('taperday-workouts.txt', rows.join('\n'), 'text/plain;charset=utf-8')
  }

  return <details className="disclosure">
    <summary>Workout export</summary>
    <p>Export the steps of a running session as TCX workout XML, or download a readable list of your plan.</p>
    <p className="field-help">TCX output is experimental. Import support varies by service and device; this does not transfer workouts to your watch automatically.</p>
    {chosen && <div className="field">
      <label htmlFor="tcx-workout-choice">Workout to export</label>
      <select id="tcx-workout-choice" value={selected} onChange={event => { setSelected(Number(event.target.value)); setError('') }}>
        {sessions.map((session, index) => <option key={session.date + ':' + session.type + ':' + index} value={index}>{formatDate(session.date)} · {session.title}</option>)}
      </select>
      <button type="button" className="button button-quiet" onClick={exportSelected}>Download structured workout (.tcx)</button>
    </div>}
    {!chosen && <p className="field-help">No structured running sessions are available in this plan.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="button button-quiet" onClick={saveText}>Download session overview (.txt)</button>
  </details>
}
