import { useEffect, useRef, useState } from 'react'
import { addDays, formatDistance, type Units } from '../../lib/format'
import { Runner } from '../shared/Runner'
import { FinishLineFilm } from './FinishLineFilm'
import { formatClock, isLiveRecovery } from './journey-model'
import { MaintenanceCard, NextChapter } from './NextChapter'
import { RaceMemories } from './RaceMemories'
import { RecoveryDashboard, RecoveryOffer } from './Recovery'
import { RunningJourney } from './RunningJourney'
import { TrophyCabinet } from './TrophyCabinet'
import type { MarathonMajor, RaceMemory } from './types'
import { useJourney } from './useJourney'
import { useRaceHistory } from './useRaceHistory'
import './journey.css'

type Section = 'training' | 'races' | 'cabinet'
const sectionFromUrl = (): Section => {
  const section = new URLSearchParams(window.location.search).get('section')
  return section === 'races' || section === 'cabinet' ? section : 'training'
}

export function JourneyPage({ today, units, onNewRace, onArchived }: { today: string; units: Units; onNewRace: () => void; onArchived: () => void }) {
  const races = useRaceHistory()
  const journey = useJourney(true)
  const [section, setSection] = useState<Section>(sectionFromUrl)
  const [selectedMajor, setSelectedMajor] = useState<MarathonMajor | null>(null)
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null)
  const [newMajor, setNewMajor] = useState<MarathonMajor | null | undefined>()
  const [celebrate, setCelebrate] = useState<RaceMemory | null>(null)
  const [manualRecovery, setManualRecovery] = useState(false)
  const [recoveryRace, setRecoveryRace] = useState<RaceMemory | null>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const recoveryOffer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (recoveryRace && !celebrate) {
      recoveryOffer.current?.scrollIntoView?.({ block: 'start' })
      recoveryOffer.current?.focus()
    }
  }, [recoveryRace, celebrate])
  useEffect(() => {
    const read = () => { setSection(sectionFromUrl()); setSelectedMajor(null); setSelectedRaceId(null); setNewMajor(undefined) }
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [])
  const pick = (next: Section) => {
    setSection(next)
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'journey'); url.searchParams.set('section', next)
    if (url.href !== window.location.href) window.history.pushState(null, '', url)
  }
  const recovery = journey.state.kind === 'ready' ? journey.state.journey.recovery : null
  const maintenance = journey.state.kind === 'ready' ? journey.state.journey.maintenance : null
  const closeFilm = () => { setCelebrate(null); title.current?.focus() }
  return <div className="journey-page">
    <header className="journey-page-hero">
      <div><p className="plan-kicker">THE MILES STAY WITH YOU.</p><h1 ref={title} tabIndex={-1}>Your journey.</h1>
        <p>Your training chapters. Your finish lines. Everything you’ve earned along the way.</p></div>
      <Runner pose="victory" size={100} />
    </header>
    <nav className="journey-sections" aria-label="Journey sections">
      {([['training', 'Training chapters'], ['races', 'Your races'], ['cabinet', 'Trophy cabinet']] as const).map(([id, label]) =>
        <button type="button" key={id} aria-current={section === id ? 'page' : undefined} onClick={() => { setSelectedMajor(null); setSelectedRaceId(null); setNewMajor(undefined); pick(id) }}>{label}</button>)}
    </nav>
    {isLiveRecovery(recovery) && <section className="journey-page-recovery" aria-label="Your recovery">
      <RecoveryDashboard recovery={recovery} today={today} compact
        onCheckIn={(feeling, redFlags) => journey.actions.checkIn(recovery.id, { feeling, redFlags, date: today })}
        onChange={change => journey.actions.changeRecovery(recovery.id, change)} />
    </section>}
    {section === 'training' && <RunningJourney units={units} today={today} onArchived={onArchived} />}
    {section !== 'training' && races.state.kind === 'loading' && <p role="status" className="journey-state">Loading your races and trophies…</p>}
    {section !== 'training' && races.state.kind === 'error' && <div role="alert" className="journey-state"><p>{races.state.message}</p><button type="button" className="button" onClick={races.refresh}>Try again</button></div>}
    {races.state.kind === 'ready' && <>
      {section !== 'training' && races.state.refreshFailed && <div className="journey-state" role="status"><p>Showing your races as last loaded. The latest changes couldn’t be fetched.</p><button type="button" className="button" onClick={races.refresh}>Retry race history</button></div>}
      {section === 'races' && <RaceMemories key={`${newMajor ?? 'all'}|${selectedMajor ?? ''}|${selectedRaceId ?? ''}`} store={races} today={today} units={units}
        selectedMajor={selectedMajor} selectedRaceId={selectedRaceId} newMajor={newMajor}
        onClearFilter={() => { setSelectedMajor(null); setSelectedRaceId(null); setNewMajor(undefined) }}
        onRecovery={journey.state.kind === 'ready' && !isLiveRecovery(recovery) ? setRecoveryRace : undefined}
        onSaved={(memory, earned) => {
          setNewMajor(undefined)
          if (earned) setCelebrate(memory)
          if (memory.result.outcome !== 'DidNotStart' && memory.result.raceDate >= addDays(today, -60)) setRecoveryRace(memory)
        }} />}
      {section === 'cabinet' && <TrophyCabinet history={races.state.history} units={units} onMajor={(major, earned) => {
        setSelectedMajor(earned ? major.id : null); setSelectedRaceId(null); setNewMajor(earned ? undefined : major.id); pick('races')
      }} onRace={race => { setSelectedMajor(null); setSelectedRaceId(race.result.id); setNewMajor(undefined); pick('races') }} />}
    </>}
    {maintenance?.status === 'Active' && <MaintenanceCard maintenance={maintenance} today={today} compact onEnd={journey.actions.endMaintenance} />}
    {!isLiveRecovery(recovery) && recovery?.status === 'Completed' && !maintenance && <NextChapter runDays={[]} onMaintenance={journey.actions.startMaintenance} onNewRace={onNewRace}
      onMoreRecovery={() => setManualRecovery(true)} />}
    {manualRecovery && <RecoveryOffer today={today} runDays={[]} onStart={async body => { await journey.actions.startRecovery(body); setManualRecovery(false) }} onDecline={() => setManualRecovery(false)} />}
    {recoveryRace && !celebrate && !isLiveRecovery(recovery) && recoveryRace.eventDistanceKm != null && <div ref={recoveryOffer} tabIndex={-1}><RecoveryOffer
      today={today} runDays={[]} planId={recoveryRace.result.planId ?? undefined} eventName={recoveryRace.eventName}
      distanceKm={recoveryRace.eventDistanceKm} raceDate={recoveryRace.result.raceDate}
      onStart={async body => { await journey.actions.startRecovery(body); setRecoveryRace(null) }} onDecline={() => setRecoveryRace(null)} /></div>}
    {celebrate && <FinishLineFilm variant="race" heading="RACE FINISHED." raceName={celebrate.eventName} lede={`You crossed the finish line of ${celebrate.eventName}. This one stays with you.`}
      metrics={[...(celebrate.result.finishTime ? [{ value: formatClock(celebrate.result.finishTime) ?? '', label: celebrate.result.timeKind === 'OfficialChip' ? 'Official chip time' : celebrate.result.timeKind === 'RecordedElapsed' ? 'Recording elapsed time' : 'Finish time' }] : []),
        ...(celebrate.eventDistanceKm != null ? [{ value: formatDistance(celebrate.eventDistanceKm, units), label: 'Event distance' }] : [])]}
      primaryLabel="Back to my journey" onPrimary={closeFilm} onClose={closeFilm} returnFocus={() => title.current} />}
  </div>
}
