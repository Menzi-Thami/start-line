import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { apiOrigin } from '../../lib/api-client'
import { beginnerDate, countCompleted, parseBeginnerProgress, type BeginnerProgress } from '../beginner/beginner-progress'
import { couchTo5k } from '../beginner/couch-to-5k'

/** A read-only glimpse of an account's beginner journey on Home.
 * Race plans remain separate; this does not pretend beginner workouts are race-plan sessions.
 */
export function BeginnerHomeCard({ today, onOpenProgramme }: { today: string; onOpenProgramme: () => void }) {
  const { account, getToken } = useAuth()
  const [loaded, setLoaded] = useState<{ owner: string; value: BeginnerProgress | null } | null>(null)
  const owner = account?.homeAccountId ?? account?.localAccountId ?? account?.username ?? ''
  useEffect(() => {
    if (!account) return
    let cancelled = false
    getToken().then(async token => {
      if (!token) return
      const response = await fetch(`${apiOrigin()}/api/v1/me/beginner`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      })
      if (!response.ok) return
      const value = response.status === 204 ? null : parseBeginnerProgress(JSON.stringify(await response.json()), today)
      if (!cancelled) setLoaded({ owner, value })
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [account, getToken, owner, today])

  const progress = loaded?.owner === owner ? loaded.value : null
  if (!progress) return null
  const sessions = couchTo5k()
  const done = countCompleted(progress, sessions)
  const upcoming = sessions.filter(session => session.week === progress.week &&
    !progress.completed.includes(`${progress.revision}:${session.week}:${session.day}`))
    .map(session => ({ session, date: beginnerDate(progress, session.week, session.day) }))
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  return (
    <section className="panel home-card" aria-labelledby="beginner-home-heading">
      <p className="field-help">YOUR BEGINNER JOURNEY</p>
      <h2 id="beginner-home-heading" className="home-card-heading">Couch to 5K</h2>
      <p><strong>Week {progress.week} of 9</strong> · {done} of 27 workouts completed</p>
      <progress value={done} max={27} style={{ width: '100%' }} aria-label="Beginner programme completion" />
      {progress.paused
        ? <p>Paused — your progress is saved. Resume whenever you're ready.</p>
        : upcoming ? <p>Next: {upcoming.date} · Run/walk session {upcoming.session.day}</p>
          : <p>All sessions in this week are checked off. Nice work.</p>}
      <button type="button" className="button button-quiet" onClick={onOpenProgramme}>Open Couch to 5K</button>
    </section>
  )
}
