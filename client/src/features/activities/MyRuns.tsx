import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { emptyProgress, uploadAll, type BulkProgress, type BulkResult } from '../../lib/bulk-upload'
import { formatDate, formatDistance, formatDuration, formatPace, localToday, type Units } from '../../lib/format'
import type { Activity, ActivitySummary } from '../../lib/types'
import { KIND_LABEL } from './activity-copy'
import { BulkSummary } from './BulkSummary'
import { ExportGuide } from './ExportGuide'

type ListState = { kind: 'loading' } | { kind: 'ready'; runs: ActivitySummary[] } | { kind: 'error'; message: string }

interface Props {
  units: Units
  onOpen: (id: string, uploaded?: Activity) => void
  onOpenPlan?: () => void
}

/** Upload runs from a Garmin watch (one, a few, or a whole account export), and every run uploaded so far, newest first. */
type Range = 'all' | 'week' | 'month'

const RANGES: readonly { id: Range; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'Last 30 days' },
]

const daysBefore = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** The runs in a range, by each run's own date: this week is from Monday; the last 30 days include today. */
function inRange(runs: readonly ActivitySummary[], range: Range): readonly ActivitySummary[] {
  if (range === 'all') return runs
  const today = localToday()
  const day = new Date(`${today}T00:00:00Z`).getUTCDay()
  const from = range === 'week' ? daysBefore(today, (day + 6) % 7) : daysBefore(today, 29)
  return runs.filter((r) => r.localDate >= from && r.localDate <= today)
}

export function MyRuns({ units, onOpen, onOpenPlan }: Props) {
  const auth = useAuth()
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [range, setRange] = useState<Range>('all')
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
        Runs
      </h2>

      {onOpenPlan && <button type="button" className="link-button" onClick={onOpenPlan}>Your training log →</button>}

      <details className="disclosure upload"><summary>Add runs from a file{running && <span role="status"> · Importing…</span>}{(singleError || bulk?.error) && <span className="field-error"> · Needs attention</span>}</summary>
        <p className="field-help">Taperday reads <strong>.fit</strong>, <strong>.gpx</strong> and <strong>.tcx</strong> files, and the zips they come in. Runs you add this way stay on Taperday for good. How to get the file:</p>
        <ExportGuide />
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
      </details>

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
          <p>No imported runs yet. Upload a file to see splits, best efforts and how it matched your plan.</p>
        </div>
      )}

      {list.kind === 'ready' && list.runs.length > 0 && (
        <div className="run-filters" role="group" aria-label="Show runs from">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className="chip-button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      )}

      {list.kind === 'ready' && list.runs.length > 0 && inRange(list.runs, range).length === 0 && (
        <p className="field-help" style={{ marginTop: 'var(--space-4)' }}>
          No runs {range === 'week' ? 'this week' : 'in the last 30 days'} yet.
        </p>
      )}

      {list.kind === 'ready' && list.runs.length > 0 && (
        <ul className="weeks runs" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-4)' }}>
          {inRange(list.runs, range).map((run) => (
            <li className="run-feed-row" key={run.id}>
              <button type="button" className="run-feed-open" aria-label={`Open the run on ${formatDate(run.localDate, 'long')}`} onClick={() => onOpen(run.id)}><span>
                <span className="week-name">{run.plannedTitle ?? KIND_LABEL[run.kind]}</span>
                {run.source.kind === 'Strava' && <span className="tag">From Strava</span>}
                <br />
                <span className="week-meta mono">
                  {formatDate(run.localDate, 'short')} · {formatDistance(run.distanceKm, units)} · {formatDuration(run.movingSeconds)} ·{' '}
                  {formatPace(run.paceSecondsPerKm, units)}
                </span>
              </span>
              <span aria-hidden="true" className="run-feed-arrow">›</span></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
