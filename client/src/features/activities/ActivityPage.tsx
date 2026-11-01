import { RunDataQuality } from './RunDataQuality'
import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate, formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'
import type { Activity, BestEffort, HeartRate, Split } from '../../lib/types'
import { RunSticker } from '../sharing/RunSticker'
import { PoweredByStrava, ViewOnStrava } from '../sync/StravaBrand'
import {
  actualLine,
  distanceDifference,
  driftText,
  halvesSummary,
  KIND_LABEL,
  plannedLine,
  runVerdict,
  splitFit,
  ZONE_COLOUR,
  ZONE_LABEL,
} from './activity-copy'

type LoadState = { kind: 'loading' } | { kind: 'ready'; activity: Activity } | { kind: 'error'; message: string }

interface Props {
  id: string
  /** The run as the upload returned it, so a fresh upload opens without a second request. */
  initial?: Activity
  units: Units
  onBack: () => void
  onDeleted: () => void
  /** Opens Account, where the runner can add a max heart rate for zones. */
  onOpenAccount?: () => void
}

/** One run, judged against what it was for: the verdict, the numbers, km by km, heart rate, and any bests worth a mention. */
export function ActivityPage({ id, initial, units, onBack, onDeleted, onOpenAccount }: Props) {
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
  const verdict = runVerdict(run, units)

  return (
    <article className="activity" aria-labelledby="activity-title">
      {back}
      <p className="plan-kicker" style={{ marginTop: 'var(--space-4)' }}>
        {formatDate(run.localDate, 'long')} · {KIND_LABEL[run.kind]}
      </p>
      <h2 className="plan-title" id="activity-title">
        {title}
      </h2>
      <RunSticker units={units} run={{ date: run.localDate, title: KIND_LABEL[run.kind], distanceKm: run.distanceKm, seconds: run.movingSeconds, source: run.source.kind }} />
      {run.source.kind === 'Strava' && (
        <p className="activity-source">
          <span>From Strava{run.source.recordedOnGarmin ? ' · recorded on Garmin' : ''}</span>
          {run.source.viewUrl && <ViewOnStrava href={run.source.viewUrl} />}
          <PoweredByStrava />
        </p>
      )}

      <section className="panel verdict" aria-labelledby="verdict-title" data-pace={run.plan?.pace ?? 'Unplanned'}>
        <h3 id="verdict-title" className="verdict-headline">
          {verdict.headline}
        </h3>
        {verdict.details.map((line) => (
          <p key={line} className="verdict-detail">
            {line}
          </p>
        ))}
        {run.plan && (
          <div className="vs-rows">
            <p>
              <span className="vs-label">Planned</span> <strong className="mono">{plannedLine(run.plan, units)}</strong>
            </p>
            <p>
              <span className="vs-label">You ran</span> <strong className="mono">{actualLine(run.plan, units)}</strong>{' '}
              <span className="tag">{distanceDifference(run.plan, units)}</span>
            </p>
            <p className="field-help">From your plan “{run.plan.planName}”.</p>
          </div>
        )}
        {verdict.next && <p className="verdict-next">{verdict.next}</p>}
      </section>

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

      <RunDataQuality run={run} />
      <Splits splits={run.splits} summary={halvesSummary(run.halves, units)} />

      {run.heartRate && <HeartRateSection heartRate={run.heartRate} drift={driftText(run)} onOpenAccount={onOpenAccount} />}

      <BestEfforts efforts={run.bestEfforts} units={units} />

      {run.source.kind === 'Strava' ? (
        <section className="section">
          <h3>Removing this run</h3>
          <p>
            This run comes from Strava, so it follows your Strava account: delete it there and it goes from Taperday within minutes. Disconnecting
            Strava in Account removes every run that came from it.
          </p>
        </section>
      ) : (
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
      )}
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

const ROLE_LABEL = { WarmUp: 'Warm-up', Work: 'Work', CoolDown: 'Cool-down', Steady: '' } as const

/**
 * Kilometre splits. Each bar is coloured by the effort that km was meant to be (the effort ramp), longer is faster,
 * and the words beside it say whether it was in that zone. Splits are always per km, whatever the units.
 */
function Splits({ splits, summary }: { splits: Split[]; summary: string }) {
  if (splits.length === 0) return null
  const paces = splits.map((s) => s.paceSecondsPerKm)
  const fastest = Math.min(...paces)
  const slowest = Math.max(...paces)
  const width = (pace: number) => (slowest === fastest ? 100 : 45 + (55 * (slowest - pace)) / (slowest - fastest))
  const scored = splits.some((s) => s.fit !== 'Unscored')

  return (
    <section className="section" aria-labelledby="splits-title">
      <h3 id="splits-title">Splits</h3>
      <p>
        {summary}
        {scored && ' Each km is checked against the pace it was meant to be.'}
      </p>
      <table className="splits">
        <thead>
          <tr>
            <th scope="col">Km</th>
            <th scope="col">Pace</th>
            <th scope="col">
              <span className="visually-hidden">Speed</span>
            </th>
            {scored && <th scope="col">Zone</th>}
            <th scope="col" className="split-elev">
              Elev
            </th>
            <th scope="col">HR</th>
          </tr>
        </thead>
        <tbody>
          {splits.map((split) => (
            <tr
              key={split.number}
              className={split.isQuickest ? 'split-quickest' : split.isHardest ? 'split-hardest' : undefined}
              data-fit={split.fit}
            >
              <th scope="row" className="mono">
                {split.distanceKm < 0.995 ? split.distanceKm.toFixed(2) : split.number}
              </th>
              <td className="mono">
                {formatPace(split.paceSecondsPerKm, 'km')}
                {split.isQuickest && <span className="tag tag-quickest">Quickest</span>}
                {split.isHardest && <span className="tag tag-hardest">Hardest</span>}
              </td>
              <td className="split-bar-cell" aria-hidden="true">
                <span
                  className="split-bar"
                  style={{ width: `${width(split.paceSecondsPerKm)}%`, background: split.zone ? ZONE_COLOUR[split.zone] : undefined }}
                />
              </td>
              {scored && (
                <td className="split-zone">
                  {split.zone && (
                    <span className="split-zone-name">
                      {ROLE_LABEL[split.role] || ZONE_LABEL[split.zone]}
                    </span>
                  )}
                  <span className="split-fit">{splitFit(split)}</span>
                </td>
              )}
              <td className="mono split-elev">
                {split.elevationChangeMetres == null
                  ? '–'
                  : `${split.elevationChangeMetres > 0 ? '+' : ''}${Math.round(split.elevationChangeMetres)} m`}
              </td>
              <td className="mono">{split.averageHeartRate ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function HeartRateSection({ heartRate, drift, onOpenAccount }: { heartRate: HeartRate; drift: string | null; onOpenAccount?: () => void }) {
  const zones = heartRate.zones
  const total = zones?.reduce((sum, z) => sum + z.seconds, 0) ?? 0
  return (
    <section className="section" aria-labelledby="hr-title">
      <h3 id="hr-title">Heart rate</h3>
      {drift && <p>{drift}</p>}
      {zones && total > 0 ? (
        <>
          <ul className="hr-zones">
            {zones.map((zone) => {
              const share = Math.round((zone.seconds / total) * 100)
              return (
                <li key={zone.zone} className="hr-zone">
                  <span className="hr-zone-name">
                    Zone {zone.zone} <span className="field-help mono">{zone.fromBpm}–{zone.toBpm}</span>
                  </span>
                  <span className="hr-zone-track" aria-hidden="true">
                    <span className="hr-zone-fill" data-zone={zone.zone} style={{ width: `${share}%` }} />
                  </span>
                  <span className="mono hr-zone-time">
                    {formatDuration(zone.seconds)} · {share}%
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="field-help">Zones are shares of the max heart rate you set ({heartRate.maxHeartRateSetting} bpm). A guide, not a medical measure.</p>
        </>
      ) : (
        <p className="field-help">
          Add your max heart rate{' '}
          {onOpenAccount ? (
            <button type="button" className="link-button" onClick={onOpenAccount}>
              in Account
            </button>
          ) : (
            'in Account'
          )}{' '}
          to see time in heart-rate zones. We don’t guess it.
        </p>
      )}
    </section>
  )
}

const STANDING_TAG: Partial<Record<BestEffort['standing'], string>> = { PersonalBest: 'PB', NearBest: 'Near PB' }

/** Bests worth a mention up front (PBs, near misses, race efforts); the full list one tap away. */
function BestEfforts({ efforts, units }: { efforts: BestEffort[]; units: Units }) {
  if (efforts.length === 0) return null
  const highlights = efforts.filter((e) => e.isWorthShowing)
  const firstRun = efforts.every((e) => e.standing === 'FirstTime')

  return (
    <section className="section" aria-labelledby="efforts-title">
      <h3 id="efforts-title">Best efforts</h3>
      {highlights.length > 0 ? (
        <EffortList efforts={highlights} units={units} />
      ) : (
        <p>
          {firstRun
            ? 'Your first run at these distances, so there’s nothing to beat yet. PBs start counting from your next upload.'
            : 'No PBs this time. That’s normal: most runs aren’t meant to be fast.'}
        </p>
      )}
      <details className="disclosure efforts-all">
        <summary>All best efforts in this run ({efforts.length})</summary>
        <p className="field-help">The fastest stretch of each distance anywhere in the run, stops included, like a race clock.</p>
        <EffortList efforts={efforts} units={units} />
      </details>
    </section>
  )
}

function EffortList({ efforts, units }: { efforts: BestEffort[]; units: Units }) {
  return (
    <ul className="efforts">
      {efforts.map((effort) => (
        <li key={effort.distanceMetres} className="effort">
          <span className="effort-name">{effort.name}</span>
          <span className="mono effort-time">{formatDuration(effort.seconds)}</span>
          <span className="mono effort-pace">
            {effort.previousBestSeconds != null && effort.standing !== 'PersonalBest'
              ? `best ${formatDuration(effort.previousBestSeconds)}`
              : formatPace(effort.paceSecondsPerKm, units)}
          </span>
          {STANDING_TAG[effort.standing] ? (
            <span className={effort.standing === 'PersonalBest' ? 'tag tag-pb' : 'tag tag-near'}>{STANDING_TAG[effort.standing]}</span>
          ) : (
            <span />
          )}
        </li>
      ))}
    </ul>
  )
}
