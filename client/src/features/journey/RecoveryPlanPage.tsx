import { useState } from 'react'
import { formatDate, type Units } from '../../lib/format'
import { Runner } from '../shared/Runner'
import { isLiveRecovery, recoveryOnHome, recoveryWelcome } from './journey-model'
import { MaintenanceCard, NextChapter } from './NextChapter'
import { RecoveryDashboard, RecoveryOffer } from './Recovery'
import { useRaceHistory } from './useRaceHistory'
import type { useJourney } from './useJourney'
import './journey.css'

export function RecoveryPlanPage({ journey, today, onNewRace, onOpenJourney, onOpenTraining }: {
  journey: ReturnType<typeof useJourney>; today: string; units: Units
  onNewRace: () => void; onOpenJourney: () => void; onOpenTraining?: () => void
}) {
  const data = journey.state.kind === 'ready' ? journey.state.journey : null
  const existing = data?.recovery ?? null
  const maintaining = data?.maintenance?.status === 'Active' && !recoveryOnHome(existing, today)
  const wanted = new URLSearchParams(window.location.search).get('race')
  const chapter = data?.chapters.find(chapter => recoveryWelcome(chapter.raceResult?.outcome) && (!wanted || chapter.raceResult?.id === wanted))
  const races = useRaceHistory(!maintaining && !chapter?.raceResult && (!existing || !!wanted))
  const [error, setError] = useState<string | null>(null)
  const recorded = races.state.kind === 'ready' ? races.state.history.races.filter(race => recoveryWelcome(race.result.outcome) && !race.needsReview) : []
  const memory = wanted ? recorded.find(race => race.result.id === wanted) : recorded[0]
  const result = memory?.result ?? chapter?.raceResult
  const source = result ? {
    planId: result.planId, eventName: memory?.eventName ?? chapter?.raceName ?? '',
    distanceKm: result.distanceKm ?? memory?.eventDistanceKm ?? chapter?.distanceKm,
    raceDate: result.raceDate,
    runDays: [] as import('../../lib/types').DayOfWeek[],
  } : null
  // A completed recovery from a different event must not replace the race the runner just opened.
  const recovery = existing && (!wanted || isLiveRecovery(existing)
    || result?.planId != null && existing.planId === result.planId
    || result && existing.planId === null && existing.raceDate === result.raceDate && existing.eventName === source?.eventName) ? existing : null
  const actions = journey.actions
  if (journey.state.kind === 'loading') return <p role="status">Loading your recovery plan…</p>
  if (journey.state.kind === 'error') return <section className="panel" role="alert"><p>{journey.state.message}</p><button type="button" className="button" onClick={actions.refresh}>Try again</button></section>
  const next = <NextChapter runDays={recovery?.runDays ?? []} onMaintenance={actions.startMaintenance} onNewRace={onNewRace}
    onMoreRecovery={recovery ? () => {
      setError(null)
      void actions.changeRecovery(recovery.id, { action: 'Restart', expectedVersion: recovery.version })
        .catch(reason => setError(reason instanceof Error ? reason.message : 'Recovery couldn’t restart. Try again.'))
    } : undefined} />
  return <section className="recovery-plan-page" aria-labelledby="recovery-plan-title">
    <header className="recovery-plan-header">
      <div><p className="plan-kicker">{maintaining ? 'KEEP RUNNING COMFORTABLY' : 'YOUR NEXT CHAPTER'}</p><h1 id="recovery-plan-title">{maintaining ? 'Your easy-running plan.' : 'Your recovery plan.'}</h1>
        <p>{maintaining ? 'An easy rhythm, on your own days.' : recovery ? `${recovery.eventName} · ${formatDate(recovery.raceDate, 'dayMonth')} onwards` : 'Training has concluded. Recovery has its own pace.'}</p></div>
      <Runner pose={maintaining ? 'sprint' : 'sleep'} size={80} />
    </header>
    {journey.state.kind === 'ready' && journey.state.refreshFailed && <p role="status" className="field-help">Showing your saved recovery. Updates couldn’t load. <button type="button" className="button button-quiet" onClick={actions.refresh}>Try again</button></p>}
    {!maintaining && recovery && <div className="panel"><RecoveryDashboard key={recovery.id} recovery={recovery} today={today}
      onCheckIn={(feeling, redFlags) => actions.checkIn(recovery.id, { feeling, redFlags, date: today })}
      onChange={change => actions.changeRecovery(recovery.id, change)}
      next={!recoveryOnHome(recovery, today) && !data?.maintenance ? next : undefined} />
      <details className="recovery-plan-calendar"><summary>View recovery days</summary><ol aria-label="Recovery plan days">
        {recovery.days.map(day => <li key={day.date} aria-current={day.date === today ? 'date' : undefined}>
          <time dateTime={day.date}>{formatDate(day.date, 'dayMonth')}</time><div><strong>{day.title}</strong><p>{day.guidance}</p></div>
        </li>)}
      </ol></details>
    </div>}
    {!maintaining && !recovery && source?.distanceKm != null && <div className="panel"><RecoveryOffer key={result?.id} today={today} {...source} onStart={actions.startRecovery} /></div>}
    {error && <p role="alert" className="field-error">{error}</p>}
    {!maintaining && !recovery && !chapter?.raceResult && races.state.kind === 'loading' && <p role="status">Finding your saved race…</p>}
    {!maintaining && !recovery && !chapter?.raceResult && races.state.kind === 'error' && <section className="panel" role="alert">
      <p>{races.state.message}</p><button type="button" className="button" onClick={races.refresh}>Try again</button>
    </section>}
    {!maintaining && !recovery && !source && races.state.kind === 'ready' && <section className="panel">
      <h2 className="journey-subtitle">Ready when you are.</h2>
      <p>Recovery starts from a saved race. Review your race, or add one you ran outside Taperday under Races &amp; trophies.</p>
      <button type="button" className="button button-primary" onClick={onOpenJourney}>Review my race</button>
    </section>}
    {maintaining && data?.maintenance && <div className="panel"><MaintenanceCard maintenance={data.maintenance} today={today} onEnd={actions.endMaintenance} onNewRace={onNewRace} /></div>}
    <div className="journey-actions">
      <button type="button" className="button button-quiet" onClick={onOpenJourney}>View my journey</button>
      {onOpenTraining && <button type="button" className="button button-quiet" onClick={onOpenTraining}>View training plan</button>}
    </div>
  </section>
}
