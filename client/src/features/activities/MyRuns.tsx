import './run-cards.css'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { useSyncedRuns } from '../sync/useSyncedRuns'
import { emptyProgress, uploadAll, type BulkProgress, type BulkResult } from '../../lib/bulk-upload'
import { formatDate, formatDistance, formatDuration, formatPace, localToday, type Units } from '../../lib/format'
import type { Activity, ActivitySummary } from '../../lib/types'
import { KIND_LABEL } from './activity-copy'
import { BulkSummary } from './BulkSummary'
import { ExportGuide } from './ExportGuide'
import { RunDataPanel } from './RunDataPanel'
import { PhoneRunGuide } from './PhoneRunGuide'
import { RunImportStatus } from './RunImportStatus'

type ListState = { kind: 'loading' } | { kind: 'ready'; runs: ActivitySummary[] } | { kind: 'error'; message: string }

interface Props {
  units: Units
  onOpen: (id: string, uploaded?: Activity) => void
  /** The run open beside the list on a desktop, marked in the list. */
  selectedId?: string
  onOpenConnections: () => void
  onOpenPlan?: () => void
  onOpenInsights?: (section: 'insights' | 'tools') => void
  phoneHelp?: { open: boolean; onChange: (open: boolean) => void }
}

/** Imported recordings, newest first, with phone sync and file upload options. */
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

type Source = 'any' | 'Strava' | 'Upload'

const SOURCES: readonly { id: Source; label: string }[] = [
  { id: 'any', label: 'All sources' },
  { id: 'Strava', label: 'Strava' },
  { id: 'Upload', label: 'Uploads' },
]

const fromSource = (runs: readonly ActivitySummary[], source: Source) =>
  source === 'any' ? runs : runs.filter((r) => (source === 'Strava' ? r.source.kind === 'Strava' : r.source.kind !== 'Strava'))

function filtersFromUrl(): { range: Range; source: Source } {
  const query = new URLSearchParams(window.location.search)
  const origin = new URLSearchParams(query.get('returnTo')?.replace(/^\?/, '') ?? '')
  const params = query.has('run') && origin.get('view') === 'runs' ? origin : query
  const range = params.get('range'), source = params.get('source')
  return { range: range === 'week' || range === 'month' ? range : 'all', source: source === 'Strava' || source === 'Upload' ? source : 'any' }
}

export function MyRuns({ units, onOpen, selectedId, onOpenConnections, onOpenPlan, onOpenInsights, phoneHelp }: Props) {
  const phoneRef = useRef<HTMLDetailsElement>(null)
  const [localPhoneOpen, setLocalPhoneOpen] = useState(false)
  const phoneOpen = phoneHelp?.open ?? localPhoneOpen
  const setPhoneOpen = phoneHelp?.onChange ?? setLocalPhoneOpen
  const auth = useAuth()
  const imports = useSyncedRuns(true, false)
  const list: ListState = imports.runs ? { kind: 'ready', runs: imports.runs }
    : imports.error ? { kind: 'error', message: imports.error } : { kind: 'loading' }
  const fetchRuns = imports.reload
  const [range, setRange] = useState<Range>(() => filtersFromUrl().range)
  const [source, setSource] = useState<Source>(() => filtersFromUrl().source)
  useEffect(() => {
    const restore = () => { const filters = filtersFromUrl(); setRange(filters.range); setSource(filters.source) }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  const changeFilter = (key: 'range' | 'source', value: string) => {
    const params = new URLSearchParams(window.location.search)
    if (value === 'all' || value === 'any') params.delete(key)
    else params.set(key, value)
    if (params.has('run')) {
      const origin = new URLSearchParams(params)
      origin.delete('run'); origin.delete('returnTo')
      params.set('returnTo', `?${origin}`)
    }
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params}`)
  }
  const [bulk, setBulk] = useState<{ running: boolean; progress: BulkProgress; result: BulkResult | null; error: string | null } | null>(null)
  const [singleError, setSingleError] = useState<string | null>(null)
  const stop = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)

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
      void fetchRuns()
    }
  }

  const running = bulk?.running ?? false
  const openPhoneHelp = () => {
    const guide = phoneRef.current
    if (!guide) return
    setPhoneOpen(true)
    guide.open = true
    guide.scrollIntoView?.({ block: 'start' })
    guide.querySelector('summary')?.focus()
  }

  return (
    <section className="section" aria-labelledby="my-runs-title" style={{ marginTop: 0 }}>
      <h2 className="plan-title" id="my-runs-title">
        Runs
      </h2>
      {onOpenInsights && <nav className="runs-detail-links" aria-label="Running tools and history">
        <button type="button" className="link-button" onClick={() => onOpenInsights('insights')}>Running insights</button>
        <button type="button" className="link-button" onClick={() => onOpenInsights('tools')}>Running tools</button>
      </nav>}

      <RunImportStatus status={imports.strava} error={imports.syncError} busy={imports.syncing} onCheck={() => void imports.refresh()} onConnect={onOpenConnections} />
      <details ref={phoneRef} className="disclosure phone-runs" open={phoneOpen} onToggle={event => setPhoneOpen(event.currentTarget.open)}><summary>Connect through Strava</summary>
        <PhoneRunGuide onOpenConnections={onOpenConnections} onOpenPlan={onOpenPlan} />
      </details>
      <details className="disclosure upload"><summary>Add runs from a file{running && <span role="status"> · Importing…</span>}{(singleError || bulk?.error) && <span className="field-error"> · Needs attention</span>}</summary>
        <p className="field-help">Taperday reads <strong>.fit</strong>, <strong>.gpx</strong> and <strong>.tcx</strong> files, and the zips they come in. Runs you add this way stay on Taperday for good. How to get the file:</p>
        <ExportGuide onPhoneHelp={openPhoneHelp} />
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

      <RunDataPanel units={units} refreshKey={imports.revision} />

      {list.kind === 'ready' && imports.error && <div className="error-panel" role="alert">
        <p>Your recordings could not refresh. Showing the recordings already loaded. {imports.error}</p>
        <button type="button" className="link-button" disabled={imports.loading} onClick={() => void fetchRuns()}>Retry recordings</button>
      </div>}

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
              void fetchRuns()
            }}
          >
            Try again
          </button>
        </div>
      )}

      {list.kind === 'ready' && list.runs.length === 0 && (
        <div className="empty" style={{ marginTop: 'var(--space-5)' }}>
          <p><strong>No recordings yet.</strong> Runs recorded on your phone or watch can sync through Strava. You can also upload a saved recording from a file.</p>
          <button type="button" className="button button-primary" style={{ marginTop: 'var(--space-3)' }} onClick={openPhoneHelp}>See my import options</button>
        </div>
      )}

      {list.kind === 'ready' && list.runs.length > 0 && (
        <div className="run-filter-rows">
          <div className="run-filters" role="group" aria-label="Show runs from">
            {RANGES.map((r) => (
              <button key={r.id} type="button" className="chip-button" aria-pressed={range === r.id} onClick={() => { setRange(r.id); changeFilter('range', r.id) }}>
                {r.label}
              </button>
            ))}
          </div>
          {list.runs.some((r) => r.source.kind === 'Strava') && list.runs.some((r) => r.source.kind !== 'Strava') && (
            <div className="run-filters" role="group" aria-label="Show runs by source">
              {SOURCES.map((option) => (
                <button key={option.id} type="button" className="chip-button" aria-pressed={source === option.id} onClick={() => { setSource(option.id); changeFilter('source', option.id) }}>
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {list.kind === 'ready' && list.runs.length > 0 && fromSource(inRange(list.runs, range), source).length === 0 && (
        <p className="field-help" style={{ marginTop: 'var(--space-4)' }}>
          {['No runs', source === 'Strava' ? 'from Strava' : source === 'Upload' ? 'uploaded' : '', range === 'week' ? 'this week' : range === 'month' ? 'in the last 30 days' : '', 'yet.'].filter(Boolean).join(' ')}
        </p>
      )}

      {list.kind === 'ready' && list.runs.length > 0 && (
        <ul className="weeks runs" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-4)' }}>
          {fromSource(inRange(list.runs, range), source).map((run) => (
            <li className="run-feed-row" key={run.id}>
              <button type="button" className="run-feed-open" aria-current={run.id === selectedId ? 'true' : undefined} onClick={() => onOpen(run.id)}><span>
                <span className="run-card-distance">{formatDistance(run.distanceKm, units)}</span>
                <span className="week-name">{run.plannedTitle ?? KIND_LABEL[run.kind]}</span>
                <span className="tag">{run.source.kind === 'Strava' ? 'From Strava' : 'Uploaded recording'}</span>
                <br />
                <span className="run-feed-match field-help">{run.plannedTitle ? `Matched to your plan: ${run.plannedTitle}` : 'Not matched to a planned session'}</span>
                <br />
                <span className="week-meta mono">
                  {formatDate(run.localDate, 'long')} · {formatDuration(run.movingSeconds)} ·{' '}
                  {formatPace(run.paceSecondsPerKm, units)}
                  {run.shoe ? ` · ${run.shoe.name}` : ''}
                </span>
              </span>
              <span className="run-card-action">Run analysis <span aria-hidden="true">→</span></span></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
