import { formatClock, recentConclusion, recoveryOnHome, recoveryWelcome } from './journey-model'
import type { JourneyActions, JourneyState } from './useJourney'
import './journey.css'

interface Props {
  journey: { state: JourneyState; actions: JourneyActions }; today: string; currentPlanId: string | null
  onOpenPlan: () => void; onOpenJourney?: (planId?: string) => void; onOpenRecovery?: (raceId?: string) => void; onNewRace: () => void
}
/** The current post-training priority. It never changes persistence or treats elapsed dates as a confirmed finish. */
export function JourneyHomeCard({ journey, today, currentPlanId, onOpenPlan, onOpenJourney, onOpenRecovery, onNewRace }: Props) {
  if (journey.state.kind !== 'ready' || currentPlanId) return null
  const { recovery, maintenance } = journey.state.journey
  if (recoveryOnHome(recovery, today) && recovery) {
    const day = recovery.days.find(day => day.date === today)
    return <section className="panel home-card journey-home" aria-label="Your recovery">
      <p className="plan-kicker">Recovery plan · day {day?.dayNumber ?? recovery.dayNumber}</p>
      <h2 className="home-card-heading">{recovery.seekCare ? 'Let’s get that checked' : recovery.status === 'Paused' ? 'Recovery paused' : day?.title ?? 'Take it easy today.'}</h2>
      <p role={recovery.seekCare ? 'alert' : undefined}>{recovery.seekCare ? recovery.safetyMessage : day?.guidance ?? 'Rest is always a good choice. Open your recovery plan when you’re ready.'}</p>
      <button type="button" className="button button-primary" onClick={() => (onOpenRecovery ?? onOpenPlan)()}>Open recovery plan</button>
    </section>
  }
  if (maintenance?.status === 'Active') return <section className="panel home-card journey-home" aria-label="Easy running">
    <p className="plan-kicker">Easy running</p><h2 className="home-card-heading">Keep running comfortably.</h2><p>Your easy-running plan is ready whenever you are. Every run is optional.</p>
    <button type="button" className="button button-primary" onClick={() => (onOpenRecovery ?? onOpenPlan)()}>Open easy running</button>
  </section>
  // A finished schedule is not a declaration of physical recovery. No Complete mutation is sent here.
  const concluded = !recovery ? recentConclusion(journey.state.journey, today) ?? journey.state.journey.chapters.find(chapter => chapter.raceDate === today && chapter.raceResult) : null
  if (concluded && !concluded.raceResult) return <section className="panel home-card journey-home" aria-labelledby="journey-home-race">
    <p className="plan-kicker">Training concluded</p><h2 id="journey-home-race" className="home-card-heading">{concluded.raceName}</h2><p>Your training chapter is saved in Journey.</p>
    <button type="button" className="button button-primary" onClick={() => onOpenJourney ? onOpenJourney(concluded.planId) : onOpenPlan()}>Review my race</button>
  </section>
  if (concluded && recoveryWelcome(concluded.raceResult?.outcome) && onOpenRecovery) return <section className="panel home-card journey-home" aria-labelledby="journey-home-finish">
    <p className="plan-kicker">Training concluded</p><h2 id="journey-home-finish" className="home-card-heading">{concluded.raceName}</h2>
    {concluded.raceResult?.finishTime && <p className="mono">{formatClock(concluded.raceResult.finishTime)} · {concluded.raceResult.timeKind === 'OfficialChip' ? 'Official chip time' : concluded.raceResult.timeKind === 'RecordedElapsed' ? 'Recording elapsed time' : 'Finish time'}</p>}
    <p>Your result is saved. Take your next steps gently.</p><button type="button" className="button button-primary" onClick={() => onOpenRecovery(concluded.raceResult!.id)}>Start recovery plan</button>
  </section>
  return <section className="panel home-card journey-home" aria-labelledby="journey-home-next">
    <p className="plan-kicker">{recovery ? 'Your next chapter' : 'Your running'}</p><h2 id="journey-home-next" className="home-card-heading">Ready when you are.</h2>
    <p>{recovery ? 'Your recovery schedule is saved. Take more time, run comfortably, or choose another goal.' : 'Your runs and training chapters stay with you. Choose a goal whenever you’re ready.'}</p>
    <button type="button" className="button button-primary" onClick={() => recovery && onOpenRecovery ? onOpenRecovery() : onNewRace()}>Choose my next challenge</button>
  </section>
}
