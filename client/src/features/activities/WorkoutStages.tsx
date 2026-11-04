import { formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'
import type { WorkoutExecution } from '../../lib/types'

const LABEL = { WarmUp: 'Warm-up', Run: 'Work', Recover: 'Recovery', CoolDown: 'Cool-down', Repeat: 'Repeated block' }

export function WorkoutStages({ execution, units }: { execution?: WorkoutExecution | null; units: Units }) {
  if (!execution?.stages.length) return <section className="panel"><h3>Workout structure</h3><p>Detailed stage evidence is unavailable for this recording. Kilometre splits and a matching distance cannot establish interval execution.</p></section>
  return <section className="panel workout-stages" aria-label="Workout stage evidence">
    <h3>Planned stages · recorded evidence</h3>
    <p>Estimated alignment: the prescription starts at the beginning of the recording. These windows show what was recorded there; they cannot verify that you followed each instruction or identify an intentional change.</p>
    <ol>{execution.stages.map(stage => <li key={stage.number} className="workout-stage">
      <h4>{stage.number}. {LABEL[stage.kind]}</h4>
      <p>Planned: {stage.plannedMetres != null ? formatDistance(stage.plannedMetres / 1000, units) : formatDuration(stage.plannedSeconds ?? 0)}</p>
      <p><strong>{stage.coverage >= .995 ? 'Window covered' : stage.coverage > 0 ? 'Partial window' : 'Not reached in this recording'}</strong> · {Math.round(stage.coverage * 100)}% of prescribed distance or time</p>
      {stage.coverage > 0 && <p>Recorded: {formatDistance(stage.recordedMetres / 1000, units)} · {formatDuration(stage.movingSeconds)} moving{stage.paceSecondsPerKm != null ? ` · ${formatPace(stage.paceSecondsPerKm, units)}` : ''}</p>}
      {stage.elapsedSeconds - stage.movingSeconds >= 5 && <p className="field-help">{formatDuration(stage.elapsedSeconds - stage.movingSeconds)} stationary within this window. Stationary time is excluded from timed work, and included in timed recovery.</p>}
      {stage.fastestSecondsPerKm != null && stage.slowestSecondsPerKm != null && <p>Target: {formatPace(stage.fastestSecondsPerKm, units)}–{formatPace(stage.slowestSecondsPerKm, units)}</p>}
      {stage.inTargetShare != null && <p>{Math.round(stage.inTargetShare * 100)}% of sampled 10-second moving windows near the pace target, allowing 5% or 5 s/km at either edge.</p>}
    </li>)}</ol>
    <p className="field-help">Coverage and pace are separate observations. Your check-in remains your own answer. Missing later windows can reflect a shorter recording or a changed session, not a reason inferred by Taperday.</p>
  </section>
}
