import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api, apiOrigin } from '../../lib/api-client'
import { beginnerSessionSummary, couchTo5k } from './couch-to-5k'
import { matchBeginnerStrava, type BeginnerRecordedRun } from './strava-match'
import { BeginnerCalendar, BeginnerProgress as BeginnerProgressView } from './BeginnerTrainingViews'
import './beginner-journey.css'
import { beginnerDate, defaultBeginnerProgress, parseBeginnerProgress, repeatBeginnerWeek, resumeBeginnerProgress, sessionId, validRunDays, type BeginnerDay, type BeginnerProgress } from './beginner-progress'

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

/** Beginner journey with account-backed persistence for signed-in runners.
 * Anonymous progress remains on this device; never overwrite account data
 * from stale localStorage before account hydration completes.
 */
export function CouchTo5K() {
  const { account, getToken } = useAuth()
  const [progress, setProgress] = useState<BeginnerProgress>(read)
  const [serverReady, setServerReady] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [syncAttempt, setSyncAttempt] = useState(0)
  const [stravaSnapshot, setStravaSnapshot] = useState<{ owner: string; runs: readonly BeginnerRecordedRun[] } | null>(null)
  const [activeTab, setActiveTab] = useState<'week' | 'calendar' | 'progress'>('week')
  const saveVersion = useRef(0)
  const lastSaved = useRef('')
  const saveQueue = useRef(Promise.resolve())
  const accountEpoch = useRef(0)
  const owner = account?.homeAccountId ?? account?.localAccountId ?? account?.username ?? ''
  const sessions = programme.filter(s => s.week === progress.week)
  const automatic = matchBeginnerStrava(progress, programme, stravaSnapshot?.owner === owner ? stravaSnapshot.runs : [], Date.now())
  const confirmed = programme.filter(s => progress.completed.includes(sessionId(s, progress.revision))).length
  const recordedUnconfirmed = programme.filter(s => !progress.completed.includes(sessionId(s, progress.revision)) && automatic.has(sessionId(s, progress.revision))).length
  const update = (next: BeginnerProgress) => { if (!account || serverReady) setProgress(next) }
  useEffect(() => {
    if (account) return // Never leak one signed-in runner's account state into another runner's anonymous device state.
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)) }
    catch { /* Private browsing / restricted storage: continue in memory */ }
  }, [progress, account])

  // A signed-in runner's server state is canonical. Device state remains a
  // fallback when not signed in; never overwrite the account before hydration.
  useEffect(() => {
    let cancelled = false
    const epoch = ++accountEpoch.current
    if (!account) {
      void Promise.resolve().then(() => {
        if (!cancelled) { setServerReady(false); setProgress(read()); setSyncError('') }
      })
      return () => { cancelled = true }
    }
    void Promise.resolve().then(() => {
      if (!cancelled) { setServerReady(false); setSyncError('') }
    })
    lastSaved.current = ''
    getToken().then(async token => {
      if (!token) throw new Error('Sign in to load your programme.')
      const response = await fetch(`${apiOrigin()}/api/v1/me/beginner`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      if (!response.ok && response.status !== 204) throw new Error('Unable to load your saved programme.')
      if (!cancelled && epoch === accountEpoch.current) {
        const loaded = response.status === 204 ? defaultBeginnerProgress(todayLocal()) : parseBeginnerProgress(JSON.stringify(await response.json()), todayLocal())
        setProgress(loaded)
        lastSaved.current = JSON.stringify(loaded)
        setServerReady(true)
      }
    }).catch(() => { if (!cancelled) setSyncError('Your account progress could not be loaded. Check your connection before marking sessions complete.') })
    return () => { cancelled = true }
  }, [account, getToken])

  useEffect(() => {
    if (!account || !serverReady) return
    const payload = JSON.stringify(progress)
    if (payload === lastSaved.current) return
    const version = ++saveVersion.current
    const epoch = accountEpoch.current
    // Each queued payload MUST remain eligible after progress changes.
    // React cleans up the previous effect on every new checkbox click;
    // cancelling that effect here silently dropped intermediate saves.
    // Keep the serialized queue, but invalidate all prior work only when
    // the account epoch changes (sign-out/switch), not on each render.
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      if (epoch !== accountEpoch.current) return
      const token = await getToken()
      if (epoch !== accountEpoch.current) return
      if (!token) throw new Error('Sign-in expired.')
      const response = await fetch(`${apiOrigin()}/api/v1/me/beginner`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: payload,
      })
      if (!response.ok) throw new Error('Could not sync your programme to your account.')
      if (epoch === accountEpoch.current) lastSaved.current = payload
      if (epoch === accountEpoch.current && version === saveVersion.current) setSyncError('')
    }).catch(() => {
      if (epoch === accountEpoch.current && version === saveVersion.current) setSyncError('Account sync failed. Your latest changes have not been saved online.')
    })
  }, [progress, serverReady, account, getToken, syncAttempt])

  // Cached Strava runs count on read, not as durable manual checkoffs.
  // When the provider's cached records expire, the automatic indicator disappears.
  useEffect(() => {
    if (!account) return
    let cancelled = false
    getToken().then(token => token ? api.me.running(token, true) : []).then(runs => {
      if (!cancelled) setStravaSnapshot({ owner, runs: runs.filter(run => run.source === 'Strava') })
    }).catch(() => { if (!cancelled) setStravaSnapshot({ owner, runs: [] }) })
    return () => { cancelled = true }
  }, [account, getToken, owner])

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
  const resetWeek = () => update(repeatBeginnerWeek(progress))
  return (
    <section className="panel" aria-labelledby="beginner-title">
      <p className="field-help">BEGINNER · NINE WEEKS · THREE SESSIONS PER WEEK</p>
      <h2 id="beginner-title">Couch to 5K</h2>
      <p>Start with gentle run/walk intervals. There are no pace targets. Rest between sessions, and repeat a week if you need to.</p>
      {account && !serverReady && !syncError && <p role="status">Loading your saved programme…</p>}
      {syncError && <div role="alert" className="field-help"><p>{syncError}</p>{account && serverReady && <button type="button" className="button button-quiet" onClick={() => setSyncAttempt(n => n + 1)}>Retry saving progress</button>}</div>}
      <p aria-live="polite"><strong>{confirmed} of 27 sessions confirmed</strong> · {Math.round(confirmed / 27 * 100)}%{recordedUnconfirmed > 0 && <span> · {recordedUnconfirmed} recorded via Strava (not confirmed)</span>}</p>
      <progress value={confirmed} max={27} style={{ width: '100%' }} aria-label="Couch to 5K confirmed workouts" />
      <div className="beginner-tabs" role="group" aria-label="Beginner training views">
        {([['week', 'This week'], ['calendar', 'Calendar'], ['progress', 'Progress']] as const).map(([id, label]) => <button key={id} type="button" className={`beginner-tab${activeTab === id ? ' is-active' : ''}`} aria-pressed={activeTab === id} onClick={() => setActiveTab(id)}>{label}</button>)}
      </div>
      {activeTab === 'week' && <>
      <div className="field">
        <label className="field-label" htmlFor="couch-start">Programme start date</label>
        <input className="input" type="date" id="couch-start" disabled={!!account && !serverReady} value={progress.startedOn}
          onChange={e => { if (e.target.value) update({ ...progress, startedOn: e.target.value }) }} />
      </div>
      <fieldset className="field">
        <legend className="field-label">Your three run days</legend>
        <p className="field-help">Keep a rest day between sessions. Choose your schedule before recording progress.</p>
        <select className="input" aria-label="Choose a three-day running schedule" disabled={!!account && !serverReady} value={progress.days.join('|')} onChange={e => chooseSchedule(e.target.value)}>
          {schedules.map(days => <option key={days.join('|')} value={days.join('|')}>{days.join(' · ')}</option>)}
        </select>
      </fieldset>
      <div className="wizard-nav">
        <button className="button button-quiet" type="button" disabled={progress.week === 1 || (!!account && !serverReady)} onClick={() => update({ ...progress, week: Math.max(1, progress.week - 1) })}>Previous week</button>
        <strong aria-live="polite">Week {progress.week} of 9</strong>
        <button className="button button-quiet" type="button" disabled={progress.week === 9 || (!!account && !serverReady)} onClick={() => update({ ...progress, week: Math.min(9, progress.week + 1) })}>Next week</button>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="button button-quiet" type="button" disabled={!!account && !serverReady} aria-pressed={progress.paused} onClick={() => update(progress.paused ? resumeBeginnerProgress(progress, todayLocal()) : { ...progress, paused: true, pausedOn: todayLocal() })}>
          {progress.paused ? 'Resume programme' : 'Pause programme'}
        </button>
        <button className="button button-quiet" type="button" disabled={!!account && !serverReady} onClick={resetWeek}>Repeat this week (+7 days)</button>
      </div>
      {progress.paused && <p role="status">Paused. Your progress is kept here until you resume.</p>}
      <button className="button button-quiet" type="button" onClick={() => setActiveTab('calendar')}>View all 9 weeks</button>
      <ol className="days">
        {sessions.map(session => {
          const id = sessionId(session, progress.revision)
          const viaStrava = automatic.has(id)
          const checked = progress.completed.includes(id)
          return (
            <li className="day" key={id}>
              <div>
                <strong>Session {session.day} · {beginnerDate(progress, session.week, session.day)}</strong>
                <p className="field-help">5 min brisk walking warm-up</p>
                <p>{beginnerSessionSummary(session)}</p>
                <p className="field-help">5 min walking cool-down · About {Math.round(session.totalSeconds / 60)} minutes total</p>
                {viaStrava && !checked && <p className="beginner-recorded">↗ Recorded via Strava · workout not yet confirmed</p>}
                <label className="session-done">
                  <input type="checkbox" disabled={progress.paused || (!!account && !serverReady)} checked={checked} onChange={() => toggle(id)} />
                  {checked ? '✓ Confirmed complete' : 'Mark this session complete'}
                </label>
              </div>
            </li>
          )
        })}
      </ol>
      </>}
      {activeTab === 'calendar' && <BeginnerCalendar progress={progress} recorded={automatic} onChooseWeek={week => { update({ ...progress, week }); setActiveTab('week') }} />}
      {activeTab === 'progress' && <BeginnerProgressView progress={progress} recorded={automatic} />}
      <p className="field-help">Progress is saved on this device and synchronised to your Taperday account when you're signed in and connected.</p>
      <p className="field-help">After week nine, aim for 30 minutes of comfortable running. That may not yet be 5 km. Build distance gradually; rest or repeat whenever needed.</p>
    </section>
  )
}
