import { useEffect, useId, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { addressOf, currentSubscription, deviceKeyOf, notificationsBlocked, pushSupport, subscribe, unsubscribe } from '../../lib/push'
import type { ReminderDevice } from '../../lib/types'

const DEFAULT_TIME = '06:00'

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
export function RemindersSection() {
  const auth = useAuth()
  const support = pushSupport()
  const ids = { heading: useId(), toggle: useId(), time: useId(), week: useId(), daily: useId() }
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [time, setTime] = useState(DEFAULT_TIME)
  const [weekAhead, setWeekAhead] = useState(true)
  const [daily, setDaily] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'done' | 'error'; text: string } | null>(null)

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

  if (state.kind === 'hidden') return null

  const withToken = async (action: (token: string) => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      await action(token)
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'That didn’t work. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const save = (publicKey: string, at: string, week: boolean, everyDay: boolean) =>
    withToken(async (token) => {
      const subscription = await currentSubscription()
      const address = subscription ? addressOf(subscription) : await subscribe(publicKey)
      const device = await api.me.reminders.turnOn(token, { ...address, remindAt: `${at}:00`, weekAhead: week, daily: everyDay })
      setState({ kind: 'ready', publicKey, device })
    })

  const turnOn = (publicKey: string) =>
    withToken(async (token) => {
      const address = await subscribe(publicKey)
      const device = await api.me.reminders.turnOn(token, { ...address, remindAt: `${time}:00`, weekAhead, daily })
      setState({ kind: 'ready', publicKey, device })
      setMessage({
        tone: 'done',
        text: `Reminders are on. Morning reminders are set for around ${time} in your time zone${daily ? ', including recovery days' : ' on workout days'}.`,
      })
    })

  const turnOff = (publicKey: string, device: ReminderDevice) =>
    withToken(async (token) => {
      await unsubscribe()
      await api.me.reminders.turnOff(token, device.id)
      setState({ kind: 'ready', publicKey, device: null })
      setMessage({ tone: 'done', text: 'Reminders are off, and Taperday has forgotten this device.' })
    })

  return (
    <section className="section" aria-labelledby={ids.heading}>
      <h3 id={ids.heading}>Reminders</h3>
      <p>
        Start each day with your planned workout or recovery guidance. New reminders start at 6 am in your own time zone; you can choose
        another time. A recent run arriving from Strava gets a congratulations notification opening the actual run, even when it differs
        from the plan. It never marks a planned workout complete for you. Off until you turn it on.
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
              disabled={busy}
              onChange={(e) => void (e.target.checked ? turnOn(state.publicKey) : state.device && turnOff(state.publicKey, state.device))}
            />
            Reminders on this device
          </label>
          <div className="field">
            <label className="field-label" htmlFor={ids.time}>
              Time
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
