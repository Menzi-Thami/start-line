import { useRef, useState } from 'react'
import { formatDistance, type Units } from '../../lib/format'
import type { Activity, ActivitySummary, DayOfWeek, TrainingPlan } from '../../lib/types'
import { FinishLineFilm } from './FinishLineFilm'
import { achievement, chapterFor, finishStage, formatClock, isLiveRecovery, owedCelebration, recoveryFor, recoveryWelcome } from './journey-model'
import { MaintenanceCard, NextChapter } from './NextChapter'
import { RaceResultForm } from './RaceResultForm'
import { RecoveryDashboard, RecoveryOffer } from './Recovery'
import { storyFromChapter, storyFromLocal, type LocalSummary } from './journey-story'
import { TrainingStory } from './TrainingStory'
import type { Achievement } from './types'
import type { JourneyActions, JourneyState } from './useJourney'
import './journey.css'

const DECLINED = (planId: string) => `taperday:recovery-declined:${planId}`
const readDeclined = (planId: string) => { try { return localStorage.getItem(DECLINED(planId)) === '1' } catch { return false } }
const writeDeclined = (planId: string, value: boolean) => { try { if (value) localStorage.setItem(DECLINED(planId), '1'); else localStorage.removeItem(DECLINED(planId)) } catch { /* Only means the offer shows again. */ } }

const LOCAL_SEEN = (plan: TrainingPlan) => `taperday:finish-line:v1:${plan.race.name}|${plan.race.date}|${plan.startDate}`
const localSeen = (plan: TrainingPlan) => { try { return localStorage.getItem(LOCAL_SEEN(plan)) === 'seen' } catch { return true } }
const rememberLocal = (plan: TrainingPlan) => { try { localStorage.setItem(LOCAL_SEEN(plan), 'seen') } catch { /* It may play once more. */ } }

type Film = { kind: 'training' | 'race'; award: Achievement | null; trigger?: HTMLElement }

interface Props {
  plan: TrainingPlan
  today: string
  units: Units
  /** The saved plan this is, when signed in; absent for a plan from a link or signed out. */
  planId?: string | null
  journey?: { state: JourneyState; actions: JourneyActions }
  local: LocalSummary
  runs?: readonly ActivitySummary[]
  onLoadActivity?: (id: string) => Promise<Activity>
  runDays: DayOfWeek[]
  onNewRace?: () => void
  onOpenRacePrep?: () => void
  onSignIn?: () => void
}

/**
 * The plan's journey section: the Finish Line and training story, race day and its result, recovery and the next
 * chapter. Signed in, everything comes from the account and is the same on every device; signed out, only this
 * device's ticks are known, so it says so and offers nothing it can't keep.
 */
export function JourneyPanel({ plan, today, units, planId, journey, local, runs, onLoadActivity, runDays, onNewRace, onOpenRacePrep, onSignIn }: Props) {
  const signedIn = !!planId && !!journey && journey.state.kind !== 'off'
  const ready = journey?.state.kind === 'ready' ? journey.state.journey : null
  const chapter = chapterFor(ready, planId)
  const recovery = recoveryFor(ready, planId)
  const [chosen, setFilm] = useState<Film | null>(null)
  const [dismissed, setDismissed] = useState<readonly string[]>([])
  const [seenHere] = useState(() => localSeen(plan))
  const [declined, setDeclined] = useState(() => (planId ? readDeclined(planId) : false))
  const [manualOffer, setManualOffer] = useState(false)
  const storyRef = useRef<HTMLDivElement>(null)
  const raceRef = useRef<HTMLDivElement>(null)
  const trainingDetails = useRef<HTMLDetailsElement>(null)

  // The film plays once per award per runner (the server remembers), or once per device when signed out. Replays are
  // the runner's own choice.
  const owed = owedCelebration(chapter)
  const owedFilm: Film | null = signedIn
    ? owed && !dismissed.includes(owed.id) ? { kind: owed.kind === 'RaceFinished' ? 'race' : 'training', award: owed } : null
    : local.earned && !seenHere && !dismissed.includes('device') ? { kind: 'training', award: null } : null
  const film = chosen ?? owedFilm

  const closeFilm = () => {
    if (film?.award && !film.award.celebratedAt) void journey?.actions.celebrated(film.award.id).catch(() => undefined)
    if (!signedIn) rememberLocal(plan)
    setDismissed(previous => [...previous, film?.award?.id ?? 'device'])
    setFilm(null)
  }
  const toStory = () => {
    closeFilm()
    const target = film?.kind === 'race' ? raceRef : storyRef
    if (film?.kind !== 'race' && trainingDetails.current) trainingDetails.current.open = true
    window.requestAnimationFrame(() => {
      target.current?.focus({ preventScroll: true })
      target.current?.scrollIntoView?.({ block: 'start' })
    })
  }

  if (signedIn && journey?.state.kind === 'loading') return null
  if (chapter?.detailsUnavailable) return <section className="callout" aria-label="Your finish line">
    <p>This older plan’s race details are unavailable. Your saved results and achievements are retained in your running journey.</p>
  </section>
  if (signedIn && journey?.state.kind === 'error') {
    return local.visible ? (
      <section className="journey-panel panel" aria-label="Your finish line">
        <p className="field-error" role="alert">Your running journey couldn’t load: {journey.state.message}</p>
        <button type="button" className="button" onClick={journey.actions.refresh}>Try again</button>
      </section>
    ) : null
  }

  const stage = chapter ? finishStage(chapter, today) : null
  const show = signedIn ? !!chapter && (stage !== 'training' || isLiveRecovery(recovery)) : local.visible
  if (!show) return null

  const story = chapter ? storyFromChapter(chapter, local.provisional) : storyFromLocal(plan, local)
  const result = chapter?.raceResult ?? null
  const trainingAward = achievement(chapter, 'TrainingComplete')
  const raceAward = achievement(chapter, 'RaceFinished')
  const earned = signedIn ? !!trainingAward : local.earned
  const liveRecovery = isLiveRecovery(recovery) ? recovery : null
  const finishedRecovery = recovery && !liveRecovery ? recovery : null
  const metrics = film?.kind === 'race' && result
    ? [formatClock(result.finishTime) && { value: formatClock(result.finishTime)!, label: 'Finish time' }, result.distanceKm != null && { value: formatDistance(result.distanceKm, units), label: 'Distance' }].filter(Boolean) as { value: string; label: string }[]
    : [
        { value: `${story.confirmedRuns}`, label: 'Training runs confirmed' },
        { value: `${story.weeks}`, label: 'Weeks' },
        story.recordedKm !== null ? { value: formatDistance(story.recordedKm, units), label: 'Recorded distance' } : null,
      ].filter(Boolean) as { value: string; label: string }[]

  const next = journey && (
    <NextChapter
      runDays={runDays}
      onMaintenance={(body) => journey.actions.startMaintenance(body)}
      onNewRace={onNewRace}
      onMoreRecovery={recovery ? () => void journey.actions.changeRecovery(recovery.id, { action: recovery.status === 'Completed' || recovery.status === 'Ended' ? 'Restart' : 'Extend', extendDays: 7, expectedVersion: recovery.version }) : undefined}
    />
  )

  const raceStage = stage === 'race-day' || stage === 'race-result-needed' || stage === 'race-recorded'
  const training = <TrainingStory
    story={story} units={units} raceResult={result}
    onReplay={earned ? (trigger) => setFilm({ kind: 'training', award: trainingAward, trigger }) : undefined}
  />

  const resultForm = signedIn && chapter && journey && (stage === 'race-day' || stage === 'race-result-needed' || stage === 'race-recorded') && (
    <div className="panel journey-race-summary" ref={raceRef} tabIndex={-1}>
      <RaceResultForm
        key={chapter.planId}
        chapter={chapter}
        today={today}
        units={units}
        runs={runs}
        onLoadActivity={onLoadActivity}
        onSave={(body) => journey.actions.saveRaceResult(chapter.planId, body)}
        onDelete={() => journey.actions.deleteRaceResult(chapter.planId)}
        onCelebrate={raceAward ? (trigger) => setFilm({ kind: 'race', award: raceAward, trigger }) : undefined}
      />
    </div>
  )

  return (
    <section className={`journey-panel${raceStage ? ' is-race' : ''}`} aria-label="Your finish line">
      {film && (
        <FinishLineFilm
          variant={film.kind}
          heading={film.kind === 'race' ? 'RACE FINISHED.' : 'YOU DID IT.'}
          lede={film.kind === 'race'
            ? `You crossed the finish line of ${plan.race.name}.`
            : today < plan.race.date ? 'The training is done. Race day is next.' : 'Every planned training run, confirmed.'}
          raceName={plan.race.name}
          metrics={metrics}
          primaryLabel={film.kind === 'race' ? 'Review my race' : 'See my training story'}
          onPrimary={toStory}
          onClose={closeFilm}
          returnFocus={() => film.trigger ?? (film.kind === 'race' ? raceRef.current : storyRef.current)}
        />
      )}

      {!raceStage && <header className="journey-head panel">
        <p className="plan-kicker">Taperday · Finish line</p>
        <h2 className="journey-title">
          {earned ? 'Training complete.' : 'Your training chapter.'}
        </h2>
        <p className="journey-lede">
          {earned
            ? 'Every planned training run is confirmed. That work is yours to keep.'
            : 'Here is what you confirmed along the way. Runs that weren’t logged aren’t counted as done.'}
        </p>
        {earned && <ul className="journey-badges" aria-label="Achievements"><li className="is-earned">✓ Training complete</li></ul>}
      </header>}

      {journey?.state.kind === 'ready' && journey.state.refreshFailed && <p className="field-help" role="status">Showing your saved journey. Updates couldn’t load. <button type="button" className="button button-quiet" onClick={journey.actions.refresh}>Try again</button></p>}
      {resultForm}

      <div className={`journey-grid${raceStage ? ' is-race' : ''}`}>
        {!raceStage && <div className="journey-main panel" ref={storyRef} tabIndex={-1}>{training}</div>}

        <div className="journey-side">
          {stage === 'training-complete' && (
            <section className="panel journey-race-ahead" aria-label="Race day is next">
              <p className="plan-kicker">Race day is next</p>
              <h3 className="journey-subtitle">Training done. The race is still ahead.</h3>
              <p>Keep the last runs easy, sleep well and get your kit ready. Your race result comes after race day, from you.</p>
              {onOpenRacePrep && <button type="button" className="button" onClick={onOpenRacePrep}>Race-week checklist</button>}
            </section>
          )}

          {!signedIn && today >= plan.race.date && (
            <section className="panel" aria-label="Race result">
              <h3 className="journey-subtitle">How did race day go?</h3>
              <p>Race results, recovery plans and your running journey are kept with an account, so they’re safe on every device. This plan lives on this device only.</p>
              {onSignIn && <button type="button" className="button button-primary" onClick={onSignIn}>Sign in to save your result</button>}
            </section>
          )}

          {signedIn && journey && liveRecovery && (
            <div className="panel">
              <RecoveryDashboard
                recovery={liveRecovery}
                today={today}
                onCheckIn={(feeling, redFlags) => journey.actions.checkIn(liveRecovery.id, { feeling, redFlags, date: today })}
                onChange={(change) => journey.actions.changeRecovery(liveRecovery.id, change)}
              />
            </div>
          )}

          {signedIn && journey && chapter && !recovery && recoveryWelcome(result?.outcome) && (!declined || manualOffer) && (
            <section className="panel journey-rest" aria-label="After your race">
              <p className="plan-kicker">Next · recovery</p>
              <h3 className="journey-subtitle">Rest comes first.</h3>
              <p>Take it easy. A gentle recovery plan is here whenever you want it.</p>
              <details className="journey-recovery-details">
              <summary>Plan my recovery</summary>
              <RecoveryOffer
                planId={chapter.planId}
                eventName={chapter.raceName}
                distanceKm={result?.distanceKm ?? chapter.distanceKm}
                raceDate={result?.raceDate ?? chapter.raceDate}
                today={today}
                runDays={runDays}
                onStart={(body) => journey.actions.startRecovery(body)}
                onDecline={() => { if (planId) writeDeclined(planId, true); setDeclined(true); setManualOffer(false) }}
              />
              </details>
            </section>
          )}
          {signedIn && chapter && !recovery && recoveryWelcome(result?.outcome) && declined && !manualOffer && (
            <section className="panel" aria-label="Recovery">
              <p>No recovery plan. Rest as you like; it’s here if you want one.</p>
              <button type="button" className="button" onClick={() => { setManualOffer(true); if (planId) writeDeclined(planId, false) }}>Plan my recovery</button>
            </section>
          )}

          {signedIn && journey && finishedRecovery && !ready?.maintenance && (
            <div className="panel">
              <RecoveryDashboard recovery={finishedRecovery} today={today} onCheckIn={() => Promise.resolve()} onChange={(change) => journey.actions.changeRecovery(finishedRecovery.id, change)} next={next} />
            </div>
          )}
          {signedIn && journey && !recovery && result && !recoveryWelcome(result.outcome) && !ready?.maintenance && <div className="panel">{next}</div>}
          {signedIn && journey && !recovery && result && recoveryWelcome(result.outcome) && declined && !manualOffer && !ready?.maintenance && <div className="panel">{next}</div>}

          {signedIn && journey && ready?.maintenance && ready.maintenance.status === 'Active' && (
            <div className="panel">
              <MaintenanceCard maintenance={ready.maintenance} today={today} onEnd={() => journey.actions.endMaintenance()} onNewRace={onNewRace} />
            </div>
          )}
        </div>
        {raceStage && <details className="journey-training panel" ref={trainingDetails}>
          <summary>Training story <span>{story.confirmedRuns} confirmed runs · {story.weeks} weeks</span></summary>
          <div className="journey-main" ref={storyRef} tabIndex={-1}>{training}</div>
        </details>}
      </div>
    </section>
  )
}
