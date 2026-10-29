import { useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { showWelcomeNotification } from '../../lib/install-app'
import { currentSubscription, pushSupport, subscribe } from '../../lib/push'

const SEEN_KEY = 'taperday:installed-welcome'
const REMINDER_TIME = '06:00:00'

const seen = () => {
  try {
    return window.localStorage.getItem(SEEN_KEY) !== null
  } catch {
    return true
  }
}

/**
 * The first time Taperday opens from the home screen: a hello, and the one tap that lets it send notifications. An
 * iPhone only allows that from inside the installed app, after a tap, so it can't happen at the moment of adding.
 * Allowing sends the welcome notification at once and, for a signed-in runner, turns run reminders on at 06:00 (the
 * same default as Account, where the time can be changed).
 */
export function InstalledWelcome() {
  const auth = useAuth()
  const [hidden, setHidden] = useState(seen)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  if (hidden) return null

  const done = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, new Date().toISOString())
    } catch {
      // Storage blocked: it simply shows again next time.
    }
    setHidden(true)
  }

  const canNotify = pushSupport() === 'supported' && 'Notification' in window
  const allowed = canNotify && Notification.permission === 'granted'

  const turnOn = async () => {
    setBusy(true)
    setNote(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setNote('Notifications are off. You can allow them later in your phone’s settings, then turn reminders on in Account.')
        return
      }
      await showWelcomeNotification()
      const token = await auth.getToken()
      if (token) {
        const reminders = await api.me.reminders.get(token)
        if (reminders.available && reminders.publicKey && !(await currentSubscription())) {
          const address = await subscribe(reminders.publicKey)
          await api.me.reminders.turnOn(token, { ...address, remindAt: REMINDER_TIME, weekAhead: true, daily: true })
        }
      }
      setNote(token ? 'Done. Reminders come at 06:00 on your run days; change the time in Account.' : 'Done. Sign in to get reminders for your runs.')
    } catch {
      setNote('That didn’t work this time. You can turn reminders on in Account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel install-card" aria-labelledby="installed-welcome">
      <img className="install-icon" src="/home-icon-192.png" alt="" width="64" height="64" />
      <div className="install-body">
        <h2 id="installed-welcome" className="home-card-heading">
          You’re all set
        </h2>
        <p className="install-pitch">Taperday is on your home screen. Allow notifications and it can remind you of each run.</p>
        <div className="install-actions">
          {canNotify && !allowed && (
            <button type="button" className="button install-button" disabled={busy} onClick={() => void turnOn()}>
              Turn on notifications
            </button>
          )}
          <button type="button" className="link-button" onClick={done}>
            {canNotify && !allowed ? 'Not now' : 'Got it'}
          </button>
        </div>
        {note && (
          <p className="field-help" role="status">
            {note}
          </p>
        )}
      </div>
    </section>
  )
}
