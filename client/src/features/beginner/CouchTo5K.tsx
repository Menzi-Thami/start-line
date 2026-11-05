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
  const [progressOwner, setProgressOwner] = useState('anonymous')
  const [transferCandidate, setTransferCandidate] = useState<BeginnerProgress | null>(null)
  const [serverReady, setServerReady] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [syncAttempt, setSyncAttempt] = useState(0)
  const [stravaSnapshot, setStravaSnapshot] = useState<{ owner: string; runs: readonly BeginnerRecordedRun[] } | null>(null)
  const [activeTab, setActiveTab] = useState<'week' | 'calendar' | 'progress'>('week')
  const [evaluationTime] = useState(() => Date.now())
  const saveVersion = useRef(0)
  const lastSaved = useRef('')
  const saveQueue = useRef(Promise.resolve())
  const accountEpoch = useRef(0)
  const owner = account?.email ?? account?.name ?? ''
  const sessions = programme.filter(s => s.week === progress.week)
  const automatic = matchBeginnerStrava(progress, programme, stravaSnapshot && stravaSnapshot.owner === owner ? stravaSnapshot.runs : [], evaluationTime)
  const confirmed = programme.filter(s => progress.completed.includes(sessionId(s, progress.revision))).length
  const recordedUnconfirmed = programme.filter(s => !progress.completed.includes(sessionId(s, progress.revision)) && automatic.has(sessionId(s, progress.revision))).length
  const update = (next: BeginnerProgress) => { if (!account || (serverReady && progressOwner === owner)) setProgress(next) }
  useEffect(() => {
    if (account || progressOwner !== 'anonymous') return // Signed-in state must never spill into anonymous localStorage.
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)) }
    catch { /* Private browsing / restricted storage: continue in memory */ }
  }, [progress, account, progressOwner])

  // A signed-in runner's server state is canonical. Device state remains a
  // fallback when not signed in; never overwrite the account before hydration.
  useEffect(() => {
    let cancelled = false
    const epoch = ++accountEpoch.current
    if (!account) {
      void Promise.resolve().then(() => {
        if (!cancelled) { setServerReady(false); setProgress(read()); setProgressOwner('anonymous'); setTransferCandidate(null); setSyncError('') }
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
        const today = todayLocal()
        const loaded = response.status === 204 ? defaultBeginnerProgress(today) : parseBeginnerProgress(JSON.stringify(await response.json()), today)
        // A new account may offer to import this device's anonymous programme.
        // Never silently replace saved server progress or overwrite another account.
        let rawLocal: string | null = null
        if (response.status === 204) {
          try { rawLocal = window.localStorage.getItem(STORAGE_KEY) }
          catch { /* Storage may be blocked; account hydration must still work. */ }
        }
        const local = rawLocal ? parseBeginnerProgress(rawLocal, today) : null
        const transfer = local && JSON.stringify(local) !== JSON.stringify(defaultBeginnerProgress(today)) ? local : null
        setTransferCandidate(transfer)
        setProgress(loaded)
        setProgressOwner(owner)
        lastSaved.current = JSON.stringify(loaded)
        setServerReady(true)
      }
    }).catch(() => { if (!cancelled) setSyncError('Your account progress could not be loaded. Check your connection before marking sessions complete.') })
    return () => { cancelled = true }
  }, [account, getToken, owner])

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
    <section className="beginner-journey" aria-labelledby="beginner-title">
      <div className="beginner-hero">
        <div className="beginner-hero-top">
          <span className="beginner-hero-kicker">START SMALL. GO FAR.</span>
          <span className="beginner-hero-weeks">9-week journey</span>
        </div>
        <h2 id="beginner-title">Couch to 5K</h2>
        <p>Your first 5K starts here. Run a little. Walk a little. Get stronger every week. No pace pressure.</p>
        <div className="beginner-hero-metrics" aria-live="polite">
          <div><strong>{confirmed}<span> / 27</span></strong><small>Workouts confirmed</small></div>
          <div><strong>{progress.week}<span> / 9</span></strong><small>Current week</small></div>
          <div><strong>{Math.round(confirmed / 27 * 100)}%</strong><small>Your progress</small></div>
        </div>
        <div className="beginner-hero-track" role="progressbar" aria-label="Couch to 5K confirmed workouts" aria-valuemin={0} aria-valuemax={27} aria-valuenow={confirmed}>
          <span style={{ width: `${confirmed / 27 * 100}%` }} />
        </div>
      </div>
      {account && !serverReady && !syncError && <p role="status">Loading your saved programme…</p>}
      {syncError && <div role="alert" className="field-help"><p>{syncError}</p>{account && serverReady && progressOwner === owner && <button type="button" className="button button-quiet" onClick={() => setSyncAttempt(n => n + 1)}>Retry saving progress</button>}</div>}
      {account && serverReady && progressOwner === owner && transferCandidate && <div className="panel" role="status"><p>You have a Couch to 5K programme saved on this device. Move it to your account?</p><button type="button" className="button button-quiet" onClick={() => { update(transferCandidate); setTransferCandidate(null) }}>Move my programme</button><button type="button" className="button button-quiet" onClick={() => setTransferCandidate(null)}>Keep account programme</button></div>}
      {recordedUnconfirmed > 0 && <p className="beginner-recorded-summary" role="status">{recordedUnconfirmed} run{recordedUnconfirmed === 1 ? '' : 's'} recorded via Strava · confirm the sessions when you're ready.</p>}
      <div className="beginner-tabs" role="group" aria-label="Beginner training views">
        {([['week', 'This week'], ['calendar', 'Calendar'], ['progress', 'Progress']] as const).map(([id, label]) => <button key={id} type="button" className={`beginner-tab${activeTab === id ? ' is-active' : ''}`} aria-pressed={activeTab === id} onClick={() => setActiveTab(id)}>{label}</button>)}
      </div>
      {activeTab === 'week' && <>
      <details className="beginner-settings">
        <summary>Adjust your start date and running days</summary>
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
      </details>
      <div className="beginner-week-heading">
        <div><p className="beginner-section-eyebrow">YOUR TRAINING THIS WEEK</p><h3>Week {progress.week}</h3><p className="field-help">Three runs, with recovery time in between.</p></div>
        <button className="button button-quiet" type="button" onClick={() => setActiveTab('calendar')}>All 9 weeks</button>
      </div>
      <div className="beginner-week-controls">
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
      <ol className="beginner-session-list">
        {sessions.map(session => {
          const id = sessionId(session, progress.revision)
          const viaStrava = automatic.has(id)
          const checked = progress.completed.includes(id)
          return (
            <li className={`beginner-session-card${checked ? ' is-complete' : ''}`} key={id}>
              <div className="beginner-session-top">
                <span className="beginner-session-index">0{session.day}</span>
                <span className="beginner-session-status">{checked ? '✓ Confirmed' : viaStrava ? '↗ Recorded' : 'Planned'}</span>
              </div>
              <h4>Run {session.day}</h4>
              <p className="beginner-session-date">{beginnerDate(progress, session.week, session.day)}</p>
              <p className="beginner-session-duration">{Math.round(session.totalSeconds / 60)} <span>minutes · walk + run</span></p>
              <div className="beginner-session-workout">
                <p><strong>Warm up</strong><span>5 min brisk walk</span></p>
                <p><strong>Your intervals</strong><span>{beginnerSessionSummary(session)}</span></p>
                <p><strong>Cool down</strong><span>5 min easy walk</span></p>
              </div>
              {viaStrava && !checked && <p className="beginner-recorded">↗ Recorded via Strava · workout not yet confirmed</p>}
              <label className="beginner-complete-toggle">
                <input type="checkbox" disabled={progress.paused || (!!account && !serverReady)} checked={checked} onChange={() => toggle(id)} />
                <span>{checked ? 'Workout confirmed' : 'Mark workout complete'}</span>
              </label>
            </li>
          )
        })}
      </ol>
      </>}
      {activeTab === 'calendar' && <BeginnerCalendar progress={progress} recorded={automatic} onChooseWeek={week => { update({ ...progress, week }); setActiveTab('week') }} />}
      {activeTab === 'progress' && <BeginnerProgressView progress={progress} recorded={automatic} />}
      <p className="beginner-footnote">Your check-ins are saved on this device and synced to your Taperday account when signed in.</p>
      <p className="beginner-footnote">Every pace counts. After week nine, aim for 30 minutes of comfortable running—even if 5 km takes longer.</p>
    </section>
  )
}
