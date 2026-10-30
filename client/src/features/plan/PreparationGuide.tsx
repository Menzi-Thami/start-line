import { formatDate, formatDistance, formatDuration, parseTimeSpan, type Units } from '../../lib/format'
import type { TrainingPlan } from '../../lib/types'

export function PreparationGuide({ plan, units, mode, date }: { plan: TrainingPlan; units: Units; mode: string | null; date: string | null }) {
  const longRun = plan.weeks.flatMap(w => w.sessions).find(s => s.date === date
    && ['LongRun', 'LongRunFastFinish', 'LongRunRacePace'].includes(s.type))
  const isLong = mode === 'long' && longRun != null
  const goal = parseTimeSpan(plan.goalTime) ?? 0
  const distance = plan.race.distanceKm
  const interval = distance > 42.2 ? 10 : 5
  const checkpoints: number[] = []
  if (distance > 0 && goal > 0) {
    for (let km = interval; km < distance && checkpoints.length < 30; km += interval) checkpoints.push(km)
    checkpoints.push(distance)
  }

  return (
    <div className="preparation-guide">
      <h3>{isLong ? `Prepare for ${longRun.title.toLowerCase()}` : `Prepare for ${plan.race.name}`}</h3>
      <p>{formatDate(isLong ? longRun.date : plan.race.date, 'long')}{isLong ? ` · ${formatDistance(longRun.distanceKm, units)}` : ''}</p>
      {isLong && <><p>{longRun.detail}</p>{longRun.purpose && <p className="field-help">{longRun.purpose}</p>}</>}
      <ul>
        <li>{isLong ? 'Check your route and planned effort, and choose a safe place to start.' : 'Check the organiser’s start time, race-number collection and final instructions.'}</li>
        <li>{isLong ? 'Plan access to water and carry the fuel you have practised using.' : 'Allow time for travel, parking, toilets and getting to your start area.'}</li>
        <li>Set out familiar shoes and kit; check the forecast and prepare for the conditions.</li>
        <li>Use familiar food and drinks. Keep the evening simple and protect time for sleep.</li>
      </ul>
      {!isLong && checkpoints.length > 0 && (
        <>
          <h3>Goal-time checkpoints</h3>
          <p className="field-help">An even-pace reference for your {formatDuration(goal)} goal, measured from your own start. Hills, conditions and how you feel can change the pace you run.</p>
          <table className="race-checkpoints">
            <thead><tr><th scope="col">Distance</th><th scope="col">Elapsed time</th></tr></thead>
            <tbody>{checkpoints.map(km => <tr key={km}><th scope="row">{formatDistance(km, units)}{km === distance ? ' · Finish' : ''}</th><td>{formatDuration(Math.round(goal * km / distance))}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  )
}
