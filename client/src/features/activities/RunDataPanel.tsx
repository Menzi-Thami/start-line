import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate, formatDistance, formatShortDay as shortDay, type Units } from '../../lib/format'
import type { ActivitySummary, PossibleDuplicate, RunData, TotalsBreakdown } from '../../lib/types'

type State = { kind: 'loading' } | { kind: 'ready'; data: RunData } | { kind: 'error'; message: string }

interface Props {
  units: Units
  onOpen: (id: string) => void
  /** Called after runs are deleted, so the list above refreshes. */
  onChanged: () => void
  /** Changes when the runs list reloads, so this panel reloads with it. */
  refreshKey?: number
}

const SOURCE_LABEL = { Upload: 'Upload', Strava: 'Strava' } as const

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

/** What makes up a total: every kilometre traced to where it came from, and runs that counted with no distance. */
function Breakdown({ totals, units }: { totals: TotalsBreakdown; units: Units }) {
  const label = totals.period === 'week' ? 'This week' : 'This month'
  const rows = [
    { name: 'Checked in by you', km: totals.tickedKm, runs: totals.tickedRuns },
    { name: 'Uploaded files', km: totals.uploadedKm, runs: totals.uploadedRuns },
    { name: 'From Strava', km: totals.stravaKm, runs: totals.stravaRuns },
  ].filter((row) => row.runs > 0)
  return (
    <div className="run-data-total">
      <p className="run-data-total-head">
        <strong>{label}</strong> <span className="mono">{formatDistance(totals.totalKm, units)}</span> from {plural(totals.runs, 'run')}
      </p>
      {rows.length > 0 && (
        <table className="run-data-table">
          <caption className="visually-hidden">{label}: where the total comes from</caption>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td className="mono">{formatDistance(row.km, units)}</td>
                <td>{plural(row.runs, 'run')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {totals.withoutDistance > 0 && (
        <p className="field-help">{plural(totals.withoutDistance, 'run')} counted without a distance: ticked off with no distance and no linked run.</p>
      )}
    </div>
  )
}

function RunLine({ run, units, onOpen }: { run: ActivitySummary; units: Units; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="link-button run-data-run" onClick={() => onOpen(run.id)}>
      {formatDate(run.localDate, 'short')} · <span className="mono">{formatDistance(run.distanceKm, units)}</span> · {SOURCE_LABEL[run.source.kind]}
      {run.source.fileName ? ` · ${run.source.fileName}` : ''}
    </button>
  )
}

/**
 * The runner's run data, made inspectable: where each total comes from, which sources feed it, runs that may be
 * duplicates (resolved by the runner, never automatically), measurements that are missing and why, runs that didn't
 * sync (with a retry), and a CSV download. Collapsed by default: the runs list stays first.
 */
export function RunDataPanel({ units, onOpen, onChanged, refreshKey }: Props) {
  const auth = useAuth()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  // A problem loading is only announced once the runner opens the panel to look.
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.runData(token) : Promise.reject(new Error('Sign in to see your run data.'))))
      .then((data) => !cancelled && setState({ kind: 'ready', data }))
      .catch((error: unknown) => !cancelled && setState({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' }))
    return () => {
      cancelled = true
    }
  }, [auth])

  useEffect(() => load(), [load, refreshKey])

  // Each action shows its own outcome in words, then reloads what it changed.
  const act = async (key: string, work: (token: string) => Promise<string>, after?: () => void) => {
    setBusy(key)
    setMessage(null)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Sign in again to carry on.')
      setMessage({ text: await work(token) })
      after?.()
      load()
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'That didn’t work. Try again.', error: true })
    } finally {
      setBusy(null)
    }
  }

  const deleteRun = (run: ActivitySummary) =>
    act(`delete-${run.id}`, async (token) => {
      await api.me.deleteActivities(token, [run.id])
      return `Deleted the ${formatDate(run.localDate, 'short')} run.`
    }, onChanged)

  const keepBoth = (pair: PossibleDuplicate) =>
    act(`keep-${pair.first.id}`, async (token) => {
      await api.me.keepBothRuns(token, pair.first.id, pair.second.id)
      return 'Kept both. Taperday won’t ask about these two again.'
    })

  const retry = () =>
    act('retry', async (token) => {
      const { retried } = await api.me.retryStrava(token)
      return retried > 0 ? `Trying ${plural(retried, 'run')} from Strava again.` : 'Nothing to retry.'
    })

  const download = () =>
    act('export', async (token) => {
      const blob = await api.me.exportRuns(token)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'taperday-runs.csv'
      link.click()
      URL.revokeObjectURL(url)
      return 'Your runs are downloading as a CSV file.'
    })

  const data = state.kind === 'ready' ? state.data : null
  const failed = data?.syncIssues.filter((issue) => !issue.skipped) ?? []
  const attention = (data?.possibleDuplicates.length ?? 0) + failed.length

  return (
    <details className="disclosure run-data" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        Your run data
        {attention > 0 && <span className="field-error"> · {plural(attention, 'thing')} to check</span>}
      </summary>

      {state.kind === 'loading' && <p className="field-help" role="status">Checking your runs…</p>}
      {state.kind === 'error' && (
        <div className="error-panel" role={open ? 'alert' : undefined}>
          <p>{state.message}</p>
          <button type="button" className="button button-quiet" onClick={() => { setState({ kind: 'loading' }); load() }}>
            Try again
          </button>
        </div>
      )}

      {data && (
        <>
          <section className="run-data-section" aria-labelledby="run-data-totals">
            <h3 id="run-data-totals">What your totals are made of</h3>
            {data.totals.map((totals) => (
              <Breakdown key={totals.period} totals={totals} units={units} />
            ))}
            <p className="field-help">A day with a run from a file or Strava counts that run, not the session you ticked, so nothing is counted twice.</p>
          </section>

          <section className="run-data-section" aria-labelledby="run-data-sources">
            <h3 id="run-data-sources">Sources</h3>
            <ul className="run-data-list">
              <li>
                {plural(data.sources.uploads, 'uploaded run')}
                {data.sources.uploads > 0 && (
                  <span className="field-help">
                    {' '}({[['FIT', data.sources.fit], ['GPX', data.sources.gpx], ['TCX', data.sources.tcx], ['earlier uploads', data.sources.unknownFormat]]
                      .filter(([, n]) => Number(n) > 0)
                      .map(([name, n]) => `${n} ${name}`)
                      .join(', ')})
                  </span>
                )}
                . Kept until you delete them.
              </li>
              <li>
                {data.sources.stravaConnected ? (
                  <>
                    Strava {data.sources.stravaStatus === 'NeedsReconnect' ? <strong>needs connecting again</strong> : 'connected'}
                    {data.sources.lastSyncedAt ? `, last synced ${shortDay(data.sources.lastSyncedAt)}` : ''}. {plural(data.sources.strava, 'run')} held
                    for up to 7 days at a time{data.sources.stravaPending > 0 ? `, ${data.sources.stravaPending} still arriving` : ''}.
                  </>
                ) : (
                  'Strava isn’t connected.'
                )}
              </li>
            </ul>
          </section>

          {data.syncIssues.length > 0 && (
            <section className="run-data-section" aria-labelledby="run-data-sync">
              <h3 id="run-data-sync">Runs from Strava that didn’t arrive</h3>
              <ul className="run-data-list">
                {data.syncIssues.map((issue) => (
                  <li key={issue.stravaActivityId}>
                    <a href={`https://www.strava.com/activities/${issue.stravaActivityId}`} target="_blank" rel="noreferrer">
                      Strava run, {shortDay(issue.at)}
                    </a>
                    : {issue.skipped ? issue.reason : `couldn’t be fetched (${issue.reason}).`}
                  </li>
                ))}
              </ul>
              {failed.length > 0 && (
                <button type="button" className="button button-quiet" disabled={busy === 'retry'} onClick={retry}>
                  {busy === 'retry' ? 'Retrying…' : `Try ${failed.length === 1 ? 'it' : 'them'} again`}
                </button>
              )}
            </section>
          )}

          {data.possibleDuplicates.length > 0 && (
            <section className="run-data-section" aria-labelledby="run-data-duplicates">
              <h3 id="run-data-duplicates">Possible duplicates</h3>
              <p className="field-help">These runs overlap in time. Delete the copy you don’t want, or keep both if they’re different runs.</p>
              <ul className="run-data-pairs">
                {data.possibleDuplicates.map((pair) => (
                  <li key={`${pair.first.id}-${pair.second.id}`} className="run-data-pair">
                    <p className="run-data-pair-kind">{pair.relation === 'SameRun' ? 'Looks like the same run twice' : 'Overlapping runs'}</p>
                    {[pair.first, pair.second].map((run) => (
                      <div key={run.id} className="run-data-pair-run">
                        <RunLine run={run} units={units} onOpen={onOpen} />
                        <button type="button" className="button button-quiet" disabled={busy !== null} onClick={() => deleteRun(run)}>
                          {busy === `delete-${run.id}` ? 'Deleting…' : 'Delete this one'}
                        </button>
                      </div>
                    ))}
                    <button type="button" className="link-button" disabled={busy !== null} onClick={() => keepBoth(pair)}>
                      Keep both
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="run-data-section" aria-labelledby="run-data-missing">
            <h3 id="run-data-missing">Missing measurements</h3>
            {data.missing.runs === 0 ? (
              <p className="field-help">No runs yet.</p>
            ) : (
              <ul className="run-data-list">
                <li>
                  {data.missing.withoutHeartRate} of {data.missing.runs} without heart rate
                  {!data.missing.heartRateConsent && data.missing.withoutHeartRate > 0 ? ': you haven’t allowed Taperday to keep heart rate.' : '.'}
                </li>
                <li>{data.missing.withoutElevation} of {data.missing.runs} without elevation.</li>
                <li>{data.missing.withoutSplits} of {data.missing.runs} without kilometre splits.</li>
              </ul>
            )}
          </section>

          <section className="run-data-section" aria-labelledby="run-data-export">
            <h3 id="run-data-export">Your data</h3>
            <p className="field-help">A spreadsheet of every run you can see here, with where each came from.</p>
            <button type="button" className="button button-quiet" disabled={busy === 'export'} onClick={download}>
              {busy === 'export' ? 'Preparing…' : 'Download runs (CSV)'}
            </button>
          </section>
        </>
      )}

      {message && (
        <p className={message.error ? 'field-error' : 'field-help'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </details>
  )
}
