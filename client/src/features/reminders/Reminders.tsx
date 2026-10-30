import { useEffect, useId, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { addressOf, currentSubscription, deviceKeyOf, notificationsBlocked, pushSupport, subscribe, unsubscribe } from '../../lib/push'
import type { NotificationPreferences, ReminderDevice } from '../../lib/types'

const DEFAULT_TIME = '06:00'
const NEW_PREFERENCES: NotificationPreferences = {
  runCongratulations: true, trainingReviews: true, longRunPreparation: true,
  racePreparation: true, connectionAlerts: true, preparationAt: '18:00:00', quietStart: '22:00:00', quietEnd: '06:00:00',
}
const EXISTING_PREFERENCES: NotificationPreferences = {
  ...NEW_PREFERENCES, trainingReviews: false, longRunPreparation: false, racePreparation: false, connectionAlerts: false,
  quietStart: null, quietEnd: null,
}

type State =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'ready'; publicKey: string; device: ReminderDevice | null }
  | { kind: 'error'; message: string }

/** This device's entry among the runner's, found by the hash of its push address. */
async function thisDevice(devices: readonly ReminderDevice[]): Promise<ReminderDevice | null> {
  const subscription = await currentSubscription().catch(() => null)
  if (!subscription) return null
  const key = await deviceKeyOf(subscription.endpoint)
  return devices.find((d) => d.deviceKey === key) ?? null
}

/**
 * Account: reminders on this device, off until the runner turns them on. A notification at the time they pick on days
 * their plan has a run, built from the plan alone; on Mondays, if they like, that a new week and the coach's note are
 * waiting. Turning them off ends the browser's subscription and forgets the device.
 */
export function RemindersSection({ offer = false }: { offer?: boolean }) {
  const auth = useAuth()
  const support = pushSupport()
  const ids = { heading: useId(), toggle: useId(), time: useId(), week: useId(), daily: useId() }
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [time, setTime] = useState(DEFAULT_TIME)
  const [weekAhead, setWeekAhead] = useState(true)
  const [daily, setDaily] = useState(true)
  const [preferences, setPreferences] = useState<NotificationPreferences>(NEW_PREFERENCES)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'done' | 'error'; text: string } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const validPreferences = preferences.quietStart == null || preferences.quietStart !== preferences.quietEnd

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const token = await auth.getToken()
      if (!token) throw new Error('Sign in again to see your reminders.')
      const reminders = await api.me.reminders.get(token)
      if (!reminders.available || !reminders.publicKey) return { kind: 'hidden' } as const
      const device = support === 'supported' ? await thisDevice(reminders.devices) : null
      return { kind: 'ready', publicKey: reminders.publicKey, device } as const
    }
    load()
      .then((next) => {
        if (cancelled) return
        setState(next)
        if (next.kind === 'ready' && next.device) {
          setTime(next.device.remindAt.slice(0, 5))
          setWeekAhead(next.device.weekAhead)
          setDaily(next.device.daily ?? false)
          setPreferences(next.device.preferences ?? EXISTING_PREFERENCES)
        }
      })
      .catch(
        (error: unknown) =>
          !cancelled && setState({ kind: 'error', message: error instanceof Error ? error.message : 'Reminders didn’t load.' }),
      )
    return () => {
      cancelled = true
    }
  }, [auth, support])

  if (state.kind === 'hidden') return offer ? null : (
    <p className="callout">Notifications are not available yet. Taperday needs to finish setting up notification delivery. Your phone’s permission alone does not turn on reminders.</p>
  )

  const withToken = async (action: (token: string) => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      await action(token)
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'That didn’t work. Try again.' })
      if (state.kind === 'ready' && state.device) {
        setTime(state.device.remindAt.slice(0, 5))
        setWeekAhead(state.device.weekAhead)
        setDaily(state.device.daily ?? false)
        setPreferences(state.device.preferences ?? EXISTING_PREFERENCES)
      }
    } finally {
      setBusy(false)
    }
  }

  const save = (publicKey: string, at: string, week: boolean, everyDay: boolean, prefs = preferences) =>
    withToken(async (token) => {
      const subscription = await currentSubscription()
      if (!subscription) throw new Error('This device’s reminders have expired. Turn reminders off and on to reconnect it.')
      const address = addressOf(subscription)
      const device = await api.me.reminders.turnOn(token, { ...address, remindAt: `${at}:00`, weekAhead: week, daily: everyDay, preferences: prefs })
      setState({ kind: 'ready', publicKey, device })
      setPreferences(device.preferences ?? prefs)
    })

  const turnOn = async (publicKey: string) => {
    setBusy(true)
    setMessage(null)
    try {
      // Request permission directly from the tap, before token/network work can lose iOS user activation.
      const address = await subscribe(publicKey)
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      const device = await api.me.reminders.turnOn(token, { ...address, remindAt: `${time}:00`, weekAhead, daily, preferences })
      setState({ kind: 'ready', publicKey, device })
      setMessage({
        tone: 'done',
        text: `Reminders are on. Morning reminders are set for around ${time} in your time zone${daily ? ', including recovery days' : ' on workout days'}.`,
      })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'That didn’t work. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const turnOff = (publicKey: string, device: ReminderDevice) =>
    withToken(async (token) => {
      await unsubscribe()
      await api.me.reminders.turnOff(token, device.id)
      setState({ kind: 'ready', publicKey, device: null })
      setMessage({ tone: 'done', text: 'Reminders are off, and Taperday has forgotten this device.' })
    })

  const changePreferences = (patch: Partial<NotificationPreferences>) => {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    if (next.quietStart && next.quietStart === next.quietEnd) {
      setMessage({ tone: 'error', text: 'Quiet hours need different start and end times. This change has not been saved.' })
      return
    }
    if (state.kind === 'ready' && state.device) void save(state.publicKey, time, weekAhead, daily, next)
  }

  if (offer) {
    if (dismissed || state.kind !== 'ready' || state.device || support === 'unsupported' || notificationsBlocked()) return null
    return (
      <section className="section callout" aria-label="Enable notifications">
        <h3>Want a reminder for your day?</h3>
        {support === 'home-screen-first' ? (
          <p>On iPhone or iPad, add Taperday to your Home Screen from Safari’s Share menu, then open it from its icon to enable notifications.</p>
        ) : (
          <>
            <p>Get workout reminders around 06:00, training review alerts, preparation tips and Strava updates. Quiet hours are 22:00–06:00 in your profile’s time zone. Choose what you receive in Account → Notifications.</p>
            <button type="button" className="button" disabled={busy || !validPreferences} onClick={() => void turnOn(state.publicKey)}>Enable notifications</button>
          </>
        )}
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => setDismissed(true)}>Not now</button>
        {message && <p role="alert" className="field-error">{message.text}</p>}
      </section>
    )
  }

  return (
    <section className="section" aria-labelledby={ids.heading}>
      <h3 id={ids.heading}>Reminders</h3>
      <p>
        Choose your morning reminders, preparation tips and Strava updates for this device. Times use your profile’s time zone.
        A synced run opens for review; it never marks a planned workout complete for you.
      </p>

      {state.kind === 'loading' && <p className="loading-line">Checking reminders…</p>}
      {state.kind === 'error' && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}

      {state.kind === 'ready' && support === 'home-screen-first' && (
        <p className="callout">
          On an iPhone or iPad, reminders work once Taperday is on your home screen (iOS 16.4 or later). Add it from Safari’s Share menu,
          open it from there, then turn reminders on here. On Android and on a computer, they work in the browser.
        </p>
      )}
      {state.kind === 'ready' && support === 'unsupported' && (
        <p className="callout">This browser can’t show notifications from websites. Chrome, Edge, Firefox and Safari can.</p>
      )}

      {state.kind === 'ready' && support === 'supported' && (
        <div className="reminder-settings">
          <label className="session-done" style={{ color: 'var(--ink)' }} htmlFor={ids.toggle}>
            <input
              id={ids.toggle}
              type="checkbox"
              role="switch"
              checked={state.device !== null}
              disabled={busy || state.device === null && !validPreferences}
              onChange={(e) => void (e.target.checked ? turnOn(state.publicKey) : state.device && turnOff(state.publicKey, state.device))}
            />
            Reminders on this device
          </label>
          <div className="field">
            <label className="field-label" htmlFor={ids.time}>
              Morning reminder time
            </label>
            <input
              id={ids.time}
              type="time"
              className="input"
              value={time}
              disabled={busy}
              required
              onChange={(e) => {
                const next = e.target.value
                setTime(next)
                if (state.device && /^\d{2}:\d{2}$/.test(next)) void save(state.publicKey, next, weekAhead, daily)
              }}
            />
          </div>
          <label className="session-done" htmlFor={ids.daily}>
            <input
              id={ids.daily}
              type="checkbox"
              checked={daily}
              disabled={busy}
              onChange={(e) => {
                setDaily(e.target.checked)
                if (state.device) void save(state.publicKey, time, weekAhead, e.target.checked)
              }}
            />
            Include recovery and strength days
          </label>
          <label className="session-done" style={{ color: 'var(--ink)' }} htmlFor={ids.week}>
            <input
              id={ids.week}
              type="checkbox"
              checked={weekAhead}
              disabled={busy}
              onChange={(e) => {
                setWeekAhead(e.target.checked)
                if (state.device) void save(state.publicKey, time, e.target.checked, daily)
              }}
            />
            On Mondays, tell me when a new week starts
          </label>
          <fieldset disabled={busy} className="notification-choices">
            <legend>Choose your updates</legend>
            {([
              ['runCongratulations', 'Congratulations when a Strava run arrives'],
              ['trainingReviews', 'Training adjustments ready to review'],
              ['longRunPreparation', 'Preparation the evening before a long run'],
              ['racePreparation', 'A checklist the evening before race day'],
              ['connectionAlerts', 'Let me know when Strava needs reconnecting'],
            ] as const).map(([key, label]) => (
              <label className="session-done" key={key}>
                <input type="checkbox" checked={preferences[key]} onChange={e => changePreferences({ [key]: e.target.checked })} />
                {label}
              </label>
            ))}
            <div className="field">
              <label className="field-label" htmlFor={`${ids.time}-prep`}>Preparation reminder time</label>
              <input id={`${ids.time}-prep`} className="input" type="time" required value={preferences.preparationAt.slice(0, 5)} onChange={e => {
                if (/^\d{2}:\d{2}$/.test(e.target.value)) changePreferences({ preparationAt: `${e.target.value}:00` })
              }} />
            </div>
            <label className="session-done">
              <input type="checkbox" checked={preferences.quietStart != null} onChange={e => changePreferences(e.target.checked
                ? { quietStart: '22:00:00', quietEnd: '06:00:00' } : { quietStart: null, quietEnd: null })} />
              Quiet hours
            </label>
            {preferences.quietStart != null && (
              <div className="notification-quiet-times">
                <label className="field">From
                  <input className="input" type="time" required value={preferences.quietStart.slice(0, 5)} onChange={e => {
                    if (/^\d{2}:\d{2}$/.test(e.target.value)) changePreferences({ quietStart: `${e.target.value}:00` })
                  }} />
                </label>
                <label className="field">Until
                  <input className="input" type="time" required value={(preferences.quietEnd ?? '06:00').slice(0, 5)} onChange={e => {
                    if (/^\d{2}:\d{2}$/.test(e.target.value)) changePreferences({ quietEnd: `${e.target.value}:00` })
                  }} />
                </label>
              </div>
            )}
            <p className="field-help">Quiet hours use your profile’s time zone. Updates wait until quiet hours end; preparation tips that would arrive after the preparation day are skipped. Review alerts never apply changes to your plan.</p>
          </fieldset>
          <p className="field-help">
            In your own time zone, from Your details. Delivery can be delayed by your phone, connection or Taperday’s server; the app does
            not need to be open. Congratulations arrive when Strava syncs. Turning reminders off forgets this device; other devices keep
            theirs.
            {notificationsBlocked() && ' Notifications are blocked for Taperday in this browser: allow them in its site settings first.'}
          </p>
        </div>
      )}

      {message && (
        <p className={message.tone === 'done' ? 'callout' : 'field-error'} role={message.tone === 'done' ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </section>
  )
}
