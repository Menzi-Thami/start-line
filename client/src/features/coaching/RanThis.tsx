import { useState } from 'react'
import { ApiError } from '../../lib/api-client'
import { formatDistance } from '../../lib/format'
import type { ActivitySummary, Session } from '../../lib/types'
import { offersTick, stravaRunFor } from './ran-this'
import type { SessionCoach } from './useCheckIns'

interface Props {
  session: Session
  coach: SessionCoach
  runs?: readonly ActivitySummary[]
  /** After the tick is saved: the session counts as done. */
  onTicked?: () => void
}

/**
 * "Ran this? Tick it": one tap that says the runner ran a session Strava has a run for. It's a plain "Done" check-in, the
 * runner's own, so it's kept and counts towards their totals; the synced run goes after 7 days. Only ever the runner's
 * tap: Taperday never ticks a session for them. How it felt can be added after, in the usual check-in.
 */
export function RanThis({ session, coach, runs, onTicked }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = stravaRunFor(session, runs)
  if (!run || !offersTick(session, coach, runs)) return null

  const tick = async () => {
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

  return (
    <div className="ran-this">
      <p className="ran-this-line">
        Strava has a {formatDistance(run.distanceKm, coach.units)} run for this. Tick it and it counts towards your running for good.
      </p>
      <button type="button" className="button ran-this-button" onClick={() => void tick()} disabled={busy}>
        {busy ? 'Ticking…' : 'Ran this? Tick it'}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
