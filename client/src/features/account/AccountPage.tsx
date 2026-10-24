import { useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { Runner } from '../../lib/types'
import { StravaSection } from '../sync/StravaSection'
import { ProfileForm } from './ProfileForm'
import { RunSources } from './RunSources'

interface Props {
  runner: Runner
  onSaved: (runner: Runner) => void
  onDeleted: () => void
  /** To My runs, where a run is uploaded. */
  onOpenRuns: () => void
  /** What happened on the way back from connecting Strava, if the runner just did. */
  stravaNotice?: string | null
  /** Strava just sent the runner back and the connection is still being saved. */
  stravaConnecting?: boolean
}

/** Profile, where runs come from, a copy of everything we hold, and the way out. */
export function AccountPage({ runner, onSaved, onDeleted, onOpenRuns, stravaNotice, stravaConnecting = false }: Props) {
  const auth = useAuth()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }>({ kind: 'idle' })

  const withToken = async (action: (token: string) => Promise<void>) => {
    setStatus({ kind: 'busy' })
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      await action(token)
      setStatus({ kind: 'idle' })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'That didn’t work. Try again.' })
    }
  }

  const download = () =>
    withToken(async (token) => {
      const data = await api.me.exportData(token)
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'taperday-my-data.json'
      link.click()
      URL.revokeObjectURL(url)
    })

  const deleteEverything = () =>
    withToken(async (token) => {
      await api.me.remove(token)
      onDeleted()
    })

  return (
    <section aria-labelledby="account-title">
      <h2 className="plan-title" id="account-title">
        Account
      </h2>
      <p className="plan-focus">Signed in as {runner.email ?? runner.displayName}.</p>

      <div className="section">
        <h3>Your details</h3>
        <ProfileForm runner={runner} onSaved={onSaved} />
      </div>

      <StravaSection notice={stravaNotice} connecting={stravaConnecting} />

      <RunSources onOpenRuns={onOpenRuns} />

      <div className="section">
        <h3>Your data</h3>
        <p>
          Download a copy of everything Taperday holds about you: your profile, every saved plan, every run, and which services you’ve connected. Sign-in
          keys for those services are never included.
        </p>
        <button type="button" className="button" onClick={() => void download()} disabled={status.kind === 'busy'}>
          Download my data
        </button>
      </div>

      <div className="section danger-zone">
        <h3>Delete account</h3>
        <p>
          This deletes your profile, every saved plan and every run straight away, and ends Taperday’s access to Strava if you connected it. It can’t be undone. Your sign-in itself is kept by
          Microsoft; ask us if you want that removed too.
        </p>
        {confirmingDelete ? (
          <div className="submit-row">
            <button type="button" className="button button-danger" onClick={() => void deleteEverything()} disabled={status.kind === 'busy'}>
              {status.kind === 'busy' ? 'Deleting…' : 'Yes, delete everything'}
            </button>
            <button type="button" className="button button-quiet" onClick={() => setConfirmingDelete(false)}>
              Keep my account
            </button>
          </div>
        ) : (
          <button type="button" className="button button-quiet" onClick={() => setConfirmingDelete(true)}>
            Delete my account
          </button>
        )}
      </div>

      {status.kind === 'error' && (
        <p className="field-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
          {status.message}
        </p>
      )}
    </section>
  )
}
