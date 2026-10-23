import { useState } from 'react'
import { api, ApiError } from '../../lib/api-client'
import { formatDuration, parseTimeSpan } from '../../lib/format'
import { DurationInput } from './controls'
import { durationSeconds } from './duration'
import { RECENT_AGES, RECENT_DISTANCES, type RecentDraft } from './recent-result'

interface Props {
  targetKm: number | null
  /** The recent race, held by the form: the same result also goes to the coach to judge the goal. */
  value: RecentDraft
  onChange: (value: RecentDraft) => void
  onUse: (seconds: number) => void
}

/** "Not sure what to aim for?" Predicts a goal from a recent race using the API's predictor. */
export function GoalEstimator({ targetKm, value, onChange, onUse }: Props) {
  const { km: fromKm, time } = value
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; seconds: number } | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  const estimate = async () => {
    const seconds = durationSeconds(time)
    if (!targetKm) {
      setState({ kind: 'error', message: 'Choose your race first, so we know what distance to predict.' })
      return
    }
    if (seconds <= 0) {
      setState({ kind: 'error', message: 'Enter the time you ran.' })
      return
    }
    setState({ kind: 'busy' })
    try {
      const prediction = await api.predict(fromKm, seconds, targetKm)
      const predicted = parseTimeSpan(prediction.predictedTime)
      setState(predicted ? { kind: 'done', seconds: predicted } : { kind: 'error', message: 'That prediction came back garbled. Try again.' })
    } catch (error) {
      const message =
        error instanceof ApiError && Object.keys(error.fieldErrors).length > 0
          ? 'That time looks off for the distance. Check the hours and minutes.'
          : error instanceof Error
            ? error.message
            : 'That didn’t work. Try again.'
      setState({ kind: 'error', message })
    }
  }

  return (
    <div className="estimate">
      <div className="field">
        <label className="field-label" htmlFor="recent-distance">
          A recent race or time trial
        </label>
        <select id="recent-distance" className="input" value={fromKm} onChange={(e) => onChange({ ...value, km: Number(e.target.value) })}>
          {RECENT_DISTANCES.map((d) => (
            <option key={d.label} value={d.km}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <DurationInput legend="Your time" value={time} onChange={(next) => onChange({ ...value, time: next })} />
      <div className="field">
        <label className="field-label" htmlFor="recent-age">
          When did you run it?
        </label>
        <select id="recent-age" className="input" value={value.ago} onChange={(e) => onChange({ ...value, ago: Number(e.target.value) })}>
          {RECENT_AGES.map((a) => (
            <option key={a.days} value={a.days}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="button button-quiet" onClick={estimate} disabled={state.kind === 'busy'}>
        {state.kind === 'busy' ? 'Working it out…' : 'Estimate my goal'}
      </button>

      <div aria-live="polite">
        {state.kind === 'done' && (
          <div className="estimate-result">
            <p>
              On current form, about <strong>{formatDuration(state.seconds)}</strong> is realistic.
              {targetKm && targetKm > 42.2 && ' Ultras punish optimism, so allow extra for hills, heat and walking.'}
            </p>
            <button type="button" className="button" onClick={() => onUse(state.seconds)}>
              Use this time
            </button>
          </div>
        )}
        {state.kind === 'error' && <p className="field-error">{state.message}</p>}
      </div>
    </div>
  )
}
