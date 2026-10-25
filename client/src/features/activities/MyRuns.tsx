import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { emptyProgress, uploadAll, type BulkProgress, type BulkResult } from '../../lib/bulk-upload'
import { formatDate, formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'
import type { Activity, ActivitySummary } from '../../lib/types'
import { KIND_LABEL } from './activity-copy'
import { BulkSummary } from './BulkSummary'

type ListState = { kind: 'loading' } | { kind: 'ready'; runs: ActivitySummary[] } | { kind: 'error'; message: string }

interface Props {
  units: Units
  onOpen: (id: string, uploaded?: Activity) => void
}

/** Upload runs from a Garmin watch (one, a few, or a whole account export), and every run uploaded so far, newest first. */
export function MyRuns({ units, onOpen }: Props) {
  const auth = useAuth()
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [bulk, setBulk] = useState<{ running: boolean; progress: BulkProgress; result: BulkResult | null; error: string | null } | null>(null)
  const [singleError, setSingleError] = useState<string | null>(null)
  const stop = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // Only sets state when the request settles; callers set the loading state themselves.
  const fetchRuns = useCallback(() => {
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.activities(token) : Promise.reject(new Error('Sign in to see your runs.'))))
      .then((runs) => !cancelled && setList({ kind: 'ready', runs }))
      .catch((error: unknown) => !cancelled && setList({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' }))
    return () => {
      cancelled = true
    }
  }, [auth])

  useEffect(() => fetchRuns(), [fetchRuns])

  const upload = async (files: File[]) => {
    const controller = new AbortController()
    stop.current = controller
    setSingleError(null)
    setBulk({ running: true, progress: emptyProgress(), result: null, error: null })
    try {
      const result = await uploadAll(files, {
        getToken: auth.getToken,
        signal: controller.signal,
        onProgress: (progress) => setBulk((current) => current && { ...current, progress }),
      })
      // One file picked and one run found: behave like a single upload, straight to the run or straight to the problem.
      const only = result.outcomes.length === 1 ? result.outcomes[0] : undefined
      if (files.length === 1 && only) {
        if (only.status === 'Imported' && only.activityId) {
          onOpen(only.activityId)
          return
        }
        if (only.status !== 'AlreadyUploaded') {
          setBulk(null)
          setSingleError(only.message ?? 'That file couldn’t be added.')
          return
        }
      }
      setBulk((current) => ({ running: false, progress: current?.progress ?? emptyProgress(), result, error: null }))
    } catch (error) {
      setBulk((current) => ({
        running: false,
        progress: current?.progress ?? emptyProgress(),
        result: null,
        error: error instanceof Error ? error.message : 'That upload didn’t work. Try again.',
      }))
    } finally {
      // The same files can be picked again after fixing whatever went wrong.
      if (input.current) input.current.value = ''
      fetchRuns()
    }
  }

  const running = bulk?.running ?? false

  return (
    <section className="section" aria-labelledby="my-runs-title" style={{ marginTop: 0 }}>
      <h2 className="plan-title" id="my-runs-title">
        My runs
      </h2>

      <div className="panel upload">
        <h3>Add runs from a file</h3>
        <p className="field-help">Taperday reads <strong>.fit</strong>, <strong>.gpx</strong> and <strong>.tcx</strong> files, and the zips they come in. Most watches and apps export one of these.</p>
        <div className="upload-ways">
          <div>
            <p className="upload-way">Garmin</p>
            <p className="field-help">
              On the Garmin Connect <strong>website</strong>, open the run and choose <strong>Export Original</strong> (one run), or, for your whole
              history, <strong>Data Management → Export Your Data</strong> and upload the zip Garmin emails you.
            </p>
          </div>
          <div>
            <p className="upload-way">Strava, COROS, Suunto, Polar, Apple</p>
            <p className="field-help">
              Export the run (a .fit, .gpx or .tcx) and upload it.
            </p>
          </div>
        </div>
        <label className={running ? 'button button-primary is-busy' : 'button button-primary'}>
          {running ? 'Reading your files…' : 'Upload runs'}
          <input
            ref={input}
            className="visually-hidden"
            type="file"
            accept=".fit,.gpx,.tcx,.zip"
            multiple
            disabled={running}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])]
              if (files.length > 0) void upload(files)
            }}
          />
        </label>
        {singleError && (
          <p className="field-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
            {singleError}
          </p>
        )}
        {bulk && <BulkSummary running={bulk.running} progress={bulk.progress} result={bulk.result} error={bulk.error} onStop={() => stop.current?.abort()} />}
        <p className="field-help" style={{ marginTop: 'var(--space-3)' }}>
          Runs already added are skipped. Your route is never kept.
        </p>
      </div>

      {list.kind === 'loading' && (
        <div className="choice-list" aria-busy="true" style={{ marginTop: 'var(--space-5)' }}>
          {[0, 1].map((i) => (
            <div className="skeleton" key={i} aria-hidden="true" />
          ))}
          <span className="visually-hidden">Loading your runs…</span>
        </div>
      )}

      {list.kind === 'error' && (
        <div className="error-panel" role="alert" style={{ marginTop: 'var(--space-5)' }}>
          <strong>We couldn’t load your runs.</strong>
          <p>{list.message}</p>
          <button
            type="button"
            className="button button-quiet"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={() => {
              setList({ kind: 'loading' })
              fetchRuns()
            }}
          >
            Try again
          </button>
        </div>
      )}

      {list.kind === 'ready' && list.runs.length === 0 && (
        <div className="empty" style={{ marginTop: 'var(--space-5)' }}>
          <p>No runs yet. Upload one and you’ll see your splits, best efforts and how it matched your plan.</p>
        </div>
      )}

      {list.kind === 'ready' && list.runs.length > 0 && (
        <ul className="weeks runs" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-5)' }}>
          {list.runs.map((run) => (
            <li className="week saved-plan" key={run.id}>
              <div>
                <span className="week-name">{run.plannedTitle ?? KIND_LABEL[run.kind]}</span>
                {run.source.kind === 'Strava' && <span className="tag">From Strava</span>}
                <br />
                <span className="week-meta mono">
                  {formatDate(run.localDate, 'short')} · {formatDistance(run.distanceKm, units)} · {formatDuration(run.movingSeconds)} ·{' '}
                  {formatPace(run.paceSecondsPerKm, units)}
                </span>
              </div>
              <div className="saved-plan-actions">
                <button
                  type="button"
                  className="button"
                  aria-label={`Open the run on ${formatDate(run.localDate, 'long')}`}
                  onClick={() => onOpen(run.id)}
                >
                  Open
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
