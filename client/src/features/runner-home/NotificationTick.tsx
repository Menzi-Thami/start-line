import { useState } from 'react'
import type { TrainingPlan } from '../../lib/types'
import { CheckInCard } from '../coaching/CheckInCard'
import { StravaCompletion } from '../coaching/StravaCompletion'
import { completedViaStrava } from '../coaching/strava-completion'
import type { SessionCoach } from '../coaching/useCheckIns'

const dayName = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' })

/** The session a "ran it?" notification opened Home on (`tick=2026-10-20.Tempo`), if any. */
function tickFromUrl(): { date: string; type: string } | null {
  const [date, type] = (new URLSearchParams(window.location.search).get('tick') ?? '').split('.')
  return date && type ? { date, type } : null
}

/**
 * The session a "ran it?" notification was about, when it isn't today's (today's is on the Today card): completed via
 * Strava with "Keep this tick", then the usual check-in once it's ticked.
 */
export function NotificationTick({ plan, today, coach }: { plan: TrainingPlan | null; today: string; coach?: SessionCoach }) {
  const [wanted] = useState(tickFromUrl)
  const [ticked, setTicked] = useState(false)
  const session = wanted && plan?.weeks.flatMap((w) => w.sessions).find((s) => s.date === wanted.date && s.type === wanted.type)
  if (!session || !coach || session.date === today || !(ticked || completedViaStrava(session, coach))) return null
  return (
    <section className="panel home-card" aria-labelledby="home-tick">
      <h2 id="home-tick" className="home-card-heading">
        {dayName.format(new Date(`${session.date}T00:00:00Z`))}’s {session.title}
      </h2>
      {ticked ? (
        <>
          <p>Ticked off. It counts towards your running now.</p>
          <CheckInCard session={session} coach={coach} />
        </>
      ) : (
        <StravaCompletion session={session} coach={coach} onTicked={() => setTicked(true)} />
      )}
    </section>
  )
}

