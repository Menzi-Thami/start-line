import './run-cards.css'
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { ScreenRecovery } from '../../app/ScreenRecovery'
import { useSyncedRuns } from '../sync/useSyncedRuns'
import { emptyProgress, uploadAll, type BulkProgress, type BulkResult } from '../../lib/bulk-upload'
import { formatDate, formatDistance, formatDuration, formatPace, localToday, type Units } from '../../lib/format'
import type { Activity, ActivitySummary } from '../../lib/types'
import { KIND_LABEL } from './activity-copy'
import { BulkSummary } from './BulkSummary'
import { ExportGuide } from './ExportGuide'
import { PhoneRunGuide } from './PhoneRunGuide'
import { RunImportStatus } from './RunImportStatus'
import { RunningTotals } from './RunningTotals'

const MilestoneCards = lazy(() => import('../milestones/MilestoneCards').then((module) => ({ default: module.MilestoneCards })))
const Calculators = lazy(() => import('../runner-home/Calculators').then((module) => ({ default: module.Calculators })))

type ListState = { kind: 'loading' } | { kind: 'ready'; runs: ActivitySummary[] } | { kind: 'error'; message: string }

interface Props {
  units: Units
  onOpen: (id: string, uploaded?: Activity) => void
  /** The run open beside the list on a desktop, marked in the list. */
  selectedId?: string
  onOpenConnections: () => void
  onOpenPlan?: () => void
  /** Whether Add runs is open, kept by the app so it stays open when the phone and desktop layouts swap. */
  addRuns?: { open: boolean; onChange: (open: boolean) => void }
  /** For the running totals (a cache key) and the calculators. */
  runnerId?: string
  today?: string
  maxHeartRate?: number | null
  race?: { distanceKm: number; goalSeconds: number } | null
}

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

/** The Runs page's own address: the page itself, or the page a run was opened from (kept in returnTo). */
function runsParams(): URLSearchParams {
  const query = new URLSearchParams(window.location.search)
  const origin = new URLSearchParams(query.get('returnTo')?.replace(/^\?/, '') ?? '')
  return query.has('run') && origin.get('view') === 'runs' ? origin : query
}

function filtersFromUrl(): { range: Range; source: Source } {
  const params = runsParams()
  const range = params.get('range'), source = params.get('source')
  return { range: range === 'week' || range === 'month' ? range : 'all', source: source === 'Strava' || source === 'Upload' ? source : 'any' }
}

/** Imported recordings, newest first: one Add runs button, the totals, then the list. */
export function MyRuns({ units, onOpen, selectedId, onOpenConnections, onOpenPlan, addRuns, runnerId, today, maxHeartRate = null, race = null }: Props) {
  const ids = useId()
  const [localAddOpen, setLocalAddOpen] = useState(false)
  const addOpen = addRuns?.open ?? localAddOpen
  const setAddOpen = addRuns?.onChange ?? setLocalAddOpen
  const auth = useAuth()
  const imports = useSyncedRuns(true, false)
  const list: ListState = imports.runs ? { kind: 'ready', runs: imports.runs }
    : imports.error ? { kind: 'error', message: imports.error } : { kind: 'loading' }
  const fetchRuns = imports.reload
  const [range, setRange] = useState<Range>(() => filtersFromUrl().range)
  const [source, setSource] = useState<Source>(() => filtersFromUrl().source)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(() => runsParams().get('tab') === 'tools')
  // Calculator drafts stay mounted once opened, so closing the tools keeps what was typed.
  const [toolsOpened, setToolsOpened] = useState(toolsOpen)
  const toolsRef = useRef<HTMLDetailsElement>(null)
  const [shareOpened, setShareOpened] = useState(false)
  useEffect(() => {
    const restore = () => { const filters = filtersFromUrl(); setRange(filters.range); setSource(filters.source) }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  useEffect(() => {
    // An old "Running tools" link lands here with the calculators open and in view.
    if (runsParams().get('tab') === 'tools') toolsRef.current?.scrollIntoView?.({ block: 'start' })
  }, [])
  const changeParam = (key: 'range' | 'source' | 'tab', value: string | null) => {
    const params = new URLSearchParams(window.location.search)
    if (value === null || value === 'all' || value === 'any') params.delete(key)
    else params.set(key, value)
    if (params.has('run')) {
      // A run is open beside the list: Back from it returns to the list as it is now.
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
  const shown = list.kind === 'ready' ? fromSource(inRange(list.runs, range), source) : []
  const bothSources = list.kind === 'ready' && list.runs.some((r) => r.source.kind === 'Strava') && list.runs.some((r) => r.source.kind !== 'Strava')
  const activeFilters = [range !== 'all' ? RANGES.find(r => r.id === range)!.label : null, source !== 'any' ? SOURCES.find(s => s.id === source)!.label : null].filter(Boolean)

  return (
    <section className="section" aria-labelledby="my-runs-title" style={{ marginTop: 0 }}>
      <h2 className="plan-title" id="my-runs-title">
        Runs
      </h2>

      <RunImportStatus show="problems" status={imports.strava} error={imports.syncError} busy={imports.syncing} onCheck={() => void imports.refresh()} onConnect={onOpenConnections} />
      <div className="runs-add">
        <button type="button" className="button button-primary" aria-expanded={addOpen} aria-controls={`${ids}-add`} onClick={() => setAddOpen(!addOpen)}>
          Add runs
        </button>
        {!addOpen && running && <span className="field-help" role="status">Importing…</span>}
        {!addOpen && !running && (singleError || bulk?.error) && <span className="field-error">An upload needs attention.</span>}
      </div>
      <div id={`${ids}-add`} className="add-runs-sheet" role="region" aria-label="Add runs" hidden={!addOpen}>
        <section className="add-runs-part phone-runs" aria-labelledby={`${ids}-sync`}>
          <h3 id={`${ids}-sync`}>Sync from your phone or watch</h3>
          <RunImportStatus show="quiet" status={imports.strava} error={imports.syncError} busy={imports.syncing} onCheck={() => void imports.refresh()} onConnect={onOpenConnections} />
          <PhoneRunGuide onOpenConnections={onOpenConnections} onOpenPlan={onOpenPlan} />
        </section>
        <section className="add-runs-part upload" aria-labelledby={`${ids}-file`}>
          <h3 id={`${ids}-file`}>Upload a file</h3>
          <p className="field-help">Taperday reads <strong>.fit</strong>, <strong>.gpx</strong> and <strong>.tcx</strong> files, and the zips they come in. Runs you add this way stay on Taperday for good.</p>
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
          <details className="disclosure export-help"><summary>How to get a file from your watch or app</summary>
            <ExportGuide />
          </details>
        </section>
      </div>

      {runnerId && list.kind === 'ready' && list.runs.length > 0 && <RunningTotals ownerId={runnerId} units={units} today={today ?? localToday()} runs={list.runs} />}

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
          <p><strong>No recordings yet.</strong> Use Add runs to bring in runs from Strava or a file.</p>
        </div>
      )}

      {list.kind === 'ready' && list.runs.length > 0 && (
        <div className="run-filter-rows">
          <button type="button" className="chip-button run-filter-toggle" aria-expanded={filtersOpen} aria-controls={`${ids}-filters`} onClick={() => setFiltersOpen(open => !open)}>
            Filter{activeFilters.length > 0 && `: ${activeFilters.join(', ')}`}
          </button>
          <div id={`${ids}-filters`} hidden={!filtersOpen}>
            <div className="run-filters" role="group" aria-label="Show runs from">
              {RANGES.map((r) => (
                <button key={r.id} type="button" className="chip-button" aria-pressed={range === r.id} onClick={() => { setRange(r.id); changeParam('range', r.id) }}>
                  {r.label}
                </button>
              ))}
            </div>
            {bothSources && (
              <div className="run-filters" role="group" aria-label="Show runs by source">
                {SOURCES.map((option) => (
                  <button key={option.id} type="button" className="chip-button" aria-pressed={source === option.id} onClick={() => { setSource(option.id); changeParam('source', option.id) }}>
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {list.kind === 'ready' && list.runs.length > 0 && shown.length === 0 && (
        <p className="field-help" style={{ marginTop: 'var(--space-4)' }}>
          {['No runs', source === 'Strava' ? 'from Strava' : source === 'Upload' ? 'uploaded' : '', range === 'week' ? 'this week' : range === 'month' ? 'in the last 30 days' : '', 'yet.'].filter(Boolean).join(' ')}
        </p>
      )}

      {list.kind === 'ready' && list.runs.length > 0 && (
        <ul className="weeks runs" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--space-4)' }}>
          {shown.map((run) => (
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

      {list.kind === 'ready' && list.runs.length > 0 && <details className="disclosure runs-share" onToggle={event => { if (event.currentTarget.open) setShareOpened(true) }}>
        <summary>Share a milestone</summary>
        {shareOpened && <ScreenRecovery><Suspense fallback={<p className="field-help" role="status">Preparing your milestones…</p>}><MilestoneCards runs={list.runs} /></Suspense></ScreenRecovery>}
      </details>}
      <details ref={toolsRef} className="disclosure runs-tools" open={toolsOpen} onToggle={event => {
        const open = event.currentTarget.open
        if (open === toolsOpen) return
        setToolsOpen(open)
        if (open) setToolsOpened(true)
        changeParam('tab', open ? 'tools' : null)
      }}><summary>Running tools <span className="field-help">Pace, race time & heart rate</span></summary>
        {toolsOpened && (
          <ScreenRecovery>
            <Suspense fallback={<div className="panel skeleton-stack" role="status" aria-label="Loading running tools"><span className="skeleton-line skeleton-line-wide" /><span className="skeleton-line" /></div>}>
              <Calculators units={units} maxHeartRate={maxHeartRate} race={race} />
            </Suspense>
          </ScreenRecovery>
        )}
      </details>
    </section>
  )
}
