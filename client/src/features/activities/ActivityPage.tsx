import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate, formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'
import type { Activity, Split } from '../../lib/types'
import { actualLine, distanceDifference, halvesSummary, KIND_LABEL, paceVerdict, plannedLine } from './activity-copy'

type LoadState = { kind: 'loading' } | { kind: 'ready'; activity: Activity } | { kind: 'error'; message: string }

interface Props {
  id: string
  /** The run as the upload returned it, so a fresh upload opens without a second request. */
  initial?: Activity
  units: Units
  onBack: () => void
  onDeleted: () => void
}

/** One run: the headline numbers, how it went against the plan, km by km, and the fastest stretches in it. */
export function ActivityPage({ id, initial, units, onBack, onDeleted }: Props) {
  const auth = useAuth()
  const [state, setState] = useState<LoadState>(() => (initial?.id === id ? { kind: 'ready', activity: initial } : { kind: 'loading' }))
  const [attempt, setAttempt] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (initial?.id === id && attempt === 0) return
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.activity(token, id) : Promise.reject(new Error('Sign in to see your runs.'))))
      .then((activity) => !cancelled && setState({ kind: 'ready', activity }))
      .catch((error: unknown) => !cancelled && setState({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' }))
    return () => {
      cancelled = true
    }
  }, [auth, id, initial, attempt])

  const remove = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      await api.me.deleteActivity(token, id)
      onDeleted()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'That run wasn’t deleted. Try again.')
      setDeleting(false)
    }
  }

  const back = (
    <button type="button" className="link-button" onClick={onBack}>
      ← All runs
    </button>
  )

  if (state.kind === 'loading') {
    return (
      <section aria-busy="true">
        {back}
        <p className="loading-line">Loading your run…</p>
      </section>
    )
  }

  if (state.kind === 'error') {
    return (
      <section>
        {back}
        <div className="error-panel" role="alert" style={{ marginTop: 'var(--space-4)' }}>
          <strong>We couldn’t load that run.</strong>
          <p>{state.message}</p>
          <button
            type="button"
            className="button button-quiet"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={() => {
              setState({ kind: 'loading' })
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </button>
        </div>
      </section>
    )
  }

  const run = state.activity
  const title = run.plan?.title ?? KIND_LABEL[run.kind]

  return (
    <article className="activity" aria-labelledby="activity-title">
      {back}
      <p className="plan-kicker" style={{ marginTop: 'var(--space-4)' }}>
        {formatDate(run.localDate, 'long')} · {KIND_LABEL[run.kind]}
      </p>
      <h2 className="plan-title" id="activity-title">
        {title}
      </h2>

      <dl className="activity-stats">
        <Stat label="Distance" value={formatDistance(run.distanceKm, units)} lead />
        <Stat label="Moving time" value={formatDuration(run.movingSeconds)} lead />
        <Stat label="Pace" value={formatPace(run.paceSecondsPerKm, units)} lead />
        {run.elevationGainMetres != null && <Stat label="Elevation gain" value={`${run.elevationGainMetres} m`} />}
        {run.averageHeartRate != null && <Stat label="Avg heart rate" value={`${run.averageHeartRate} bpm`} />}
        {run.maxHeartRate != null && <Stat label="Max heart rate" value={`${run.maxHeartRate} bpm`} />}
        {run.calories != null && <Stat label="Calories" value={`${run.calories}`} />}
        {run.elapsedSeconds - run.movingSeconds >= 60 && <Stat label="Elapsed time" value={formatDuration(run.elapsedSeconds)} />}
      </dl>

      {run.plan ? (
        <section className="panel plan-vs-actual" aria-labelledby="vs-plan-title">
          <h3 id="vs-plan-title">Against your plan</h3>
          <p className="field-help">
            {run.plan.planName} · {run.plan.title}
          </p>
          <div className="vs-rows">
            <p>
              <span className="vs-label">Planned</span> <strong className="mono">{plannedLine(run.plan, units)}</strong>
            </p>
            <p>
              <span className="vs-label">You ran</span> <strong className="mono">{actualLine(run.plan, units)}</strong>{' '}
              <span className="tag">{distanceDifference(run.plan, units)}</span>
            </p>
          </div>
          <p className="vs-verdict" data-pace={run.plan.pace}>{paceVerdict(run.plan, units)}</p>
        </section>
      ) : (
        <p className="plan-focus">No session was planned for this day, so there’s nothing to compare. Every run counts.</p>
      )}

      <Splits splits={run.splits} summary={halvesSummary(run.halves, units)} />

      {run.bestEfforts.length > 0 && (
        <section className="section" aria-labelledby="efforts-title">
          <h3 id="efforts-title">Best efforts</h3>
          <p>The fastest stretch of each distance anywhere in this run, stops included, like a race clock.</p>
          <ul className="efforts">
            {run.bestEfforts.map((effort) => (
              <li key={effort.distanceMetres} className="effort">
                <span className="effort-name">{effort.name}</span>
                <span className="mono effort-time">{formatDuration(effort.seconds)}</span>
                <span className="mono effort-pace">{formatPace(effort.paceSecondsPerKm, units)}</span>
                {effort.isPersonalBest && <span className="tag tag-pb">PB</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section danger-zone">
        <h3>Delete this run</h3>
        <p>Removes it and its splits from Taperday. Your watch and Garmin Connect keep their copy.</p>
        {confirming ? (
          <div className="submit-row">
            <button type="button" className="button button-danger" disabled={deleting} onClick={() => void remove()}>
              {deleting ? 'Deleting…' : 'Yes, delete this run'}
            </button>
            <button type="button" className="button button-quiet" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" className="button button-quiet" onClick={() => setConfirming(true)}>
            Delete run
          </button>
        )}
        {deleteError && (
          <p className="field-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
            {deleteError}
          </p>
        )}
      </section>
    </article>
  )
}

function Stat({ label, value, lead = false }: { label: string; value: string; lead?: boolean }) {
  return (
    <div className={lead ? 'stat stat-lead' : 'stat'}>
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  )
}

/** Kilometre splits with a bar per km: longer is faster. Splits are always per km, whatever the units. */
function Splits({ splits, summary }: { splits: Split[]; summary: string }) {
  if (splits.length === 0) return null
  const paces = splits.map((s) => s.paceSecondsPerKm)
  const fastest = Math.min(...paces)
  const slowest = Math.max(...paces)
  const width = (pace: number) => (slowest === fastest ? 100 : 45 + (55 * (slowest - pace)) / (slowest - fastest))

  return (
    <section className="section" aria-labelledby="splits-title">
      <h3 id="splits-title">Splits</h3>
      <p>{summary}</p>
      <table className="splits">
        <thead>
          <tr>
            <th scope="col">Km</th>
            <th scope="col">Pace</th>
            <th scope="col">
              <span className="visually-hidden">Speed</span>
            </th>
            <th scope="col">Elev</th>
            <th scope="col">HR</th>
          </tr>
        </thead>
        <tbody>
          {splits.map((split) => (
            <tr key={split.number} className={split.isQuickest ? 'split-quickest' : split.isHardest ? 'split-hardest' : undefined}>
              <th scope="row" className="mono">
                {split.distanceKm < 0.995 ? split.distanceKm.toFixed(2) : split.number}
              </th>
              <td className="mono">
                {formatPace(split.paceSecondsPerKm, 'km')}
                {split.isQuickest && <span className="tag tag-quickest">Quickest</span>}
                {split.isHardest && <span className="tag tag-hardest">Hardest</span>}
              </td>
              <td className="split-bar-cell" aria-hidden="true">
                <span className="split-bar" style={{ width: `${width(split.paceSecondsPerKm)}%` }} />
              </td>
              <td className="mono">{split.elevationChangeMetres == null ? '–' : `${split.elevationChangeMetres > 0 ? '+' : ''}${Math.round(split.elevationChangeMetres)} m`}</td>
              <td className="mono">{split.averageHeartRate ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
