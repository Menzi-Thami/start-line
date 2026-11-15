import { chapterFor, finishStage, isLiveRecovery } from './journey-model'
import { MaintenanceCard } from './NextChapter'
import { RecoveryDashboard } from './Recovery'
import type { JourneyActions, JourneyState } from './useJourney'
import './journey.css'

interface Props {
  journey: { state: JourneyState; actions: JourneyActions }
  today: string
  currentPlanId: string | null
  onOpenPlan: () => void
  onOpenJourney?: () => void
  onNewRace: () => void
}

/**
 * Home's journey card, when there is one: recovery (day count, today's idea, a one-tap check-in), the next chapter,
 * easy-running maintenance, or the race result still to add. Otherwise nothing, and Home is exactly as before.
 */
export function JourneyHomeCard({ journey, today, currentPlanId, onOpenPlan, onOpenJourney, onNewRace }: Props) {
  if (journey.state.kind !== 'ready') return null
  const { recovery, maintenance } = journey.state.journey
  const chapter = chapterFor(journey.state.journey, currentPlanId)
  const actions = journey.actions

  if (isLiveRecovery(recovery)) {
    return (
      <section className="panel home-card journey-home" aria-label="Your recovery">
        <RecoveryDashboard recovery={recovery} today={today} compact
          onCheckIn={(feeling, redFlags) => actions.checkIn(recovery.id, { feeling, redFlags, date: today })}
          onChange={(change) => actions.changeRecovery(recovery.id, change)} />
        <button type="button" className="button" onClick={onOpenJourney ?? onOpenPlan}>Open my recovery</button>
      </section>
    )
  }
  if (maintenance?.status === 'Active') {
    return (
      <section className="panel home-card journey-home" aria-label="Easy running">
        <MaintenanceCard maintenance={maintenance} today={today} compact onEnd={() => actions.endMaintenance()} />
        <button type="button" className="button button-quiet" onClick={onNewRace}>Train for another race</button>
      </section>
    )
  }
  if (recovery?.status === 'Completed' && (!currentPlanId || !recovery.planId || recovery.planId === currentPlanId)) {
    return (
      <section className="panel home-card journey-home" aria-labelledby="journey-home-next">
        <p className="plan-kicker">Recovered</p>
        <h2 id="journey-home-next" className="home-card-heading">What’s next?</h2>
        <p>Keep running comfortably, train for another race, or take more time. Nothing changes until you choose.</p>
        <button type="button" className="button button-primary" onClick={onOpenJourney ?? onOpenPlan}>Choose my next chapter</button>
      </section>
    )
  }
  if (!chapter) return null
  const stage = finishStage(chapter, today)
  if (stage === 'race-result-needed' || stage === 'race-day') {
    return (
      <section className="panel home-card journey-home" aria-labelledby="journey-home-race">
        <p className="plan-kicker">{chapter.raceName}</p>
        <h2 id="journey-home-race" className="home-card-heading">Your race result</h2>
        <p>We’ll look for your recorded run and fill in the details.</p>
        <button type="button" className="button button-primary" onClick={onOpenPlan}>Review my race</button>
      </section>
    )
  }
  if (stage === 'training-complete') {
    return (
      <section className="panel home-card journey-home" aria-labelledby="journey-home-done">
        <p className="plan-kicker">Finish line</p>
        <h2 id="journey-home-done" className="home-card-heading">Training complete. Race day is next.</h2>
        <p>Every planned training run is confirmed.</p>
        <button type="button" className="button" onClick={onOpenPlan}>See my training story</button>
      </section>
    )
  }
  return null
}
