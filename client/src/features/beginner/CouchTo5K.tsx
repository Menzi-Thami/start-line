import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { apiOrigin } from '../../lib/api-client'
import { beginnerSessionSummary, couchTo5k } from './couch-to-5k'
import { countCompleted, defaultBeginnerProgress, parseBeginnerProgress, sessionDate, sessionId, validRunDays, type BeginnerDay, type BeginnerProgress } from './beginner-progress'

const STORAGE_KEY = 'taperday:beginner-progress:v1'
const programme = couchTo5k()
const todayLocal = () => {
  const now = new Date()
  const adjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return adjusted.toISOString().slice(0, 10)
}
const read = (): BeginnerProgress => {
  const today = todayLocal()
  try { return parseBeginnerProgress(window.localStorage.getItem(STORAGE_KEY), today) }
  catch { return defaultBeginnerProgress(today) }
}

/** A standalone beginner journey. Training history is saved on this device
 * only until the authenticated account-backed plan API is integrated.
 */
export function CouchTo5K() {
  const auth = useAuth()
  const [progress, setProgress] = useState<BeginnerProgress>(read)
  const [serverReady, setServerReady] = useState(false)
  const [syncError, setSyncError] = useState('')
  const saveVersion = useRef(0)
  const sessions = programme.filter(s => s.week === progress.week)
  const done = countCompleted(progress, programme)
  const update = (next: BeginnerProgress) => setProgress(next)
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)) }
    catch { /* Private browsing / restricted storage: continue in memory */ }
  }, [progress])

  // A signed-in runner's server state is canonical. Device state remains a
  // fallback when not signed in; never overwrite the account before hydration.
  useEffect(() => {
    if (!auth.account) { setServerReady(false); return }
    let cancelled = false
    setServerReady(false)
    auth.getToken().then(async token => {
      if (!token) return
      const response = await fetch(`${apiOrigin()}/api/v1/me/beginner`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      if (!response.ok && response.status !== 204) throw new Error('Unable to load your saved programme.')
      if (!cancelled) {
        if (response.status !== 204) setProgress(parseBeginnerProgress(JSON.stringify(await response.json()), todayLocal()))
        setServerReady(true)
      }
    }).catch(() => { if (!cancelled) setSyncError('Your account progress could not be loaded. Check your connection before marking sessions complete.') })
    return () => { cancelled = true }
  }, [auth.account, auth.getToken])

  useEffect(() => {
    if (!auth.account || !serverReady) return
    const version = ++saveVersion.current
    let cancelled = false
    auth.getToken().then(async token => {
      if (!token) return
      const response = await fetch(`${apiOrigin()}/api/v1/me/beginner`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(progress),
      })
      if (!response.ok) throw new Error('Could not sync your programme to your account.')
      if (!cancelled && version === saveVersion.current) setSyncError('')
    }).catch(() => { if (!cancelled && version === saveVersion.current) setSyncError('Changes were saved on this device, but account sync failed. Please check your connection.') })
    return () => { cancelled = true }
  }, [progress, serverReady, auth.account, auth.getToken])

  const schedules: readonly (readonly [BeginnerDay, BeginnerDay, BeginnerDay])[] = [
    ['Monday', 'Wednesday', 'Friday'],
    ['Tuesday', 'Thursday', 'Saturday'],
    ['Wednesday', 'Friday', 'Sunday'],
    ['Monday', 'Thursday', 'Saturday'],
    ['Tuesday', 'Friday', 'Sunday'],
  ]
  const chooseSchedule = (value: string) => {
    const selected = schedules.find(days => days.join('|') === value)
    if (selected && validRunDays(selected)) update({ ...progress, days: [...selected] as [BeginnerDay, BeginnerDay, BeginnerDay] })
  }
  const toggle = (id: string) => {
    const set = new Set(progress.completed)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    update({ ...progress, completed: [...set] })
  }
  const resetWeek = () => {
    const ids = new Set(sessions.map(s => sessionId(s, progress.revision)))
    update({ ...progress, completed: progress.completed.filter(id => !ids.has(id)), paused: false })
  }
  return (
    <section className="panel" aria-labelledby="beginner-title">
      <p className="field-help">BEGINNER · NINE WEEKS · THREE SESSIONS PER WEEK</p>
      <h2 id="beginner-title">Couch to 5K</h2>
      <p>Start with gentle run/walk intervals. There are no pace targets. Rest between sessions, and repeat a week if you need to.</p>
      {syncError && <p role="alert" className="field-help">{syncError}</p>}
      <p aria-live="polite"><strong>{done} of 27 sessions completed</strong> · {Math.round(done / 27 * 100)}%</p>
      <progress value={done} max={27} style={{ width: '100%' }} aria-label="Couch to 5K completed sessions" />
      <div className="field">
        <label className="field-label" htmlFor="couch-start">Programme start date</label>
        <input className="input" type="date" id="couch-start" value={progress.startedOn}
          onChange={e => { if (e.target.value) update({ ...progress, startedOn: e.target.value }) }} />
      </div>
      <fieldset className="field">
        <legend className="field-label">Your three run days</legend>
        <p className="field-help">Keep a rest day between sessions. Choose your schedule before recording progress.</p>
        <select className="input" aria-label="Choose a three-day running schedule" value={progress.days.join('|')} onChange={e => chooseSchedule(e.target.value)}>
          {schedules.map(days => <option key={days.join('|')} value={days.join('|')}>{days.join(' · ')}</option>)}
        </select>
      </fieldset>
      <div className="wizard-nav">
        <button className="button button-quiet" type="button" disabled={progress.week === 1} onClick={() => update({ ...progress, week: Math.max(1, progress.week - 1) })}>Previous week</button>
        <strong aria-live="polite">Week {progress.week} of 9</strong>
        <button className="button button-quiet" type="button" disabled={progress.week === 9} onClick={() => update({ ...progress, week: Math.min(9, progress.week + 1) })}>Next week</button>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="button button-quiet" type="button" aria-pressed={progress.paused} onClick={() => update({ ...progress, paused: !progress.paused })}>
          {progress.paused ? 'Resume programme' : 'Pause programme'}
        </button>
        <button className="button button-quiet" type="button" onClick={resetWeek}>Repeat this week</button>
      </div>
      {progress.paused && <p role="status">Paused. Your progress is kept here until you resume.</p>}
      <ol className="days">
        {sessions.map(session => {
          const id = sessionId(session, progress.revision)
          const checked = progress.completed.includes(id)
          return (
            <li className="day" key={id}>
              <div>
                <strong>Session {session.day} · {sessionDate(progress.startedOn, progress.days, session.week, session.day)}</strong>
                <p className="field-help">5 min brisk walking warm-up</p>
                <p>{beginnerSessionSummary(session)}</p>
                <p className="field-help">5 min walking cool-down · About {Math.round(session.totalSeconds / 60)} minutes total</p>
                <label className="session-done">
                  <input type="checkbox" disabled={progress.paused} checked={checked} onChange={() => toggle(id)} />
                  {checked ? 'Completed' : 'Mark this session complete'}
                </label>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="field-help">Progress is saved on this device and synchronised to your Taperday account when you're signed in and connected.</p>
      <p className="field-help">After week nine, aim for 30 minutes of comfortable running. That may not yet be 5 km. Build distance gradually; rest or repeat whenever needed.</p>
    </section>
  )
}
