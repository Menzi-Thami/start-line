import type { CSSProperties } from 'react'
import { formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'
import type { WorkoutExecution } from '../../lib/types'
import './workout-stages.css'

const LABEL = { WarmUp: 'Warm-up', Run: 'Effort', Recover: 'Recovery', CoolDown: 'Cool-down', Repeat: 'Repeat' }

type Stage = WorkoutExecution['stages'][number]
type Tone = 'good' | 'warn' | 'miss' | 'plain'

/** What the plan asked for in this part: "2 km" or "1:00". */
const planned = (stage: Stage, units: Units) =>
  stage.plannedMetres != null ? formatDistance(stage.plannedMetres / 1000, units) : formatDuration(stage.plannedSeconds ?? 0)

const state = (stage: Stage) => (stage.coverage >= .995 ? 'done' : stage.coverage > 0 ? 'part' : 'missed')
const STATE_WORDS = { done: 'Done', part: 'Part done', missed: 'Not in this run' }

/** How far outside the target still counts as on it: 5% or 5 s/km, whichever is more. The gauge draws its band this wide. */
const slack = (seconds: number) => Math.max(5, seconds * .05)

/** Within the target, allowing 5% or 5 s/km at either edge: what the gauge's band and every verdict below use. */
function paceResult(stage: Stage): 'on' | 'fast' | 'slow' | null {
  const pace = stage.paceSecondsPerKm
  const fast = stage.fastestSecondsPerKm
  const slow = stage.slowestSecondsPerKm
  if (pace == null || fast == null || slow == null || stage.coverage <= 0) return null
  if (pace < fast - slack(fast)) return 'fast'
  if (pace > slow + slack(slow)) return 'slow'
  return 'on'
}

/** One part, in a word or two: did it hit its target, or was it run at all. */
function partVerdict(stage: Stage): { tone: Tone; label: string } {
  if (stage.coverage <= 0) return { tone: 'miss', label: 'Not run' }
  const short = stage.coverage < .995
  switch (paceResult(stage)) {
    case 'on': return short ? { tone: 'warn', label: 'On target, cut short' } : { tone: 'good', label: 'On target' }
    case 'fast': return { tone: 'warn', label: short ? 'Too fast, cut short' : 'Too fast' }
    case 'slow': return { tone: 'warn', label: short ? 'Too slow, cut short' : 'Too slow' }
    default: return short ? { tone: 'warn', label: 'Cut short' } : { tone: 'plain', label: 'Done' }
  }
}

/**
 * The whole session in one line: hit, mostly hit, or missed. Judged on the efforts that have a pace target (recoveries,
 * warm-up and cool-down only need doing), and saying when it was cut short.
 */
function runVerdict(stages: readonly Stage[]): { tone: Exclude<Tone, 'plain'>; title: string; detail: string } {
  const efforts = stages.filter(stage => stage.kind === 'Run' && stage.fastestSecondsPerKm != null && stage.slowestSecondsPerKm != null)
  const done = stages.filter(stage => stage.coverage >= .995).length
  const cut = done < stages.length ? ` Cut short: ${done} of ${stages.length} parts done.` : ''
  if (efforts.length === 0) {
    return done === stages.length
      ? { tone: 'good', title: 'Workout done', detail: `All ${stages.length} parts done.` }
      : { tone: 'warn', title: 'Workout cut short', detail: cut.trim() }
  }
  const on = efforts.filter(stage => paceResult(stage) === 'on').length
  const fast = efforts.filter(stage => paceResult(stage) === 'fast').length
  const slow = efforts.filter(stage => paceResult(stage) === 'slow').length
  const why = fast > slow ? ' Most misses were too fast: ease into the efforts.' : slow > 0 ? ' Most misses were slower than the target.' : ''
  const counted = `${on} of ${efforts.length} efforts on target.`
  if (on === efforts.length && !cut) return { tone: 'good', title: 'Workout hit', detail: `Every effort on target (${on} of ${efforts.length}).` }
  if (on === efforts.length) return { tone: 'warn', title: 'On target, cut short', detail: `Every effort you ran was on target.${cut}` }
  if (on / efforts.length >= .6) return { tone: 'warn', title: 'Mostly on target', detail: `${counted}${why}${cut}` }
  return { tone: 'miss', title: 'Target missed', detail: `${counted}${why}${cut}` }
}

const MARK: Record<Tone, string> = { good: '✓', warn: '!', miss: '✕', plain: '✓' }

/**
 * Where the runner's pace sat against the target, as a picture: the band is the target, the dot is them, and faster is
 * to the right. Null without both a pace and a target.
 */
function PaceGauge({ stage, units }: { stage: Stage; units: Units }) {
  const pace = stage.paceSecondsPerKm
  const fast = stage.fastestSecondsPerKm
  const slow = stage.slowestSecondsPerKm
  if (pace == null || fast == null || slow == null) return null
  // The band is what counts as on target, so the dot inside it always reads "On target".
  const bandFast = fast - slack(fast)
  const bandSlow = slow + slack(slow)
  const low = Math.min(bandFast, pace) - 20
  const high = Math.max(bandSlow, pace) + 20
  const at = (seconds: number) => `${((high - seconds) / (high - low)) * 100}%`
  const result = paceResult(stage)
  const verdict = result === 'on' ? 'on target' : result === 'fast' ? 'faster than target' : 'slower than target'
  return (
    <div className={`pace-gauge${result === 'on' ? ' is-on' : ' is-off'}`} role="img"
      aria-label={`${formatPace(pace, units)}, ${verdict} (${formatPace(fast, units)}–${formatPace(slow, units)})`}>
      <span className="pace-gauge-band" style={{ left: at(bandSlow), right: `calc(100% - ${at(bandFast)})` } as CSSProperties} />
      <span className="pace-gauge-dot" style={{ left: at(pace) }} />
    </div>
  )
}

/**
 * The workout part by part, as a picture first: the verdict for the whole session, a strip of every part, then one row
 * each with a done mark, where the pace landed against the target and a one-word verdict. Lined up from the moment the
 * recording started, so it's a guide; the runner's check-in is what counts.
 */
export function WorkoutStages({ execution, units }: { execution?: WorkoutExecution | null; units: Units }) {
  if (!execution?.stages.length) {
    return <section className="panel"><h3>Each part of the workout</h3><p>This run can’t be split into the workout’s parts: the recording doesn’t have the detail.</p></section>
  }
  const stages = execution.stages
  const done = stages.filter(stage => state(stage) === 'done').length
  const targeted = stages.filter(stage => paceResult(stage) != null).length
  const onTarget = stages.filter(stage => paceResult(stage) === 'on').length
  const overall = runVerdict(stages)
  return <section className="panel workout-stages" aria-label="Each part of the workout">
    <h3>Each part of the workout</h3>
    <p className={`workout-verdict is-${overall.tone}`}>
      <span className="workout-verdict-mark" aria-hidden="true">{MARK[overall.tone]}</span>
      <span><strong>{overall.title}</strong> {overall.detail}</span>
    </p>
    <div className="workout-stage-totals">
      <p><strong className="mono">{done}/{stages.length}</strong><span>parts done</span></p>
      {targeted > 0 && <p><strong className="mono">{onTarget}/{targeted}</strong><span>on target pace</span></p>}
    </div>
    <ol className="workout-strip" aria-hidden="true">
      {stages.map(stage => <li key={stage.number} className={`strip-${stage.kind} strip-${state(stage)}`} style={{ flexGrow: Math.max(stage.movingSeconds, stage.plannedSeconds ?? 0, 30) }} />)}
    </ol>
    <ol className="workout-stage-rows">{stages.map(stage => {
      const verdict = partVerdict(stage)
      return <li key={stage.number} className={`workout-stage is-${state(stage)}`}>
        <span className="workout-stage-mark" role="img" aria-label={STATE_WORDS[state(stage)]} />
        <span className="workout-stage-name">
          <strong>{LABEL[stage.kind]}</strong>
          <span className="field-help">{planned(stage, units)}{stage.coverage > 0 && stage.coverage < .995 ? ` · ${Math.round(stage.coverage * 100)}%` : ''}</span>
        </span>
        {paceResult(stage) != null ? <PaceGauge stage={stage} units={units} /> : <span className="pace-gauge-none" aria-hidden="true" />}
        <span className="workout-stage-pace mono">{stage.paceSecondsPerKm != null ? formatPace(stage.paceSecondsPerKm, units) : '—'}</span>
        <span className={`workout-stage-verdict is-${verdict.tone}`}>{verdict.label}</span>
      </li>
    })}</ol>
    <p className="field-help workout-stage-key"><span className="key-dot" /> your pace · <span className="key-band" /> target · faster →</p>
    <p className="field-help">Lined up from when you pressed start. Changed the session? Your check-in is what counts.</p>
  </section>
}
