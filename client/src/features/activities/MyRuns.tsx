import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import { formatDate, formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'
import type { Activity, ActivitySummary } from '../../lib/types'
import { KIND_LABEL } from './activity-copy'

type ListState = { kind: 'loading' } | { kind: 'ready'; runs: ActivitySummary[] } | { kind: 'error'; message: string }

interface Props {
  units: Units
  onOpen: (id: string, uploaded?: Activity) => void
}

/** Upload a run from a Garmin watch, and every run uploaded so far, newest first. */
export function MyRuns({ units, onOpen }: Props) {
  const auth = useAuth()
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
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

  const upload = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      const run = await api.me.uploadActivity(token, file)
      onOpen(run.id, run)
    } catch (error) {
      const fileProblem = error instanceof ApiError ? error.fieldErrors.file?.[0] : undefined
      setUploadError(fileProblem ?? (error instanceof Error ? error.message : 'That upload didn’t work. Try again.'))
      setUploading(false)
    } finally {
      // The same file can be picked again after fixing whatever went wrong.
      if (input.current) input.current.value = ''
    }
  }

  return (
    <section className="section" aria-labelledby="my-runs-title" style={{ marginTop: 0 }}>
      <h2 className="plan-title" id="my-runs-title">
        My runs
      </h2>

      <div className="panel upload">
        <h3>Add a run from your Garmin</h3>
        <ol className="upload-steps">
          <li>
            On the Garmin Connect <strong>website</strong>, open the run.
          </li>
          <li>
            Click the cog at the top right and choose <strong>Export Original</strong>.
          </li>
          <li>Upload the .zip it downloads (or the .fit inside it) here.</li>
        </ol>
        <label className={uploading ? 'button button-primary is-busy' : 'button button-primary'}>
          {uploading ? 'Reading your run…' : 'Upload a run'}
          <input
            ref={input}
            className="visually-hidden"
            type="file"
            accept=".fit,.zip"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
        </label>
        {uploadError && (
          <p className="field-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
            {uploadError}
          </p>
        )}
        <p className="field-help" style={{ marginTop: 'var(--space-3)' }}>
          We read the file and throw it away. Taperday keeps the totals, splits and best efforts, never your route.
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
