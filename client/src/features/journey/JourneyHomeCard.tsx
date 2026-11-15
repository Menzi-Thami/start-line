import { chapterFor, finishStage, formatClock, isLiveRecovery, recentConclusion, recoveryDayNumber, recoveryWelcome } from './journey-model'
import { MaintenanceCard } from './NextChapter'
import type { JourneyActions, JourneyState } from './useJourney'
import './journey.css'

interface Props {
  journey: { state: JourneyState; actions: JourneyActions }
  today: string
  currentPlanId: string | null
  onOpenPlan: () => void
  onOpenJourney?: (planId?: string) => void
  onOpenRecovery?: (raceId?: string) => void
  onNewRace: () => void
}

/**
 * Home's journey card, when there is one: recovery (day count, today's idea, a one-tap check-in), the next chapter,
 * easy-running maintenance, or the race result still to add. Otherwise nothing, and Home is exactly as before.
 */
export function JourneyHomeCard({ journey, today, currentPlanId, onOpenPlan, onOpenJourney, onOpenRecovery, onNewRace }: Props) {
  if (journey.state.kind !== 'ready') return null
  const { recovery, maintenance } = journey.state.journey
  const chapter = chapterFor(journey.state.journey, currentPlanId)
  const actions = journey.actions

  if (isLiveRecovery(recovery)) {
    const day = recovery.days.find(day => day.date === today)
    return (
      <section className="panel home-card journey-home" aria-label="Your recovery">
        <p className="plan-kicker">Recovery plan · day {Math.max(0, recoveryDayNumber(recovery.raceDate, today))}</p>
        <h2 className="home-card-heading">{recovery.seekCare ? 'Let’s get that checked' : recovery.status === 'Paused' ? 'Recovery paused' : day?.title ?? 'Take it easy today.'}</h2>
        <p role={recovery.seekCare ? 'alert' : undefined}>{recovery.seekCare ? recovery.safetyMessage : day?.guidance ?? 'Rest is always a good choice. Open your recovery plan when you’re ready.'}</p>
        <button type="button" className="button button-primary" onClick={() => (onOpenRecovery ?? onOpenPlan)()}>Open recovery plan</button>
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
        <button type="button" className="button button-primary" onClick={() => (onOpenRecovery ?? onOpenPlan)()}>Choose my next chapter</button>
      </section>
    )
  }
  const concluded = !currentPlanId ? recentConclusion(journey.state.journey, today) : null
  if (concluded) return <section className="panel home-card journey-home" aria-labelledby="journey-home-concluded">
    <p className="plan-kicker">Training concluded</p>
    <h2 id="journey-home-concluded" className="home-card-heading">{concluded.raceName}</h2>
    <p>Your training chapter is saved in Journey.</p>
    {concluded.raceResult?.outcome === 'Finished' && concluded.raceResult.finishTime && <p className="mono">{formatClock(concluded.raceResult.finishTime)} · {concluded.raceResult.timeKind === 'RecordedElapsed' ? 'Recording elapsed time' : concluded.raceResult.timeKind === 'OfficialChip' ? 'Official chip time' : 'Finish time'}</p>}
    <div className="journey-actions">
      <button type="button" className="button button-primary" onClick={() => onOpenJourney ? onOpenJourney(concluded.planId) : onOpenPlan()}>Review my race</button>
      {recoveryWelcome(concluded.raceResult?.outcome) && onOpenRecovery && <button type="button" className="button" onClick={() => onOpenRecovery(concluded.raceResult?.id)}>Start recovery plan</button>}
    </div>
  </section>
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
