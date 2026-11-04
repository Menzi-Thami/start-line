import { useState } from 'react'
import { ApiError } from '../../lib/api-client'
import { completionFeedback, plannedVsActual } from '../../lib/strava-auto-completion'
import { formatDistance, formatDuration } from '../../lib/format'
import type { Session } from '../../lib/types'
import { syncedFor } from './strava-completion'
import type { SessionCoach } from './useCheckIns'

interface Props {
  session: Session
  coach: SessionCoach
  /** After the runner's own tick is saved. */
  onTicked?: () => void
}

/**
 * "Completed via Strava": a held Strava run completes the session while Taperday has it (7 days), worked out on each read
 * and never stored. It shows planned against actual and a gentle word on how it compared. "Keep this tick" is the runner's
 * own tap, a plain Done check-in, which lasts after the Strava copy goes. When the runner said they skipped it, their
 * word stands and the run is shown beside it, with one tap to change their answer.
 */
export function StravaCompletion({ session, coach, onTicked }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const completion = syncedFor(session, coach)
  if (!completion) return null

  const keep = async () => {
    setBusy(true)
    setError(null)
    try {
      await coach.save(session, { status: 'Done', effort: null, distanceUnreported: false })
      onTicked?.()
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'That didn’t save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const figures = plannedVsActual(completion, coach.units)
  const ran = completion.actualKm > 0 ? formatDistance(completion.actualKm, coach.units) : formatDuration(completion.actualSeconds)
  const failed = error && <p className="field-error" role="alert">{error}</p>

  if (completion.state === 'Conflict') {
    return (
      <div className="strava-completion is-conflict">
        <p className="strava-completion-line">
          <strong>You marked this skipped.</strong> Strava has a {ran} run on this day. Your answer stands unless you change it.
        </p>
        <button type="button" className="button button-quiet strava-completion-button" onClick={() => void keep()} disabled={busy}>
          {busy ? 'Saving…' : 'I ran it: mark as done'}
        </button>
        {failed}
      </div>
    )
  }

  return (
    <div className="strava-completion">
      <p className="strava-completion-label">
        <span className="chip chip-good">Completed via Strava</span>
      </p>
      {figures && (
        <p className="strava-completion-figures">
          Planned <span className="mono">{figures.planned}</span> · Ran <span className="mono">{figures.actual}</span>
        </p>
      )}
      <p className="strava-completion-line">{completionFeedback(completion, coach.units)}</p>
      <p className="field-help">Strava runs stay in Taperday for 7 days. Keep the tick and it stays on your plan for good.</p>
      <button type="button" className="button strava-completion-button" onClick={() => void keep()} disabled={busy}>
        {busy ? 'Saving…' : 'Keep this tick'}
      </button>
      {failed}
    </div>
  )
}
