import type { BulkProgress, BulkResult, FileOutcome } from '../../lib/bulk-upload'

const REASON: Partial<Record<FileOutcome['status'], string>> = {
  Skipped: 'Not a run',
  Unreadable: 'Couldn’t be read',
  TooBig: 'Too big (over 10 MB)',
  NotFit: 'Not a .fit or .zip file',
  BadZip: 'Damaged zip',
  LimitReached: 'Over the run limit',
  NotSent: 'Not sent',
}

/** The files worth a second look are listed; a long export can have hundreds, so only the first ones show. */
const LISTED = 50

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

function parts(progress: BulkProgress): string[] {
  return [
    progress.AlreadyUploaded > 0 && `${plural(progress.AlreadyUploaded, 'run')} already here`,
    progress.Skipped > 0 && `${plural(progress.Skipped, 'file')} that ${progress.Skipped === 1 ? 'wasn’t a run' : 'weren’t runs'}`,
    progress.Unreadable + progress.BadZip > 0 && `${plural(progress.Unreadable + progress.BadZip, 'file')} that couldn’t be read`,
    progress.TooBig > 0 && `${plural(progress.TooBig, 'file')} too big`,
    progress.NotFit > 0 && `${plural(progress.NotFit, 'file')} that ${progress.NotFit === 1 ? 'wasn’t' : 'weren’t'} .fit or .zip`,
  ].filter((part): part is string => Boolean(part))
}

const STOPPED: Record<NonNullable<BulkResult['stoppedBecause']>, string> = {
  limit: 'You’ve reached the 1,000-run limit, so the rest weren’t added. Delete old runs to make room.',
  'rate-limit': 'That’s a lot in a short time.',
  cancelled: 'Stopped.',
}

interface Props {
  running: boolean
  progress: BulkProgress
  result: BulkResult | null
  error: string | null
  onStop: () => void
}

/** Progress while files go up, then one plain summary and the files that need a look. */
export function BulkSummary({ running, progress, result, error, onStop }: Props) {
  if (running) {
    return (
      <div className="bulk-progress" aria-live="polite">
        <p>
          <strong>Reading your files…</strong> {plural(progress.Imported, 'run')} added so far.
        </p>
        <button type="button" className="button button-quiet" onClick={onStop}>
          Stop
        </button>
      </div>
    )
  }

  const found = result?.outcomes.length ?? 0
  const problems = (result?.outcomes ?? []).filter((o) => REASON[o.status])
  const tail = parts(progress)

  return (
    <div className="bulk-summary" role="status">
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : found === 0 ? (
        <p>No .fit files in that. For your whole history, upload the zip from Garmin’s Export Your Data as it is.</p>
      ) : (
        <p>
          <strong>{progress.Imported === 0 ? 'No new runs added.' : `${plural(progress.Imported, 'run')} added.`}</strong>
          {tail.length > 0 && ` Also ${tail.join(', ')}.`}
        </p>
      )}
      {result?.stoppedBecause && (
        <p className="field-help">
          {result.stoppedBecause === 'rate-limit' && result.stopMessage ? result.stopMessage : STOPPED[result.stoppedBecause]}
          {result.stoppedBecause !== 'limit' && ' Pick the same files again to carry on: runs already added are skipped.'}
        </p>
      )}
      {problems.length > 0 && (
        <details className="disclosure">
          <summary>Files that weren’t added ({problems.length.toLocaleString('en-GB')})</summary>
          <ul className="bulk-problems">
            {problems.slice(0, LISTED).map((o, i) => (
              <li key={`${o.name}-${i}`}>
                <span className="mono">{o.name}</span> <span className="field-help">{o.message ?? REASON[o.status]}</span>
              </li>
            ))}
            {problems.length > LISTED && <li className="field-help">…and {(problems.length - LISTED).toLocaleString('en-GB')} more.</li>}
          </ul>
        </details>
      )}
    </div>
  )
}
