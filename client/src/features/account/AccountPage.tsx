import { PrivateImport } from '../private-plans/PrivateImport'
import { RunDataPanel } from '../activities/RunDataPanel'
import './account-layout.css'
import { useState, type ReactNode } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { Runner } from '../../lib/types'
import { InstallSection } from '../install/InstallApp'
import { RemindersSection } from '../reminders/Reminders'
import { StravaSection } from '../sync/StravaSection'
import { PhotoPicker } from './PhotoPicker'
import { ProfileForm } from './ProfileForm'
import { ShoeTracker } from './ShoeTracker'

interface Props {
  /** The runner's picture, if they added one; the picker shows their initials otherwise. */
  photo?: string | null
  onPhotoChange?: (photo: string | null) => void
  runner: Runner
  onSaved: (runner: Runner) => void
  onDeleted: () => void
  /** To My runs, where a run is uploaded. */
  onOpenRuns: () => void
  /** What happened on the way back from connecting Strava, if the runner just did. */
  stravaNotice?: string | null
  /** Strava just sent the runner back and the connection is still being saved. */
  stravaConnecting?: boolean
  /** A new calendar link was made here, so the plan's calendar menu offers it rather than the old one. */
  onNewCalendarLink?: (token: string) => void
}

type Group = 'profile' | 'connections' | 'notifications' | 'data'

/** Deep links (?settings=…) open their group. Shoes live under Profile's More; a shoe reminder opens both. */
const linkedGroup = (): { group: Group | null; shoes: boolean } => {
  const wanted = new URLSearchParams(window.location.search).get('settings')
  if (wanted === 'shoes') return { group: 'profile', shoes: true }
  return { group: wanted === 'profile' || wanted === 'connections' || wanted === 'notifications' || wanted === 'data' ? wanted : null, shoes: false }
}

/** Profile, connections, notifications, a copy of everything we hold, and the way out. */
export function AccountPage({ runner, onSaved, onDeleted, onOpenRuns, stravaNotice, stravaConnecting = false, onNewCalendarLink, photo = null, onPhotoChange }: Props) {
  const auth = useAuth()
  const [linked] = useState(linkedGroup)
  const [open, setOpen] = useState<Record<Group, boolean>>(() => ({
    profile: linked.group === 'profile',
    connections: linked.group === 'connections' || !!stravaNotice || stravaConnecting,
    notifications: linked.group === 'notifications',
    data: linked.group === 'data',
  }))
  const [acknowledgedNotice, setAcknowledgedNotice] = useState(stravaNotice)
  const newConnectionNotice = !!stravaNotice && stravaNotice !== acknowledgedNotice
  const [shoesOpen, setShoesOpen] = useState(linked.shoes)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [newCalendarLink, setNewCalendarLink] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string }>({ kind: 'idle' })

  const group = (id: Group, title: string, body: ReactNode) => (
    <details className="settings-group" id={`account-${id}`} open={open[id] || id === 'connections' && newConnectionNotice} onToggle={(event) => {
      if (id === 'connections') setAcknowledgedNotice(stravaNotice)
      const next = event.currentTarget.open
      setOpen((current) => current[id] === next ? current : { ...current, [id]: next })
    }}>
      <summary>{title}</summary>
      {body}
    </details>
  )

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

  const resetCalendarLink = () =>
    withToken(async (token) => {
      const link = await api.me.resetCalendar(token)
      onNewCalendarLink?.(link.token)
      setNewCalendarLink(true)
    })

  const deleteEverything = () =>
    withToken(async (token) => {
      await api.me.remove(token)
      onDeleted()
    })

  return (
    <section className="account-settings" aria-labelledby="account-title">
      <h2 className="plan-title" id="account-title">
        Account
      </h2>
      <p className="plan-focus">Signed in as {runner.email ?? runner.displayName}.</p>

      <div className="account-groups">
        {group('profile', 'Profile', <>
          <div className="settings-columns">
            {onPhotoChange && (
              <div className="section">
                <h3>Your picture</h3>
                <PhotoPicker name={runner.displayName} photo={photo} onChange={onPhotoChange} />
              </div>
            )}
            <div className="section">
              <h3>Your details</h3>
              <ProfileForm runner={runner} onSaved={onSaved} />
            </div>
          </div>
          {/* Shoes are also picked on each run's page; the list and back-filling past runs wait here. */}
          <details className="disclosure account-more" open={shoesOpen} onToggle={(event) => setShoesOpen(event.currentTarget.open)}>
            <summary>More</summary>
            <div className="section">
              <h3>Shoes</h3>
              <ShoeTracker units={runner.units === 'Miles' ? 'mi' : 'km'} />
            </div>
          </details>
        </>)}

        {group('connections', 'Connections', <>
          <StravaSection key={runner.id} notice={stravaNotice} connecting={stravaConnecting} onOpenRuns={onOpenRuns} />
          <p className="field-help account-uploads">
            No Strava? Upload a .fit, .gpx or .tcx file from your watch or app in{' '}
            <button type="button" className="link-button" onClick={onOpenRuns}>Runs</button>.
          </p>
        </>)}

        {group('notifications', 'Notifications', <>
          <RemindersSection />
          <InstallSection />
        </>)}

        {group('data', 'Data & privacy', <>
          {open.data && <PrivateImport key={runner.id} />}
          <RunDataPanel units={runner.units === 'Miles' ? 'mi' : 'km'} />
          <div className="section">
            <h3>Your data</h3>
            <p>Everything Taperday holds about you, as one file.</p>
            <button type="button" className="button" onClick={() => void download()} disabled={status.kind === 'busy'}>
              Download my data
            </button>
          </div>

          <div className="section">
            <h3>Calendar link</h3>
            <p>
              Shared your plan’s calendar link by mistake? Get a new one; the old link stops working.{' '}
              {newCalendarLink ? (
                <span role="status">Done. Add your plan to your calendar again from the plan.</span>
              ) : (
                <button type="button" className="link-button" onClick={() => void resetCalendarLink()} disabled={status.kind === 'busy'}>
                  Get a new link
                </button>
              )}
            </p>
          </div>

          <div className="section danger-zone">
            <h3>Delete account</h3>
            <p>
              This deletes your profile, every saved plan, every run and your reminders straight away, and ends Taperday’s access to Strava if you connected it. It can’t be undone. Your sign-in itself is kept by
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
        </>)}
      </div>
      <button type="button" className="button button-quiet account-sign-out" onClick={auth.signOut}>Sign out</button>

      {status.kind === 'error' && (
        <p className="field-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
          {status.message}
        </p>
      )}
    </section>
  )
}
