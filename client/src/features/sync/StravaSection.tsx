import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate } from '../../lib/format'
import type { StravaStatus } from '../../lib/types'
import { ConnectWithStrava, PoweredByStrava } from './StravaBrand'
import { StravaDeviceGuide } from './StravaDeviceGuide'

interface Props {
  /** What just happened on the way back from Strava, to say at the top of the section. */
  notice?: string | null
  /** Strava sent the runner back and the connection is still being saved: say so, and don't offer Connect again. */
  connecting?: boolean
}

type State = { kind: 'loading' } | { kind: 'ready'; status: StravaStatus } | { kind: 'error'; message: string }

/** Account: connect Strava so runs arrive by themselves, see how it stands, or disconnect (which deletes the copies). */
export function StravaSection({ notice, connecting = false }: Props) {
  const auth = useAuth()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(notice ?? null)

  useEffect(() => {
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.strava.status(token) : Promise.reject(new Error('Sign in again to see your Strava connection.'))))
      .then((status) => !cancelled && setState({ kind: 'ready', status }))
      .catch((error: unknown) => !cancelled && setState({ kind: 'error', message: error instanceof Error ? error.message : 'That didn’t load.' }))
    return () => {
      cancelled = true
    }
  }, [auth])

  const withToken = async (action: (token: string) => Promise<void>) => {
    setBusy(true)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      await action(token)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const connect = () =>
    withToken(async (token) => {
      const { authorizeUrl } = await api.me.strava.authorize(token)
      window.location.assign(authorizeUrl)
    })

  const disconnect = () =>
    withToken(async (token) => {
      const { deletedRuns } = await api.me.strava.disconnect(token)
      setConfirming(false)
      setState({ kind: 'ready', status: await api.me.strava.status(token) })
      setMessage(
        `Disconnected. ${deletedRuns === 1 ? 'The 1 run' : `All ${deletedRuns} runs`} from Strava ${deletedRuns === 1 ? 'is' : 'are'} deleted from Taperday. Your runs on Strava are untouched.`,
      )
    })

  if (state.kind === 'ready' && !state.status.available && !state.status.connected) return null

  return (
    <div className="section strava-section">
      <h3>Runs from Strava</h3>
      {message && (
        <p className="callout" role="status">
          {message}
        </p>
      )}
      {connecting && (
        <p className="loading-line" role="status">
          Finishing connecting Strava…
        </p>
      )}
      {!connecting && state.kind === 'loading' && <div className="skeleton" aria-hidden="true" />}
      {state.kind === 'error' && <p className="field-error">{state.message}</p>}
      {!connecting && state.kind === 'ready' && !state.status.connected && (
        <>
          <p>
            Your runs on Strava arrive in your plan by themselves.
          </p>
          <ConnectWithStrava onClick={() => void connect()} disabled={busy} />
        </>
      )}
      {state.kind === 'ready' && state.status.connected && (
        <>
          {state.status.status === 'NeedsReconnect' ? (
            <>
              <p className="callout" role="note">
                Strava has stopped accepting Taperday’s access, so new runs aren’t arriving. Connect again to carry on.
              </p>
              <ConnectWithStrava onClick={() => void connect()} disabled={busy} />
            </>
          ) : (
            <p>
              Connected since {formatDate(state.status.connectedAt!.slice(0, 10), 'long')}.{' '}
              {state.status.syncedRuns === 1 ? '1 run' : `${state.status.syncedRuns} runs`} from the last six weeks are in your plan
              {state.status.includesPrivateRuns ? ', including ones you keep private on Strava' : ''}.
              {state.status.pending > 0 && ` Fetching ${state.status.pending} more…`}
              {state.status.failed > 0 && ` ${state.status.failed === 1 ? 'One run' : `${state.status.failed} runs`} couldn’t be fetched.`}
            </p>
          )}
          {confirming ? (
            <div className="submit-row">
              <button type="button" className="button button-danger" onClick={() => void disconnect()} disabled={busy}>
                {busy ? 'Disconnecting…' : 'Disconnect and delete Strava runs'}
              </button>
              <button type="button" className="button button-quiet" onClick={() => setConfirming(false)}>
                Stay connected
              </button>
            </div>
          ) : (
            <button type="button" className="button button-quiet" onClick={() => setConfirming(true)}>
              Disconnect Strava
            </button>
          )}
        </>
      )}
      {state.kind === 'ready' && <StravaDeviceGuide />}
      <p className="field-help">
        Taperday reads each run’s time, distance, elevation and heart rate, never where you ran. Strava’s rules allow a copy for seven days at a time, so
        Taperday fetches your runs again while you stay connected. Disconnect, here or in Strava’s settings, and the copies are deleted straight away.
        Uploaded .fit files are yours and stay until you delete them.
      </p>
      <PoweredByStrava />
    </div>
  )
}
