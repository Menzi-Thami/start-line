import type { CSSProperties } from 'react'
import { formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'
import type { WorkoutExecution } from '../../lib/types'
import './workout-stages.css'

const LABEL = { WarmUp: 'Warm-up', Run: 'Effort', Recover: 'Recovery', CoolDown: 'Cool-down', Repeat: 'Repeat' }

type Stage = WorkoutExecution['stages'][number]

/** What the plan asked for in this part: "2 km" or "1:00". */
const planned = (stage: Stage, units: Units) =>
  stage.plannedMetres != null ? formatDistance(stage.plannedMetres / 1000, units) : formatDuration(stage.plannedSeconds ?? 0)

const state = (stage: Stage) => (stage.coverage >= .995 ? 'done' : stage.coverage > 0 ? 'part' : 'missed')
const STATE_WORDS = { done: 'Done', part: 'Part done', missed: 'Not in this run' }

/**
 * Where the runner's pace sat against the target, as a picture: the band is the target, the dot is them, and faster is
 * to the right. Null without both a pace and a target.
 */
function PaceGauge({ stage, units }: { stage: Stage; units: Units }) {
  const pace = stage.paceSecondsPerKm
  const fast = stage.fastestSecondsPerKm
  const slow = stage.slowestSecondsPerKm
  if (pace == null || fast == null || slow == null) return null
  const low = Math.min(fast, pace) - 30
  const high = Math.max(slow, pace) + 30
  const at = (seconds: number) => `${((high - seconds) / (high - low)) * 100}%`
  const inBand = pace >= fast - Math.max(5, fast * .05) && pace <= slow + Math.max(5, slow * .05)
  const verdict = inBand ? 'on target' : pace < fast ? 'faster than target' : 'slower than target'
  return (
    <div className={`pace-gauge${inBand ? ' is-on' : ' is-off'}`} role="img"
      aria-label={`${formatPace(pace, units)}, ${verdict} (${formatPace(fast, units)}–${formatPace(slow, units)})`}>
      <span className="pace-gauge-band" style={{ left: at(slow), right: `calc(100% - ${at(fast)})` } as CSSProperties} />
      <span className="pace-gauge-dot" style={{ left: at(pace) }} />
    </div>
  )
}

/**
 * The workout part by part, as a picture first: a strip of every part, then one row each with a done mark and where the
 * pace landed against the target. Lined up from the moment the recording started, so it's a guide; the runner's
 * check-in is what counts.
 */
export function WorkoutStages({ execution, units }: { execution?: WorkoutExecution | null; units: Units }) {
  if (!execution?.stages.length) {
    return <section className="panel"><h3>Each part of the workout</h3><p>This run can’t be split into the workout’s parts: the recording doesn’t have the detail.</p></section>
  }
  const stages = execution.stages
  const done = stages.filter(stage => state(stage) === 'done').length
  const onTarget = stages.filter(stage => stage.inTargetShare != null && stage.inTargetShare >= .6).length
  const targeted = stages.filter(stage => stage.inTargetShare != null).length
  return <section className="panel workout-stages" aria-label="Each part of the workout">
    <h3>Each part of the workout</h3>
    <div className="workout-stage-totals">
      <p><strong className="mono">{done}/{stages.length}</strong><span>parts done</span></p>
      {targeted > 0 && <p><strong className="mono">{onTarget}/{targeted}</strong><span>on target pace</span></p>}
    </div>
    <ol className="workout-strip" aria-hidden="true">
      {stages.map(stage => <li key={stage.number} className={`strip-${stage.kind} strip-${state(stage)}`} style={{ flexGrow: Math.max(stage.movingSeconds, stage.plannedSeconds ?? 0, 30) }} />)}
    </ol>
    <ol className="workout-stage-rows">{stages.map(stage => <li key={stage.number} className={`workout-stage is-${state(stage)}`}>
      <span className="workout-stage-mark" role="img" aria-label={STATE_WORDS[state(stage)]} />
      <span className="workout-stage-name">
        <strong>{LABEL[stage.kind]}</strong>
        <span className="field-help">{planned(stage, units)}{stage.coverage > 0 && stage.coverage < .995 ? ` · ${Math.round(stage.coverage * 100)}%` : ''}</span>
      </span>
      <PaceGauge stage={stage} units={units} />
      <span className="workout-stage-pace mono">{stage.paceSecondsPerKm != null ? formatPace(stage.paceSecondsPerKm, units) : '—'}</span>
    </li>)}</ol>
    <p className="field-help workout-stage-key"><span className="key-dot" /> your pace · <span className="key-band" /> target · faster →</p>
    <p className="field-help">Lined up from when you pressed start. Changed the session? Your check-in is what counts.</p>
  </section>
}
