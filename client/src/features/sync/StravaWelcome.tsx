import { useState } from 'react'
import type { StravaStatus } from '../../lib/types'
import { StravaSection } from './StravaSection'

interface Props {
  onContinue: () => void
  notice?: string | null
  connecting?: boolean
}

/** An optional first-run step, using the same Strava OAuth and privacy copy as Account. */
export function StravaWelcome({ onContinue, notice, connecting = false }: Props) {
  const [status, setStatus] = useState<StravaStatus | 'error' | null>(null)
  const ready = status !== null && status !== 'error'
  const connected = ready && status.connected && status.status !== 'NeedsReconnect'

  return (
    <section className="strava-welcome panel" aria-labelledby="strava-welcome-title">
      <p className="field-help">Your first steps · 2 of 3</p>
      <h1 id="strava-welcome-title">Bring your runs with you.</h1>
      <p>Connect Strava once, and runs recorded on your watch can arrive in Taperday automatically after they sync to Strava. We'll compare them with your training plan.</p>
      <StravaSection key={notice ?? 'initial'} notice={notice} connecting={connecting} onStatusChange={setStatus} />
      {ready && !status.available && !status.connected && (
        <p className="field-help" role="status">Strava connections aren't available right now. You can still build your plan and connect later.</p>
      )}
      {status === 'error' && (
        <p className="field-help">Couldn't check Strava right now. You can continue and connect later in Account.</p>
      )}
      <div className="submit-row">
        <button type="button" className={connected ? 'button button-primary' : 'button button-quiet'} onClick={onContinue}>
          {connected ? 'Continue to my plan' : 'I'll connect later'}
        </button>
      </div>
      <p className="field-help">Optional. You can use Taperday without Strava and upload a run from My runs at any time.</p>
    </section>
  )
}
