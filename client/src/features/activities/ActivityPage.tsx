import { WorkoutStages } from './WorkoutStages'
import { PaceProfile } from './PaceProfile'
import { RunSummaryHero, PlanExecutionCard, PaceSplitsVisual } from './RunAnalysis/RunAnalysisHighlights'
import './activity-page.css'
import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate, formatDuration, formatPace, formatShortDay, type Units } from '../../lib/format'
import type { Activity, BestEffort, HeartRate } from '../../lib/types'
import { RunSticker } from '../sharing/RunSticker'
import { ShoePicker } from './ShoePicker'
import { PoweredByStrava, ViewOnStrava } from '../sync/StravaBrand'
import { halvesSummary, KIND_LABEL } from './activity-copy'

const FORMAT_LABEL = { Fit: 'a FIT file', Gpx: 'a GPX file', Tcx: 'a TCX file' } as const

type LoadState = { kind: 'loading' } | { kind: 'ready'; activity: Activity; checkedAt: number } | { kind: 'error'; message: string }

interface Props {
  id: string
  /** The run as the upload returned it, so a fresh upload opens without a second request. */
  initial?: Activity
  units: Units
  backLabel?: string
  onBack: () => void
  onDeleted: () => void
  /** Opens Account, where the runner can add a max heart rate for zones. */
  onOpenAccount?: () => void
  /** Opens the day this run matched in the runner's own plan. */
  onOpenPlanDay?: (date: string) => void
}

/**
 * One run on a single scroll: the numbers, how it went against the plan, its splits and pace, the workout's parts, any
 * bests, the shoe and a sticker to share, then removing it.
 */
export function ActivityPage({ id, initial, units, onBack, backLabel, onDeleted, onOpenAccount, onOpenPlanDay }: Props) {
  const auth = useAuth()
  const [state, setState] = useState<LoadState>(() => (initial?.id === id ? { kind: 'ready', activity: initial, checkedAt: Date.now() } : { kind: 'loading' }))
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
      .then((activity) => !cancelled && setState({ kind: 'ready', activity, checkedAt: Date.now() }))
      .catch((error: unknown) => !cancelled && setState({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' }))
    return () => {
      cancelled = true
    }
  }, [auth, id, initial, attempt])

  useEffect(() => {
    if (state.kind !== 'ready' || state.activity.source.kind !== 'Strava' || !state.activity.source.cachedUntil) return
    const remaining = Date.parse(state.activity.source.cachedUntil) - Date.now()
    if (!Number.isFinite(remaining)) return
    const timer = window.setTimeout(() => setState({ kind: 'error', message: 'This Strava recording has expired. Refresh to check whether a current copy is available.' }), Math.max(0, Math.min(remaining, 2147483647)))
    return () => window.clearTimeout(timer)
  }, [state])

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
      ← {backLabel ?? 'All runs'}
    </button>
  )

  if (state.kind === 'ready' && state.activity.source.kind === 'Strava' && state.activity.source.cachedUntil && Date.parse(state.activity.source.cachedUntil) <= state.checkedAt) {
    return <section>{back}<p role="status">This Strava recording has expired. Reload to check whether a current copy is available.</p><button type="button" className="button button-quiet" onClick={() => { setState({ kind: 'loading' }); setAttempt(n => n + 1) }}>Refresh recording</button></section>
  }

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
  const execution = run.source.kind === 'Strava' && (!run.source.cachedUntil || !Number.isFinite(Date.parse(run.source.cachedUntil))) ? null : run.workoutExecution
  const title = run.plan?.title ?? KIND_LABEL[run.kind]
  const halves = run.splits.length > 0 ? halvesSummary(run.halves, units) : ''

  return (
    <article className="activity" aria-labelledby="activity-title">
      {back}
      <p className="plan-kicker" style={{ marginTop: 'var(--space-4)' }}>
        Run analysis · {formatDate(run.localDate, 'long')} · {KIND_LABEL[run.kind]}
      </p>
      <h2 className="plan-title" id="activity-title">
        {title}
      </h2>
      {run.source.kind === 'Strava' ? (
        <p className="activity-source">
          <span>From Strava{run.source.recordedOnGarmin ? ' · recorded on Garmin' : ''} · kept for 7 days</span>
          {run.source.viewUrl && <ViewOnStrava href={run.source.viewUrl} />}
          <PoweredByStrava />
        </p>
      ) : (
        <p className="activity-source">
          Uploaded from {run.source.format ? FORMAT_LABEL[run.source.format] : 'a file'}
          {run.source.addedAt ? ` · ${formatShortDay(run.source.addedAt)}` : ''}
        </p>
      )}
      <RunSummaryHero run={run} units={units} />
      <PlanExecutionCard run={run} units={units} onOpenPlanDay={onOpenPlanDay} />
      {run.splits.length > 0 ? <>
        <PaceSplitsVisual splits={run.splits} units={units} />
        <p className="field-help">{halves} Splits show the pace you recorded, not whether each rep was done.</p>
        <PaceProfile splits={run.splits} plan={run.plan} units={units} />
      </> : <p className="field-help">This recording has no kilometre splits.</p>}
      {run.heartRate && <HeartRateSection heartRate={run.heartRate} onOpenAccount={onOpenAccount} />}
      {execution && <>
        <WorkoutStages execution={execution} units={units} />
        <p className="field-help">A guide from your recording: your check-in is what counts.</p>
      </>}
      {run.bestEfforts.length > 0 && <BestEfforts efforts={run.bestEfforts} units={units} />}
      <ShoePicker run={run} />
      <div className="activity-share-action"><RunSticker units={units} run={{ date: run.localDate, title: KIND_LABEL[run.kind], distanceKm: run.distanceKm, seconds: run.movingSeconds, source: run.source.kind }} /></div>
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

function HeartRateSection({ heartRate, onOpenAccount }: { heartRate: HeartRate; onOpenAccount?: () => void }) {
  const zones = heartRate.zones
  const total = zones?.reduce((sum, z) => sum + z.seconds, 0) ?? 0
  return (
    <section className="section" aria-labelledby="hr-title">
      <h3 id="hr-title">Heart rate</h3>
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
