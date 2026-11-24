import { useEffect, useRef, useState } from 'react'
import { formatDistance, type Units } from '../../lib/format'
import { Runner } from '../shared/Runner'
import { FinishLineFilm } from './FinishLineFilm'
import { formatClock, isLiveRecovery } from './journey-model'
import { RaceMemories } from './RaceMemories'
import { RunningJourney } from './RunningJourney'
import { TrophyCabinet } from './TrophyCabinet'
import type { SouthAfricanRace } from './sa-races'
import type { MarathonMajor, RaceMemory } from './types'
import { useJourney } from './useJourney'
import { useRaceHistory } from './useRaceHistory'
import './journey.css'

// Two sections: training chapters, and races with the trophy cabinet beneath them. Older links to the separate cabinet
// (section=cabinet) open the combined section.
type Section = 'training' | 'races'
const sectionFromUrl = (): Section => {
  const section = new URLSearchParams(window.location.search).get('section')
  return section === 'races' || section === 'cabinet' ? 'races' : 'training'
}
/** Bring the race list into view after a trophy opens a race, its filter or a new-race form. */
const showRaceList = () => window.requestAnimationFrame(() => document.getElementById('race-memories-title')?.scrollIntoView?.({ block: 'start' }))

export function JourneyPage({ today, units, onArchived, onOpenRecovery, journey: shared }: { today: string; units: Units; onNewRace: () => void; onArchived: () => void; onOpenRecovery?: (raceId?: string) => void; journey?: ReturnType<typeof useJourney> }) {
  const races = useRaceHistory()
  // The app's own journey when it has one, as Home uses: a second copy only read the same chapters again.
  const own = useJourney(!shared)
  const journey = shared ?? own
  const [section, setSection] = useState<Section>(sectionFromUrl)
  const [selectedMajor, setSelectedMajor] = useState<MarathonMajor | null>(null)
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null)
  const [newMajor, setNewMajor] = useState<MarathonMajor | null | undefined>()
  const [newLocal, setNewLocal] = useState<SouthAfricanRace | null>(null)
  const [celebrate, setCelebrate] = useState<RaceMemory | null>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const openRecovery = (raceId?: string) => {
    if (onOpenRecovery) onOpenRecovery(raceId)
    else window.location.assign(`?view=recovery${raceId ? `&race=${encodeURIComponent(raceId)}` : ''}`)
  }
  useEffect(() => {
    const read = () => { setSection(sectionFromUrl()); setSelectedMajor(null); setSelectedRaceId(null); setNewMajor(undefined); setNewLocal(null) }
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
  const closeFilm = () => { setCelebrate(null); title.current?.focus() }
  return <div className="journey-page">
    <header className="journey-page-hero">
      <div><p className="plan-kicker">THE MILES STAY WITH YOU.</p><h1 ref={title} tabIndex={-1}>Your journey.</h1>
        <p>Your training chapters. Your finish lines. Everything you’ve earned along the way.</p></div>
      <Runner pose="victory" size={100} />
    </header>
    <nav className="journey-sections" aria-label="Journey sections">
      {([['training', 'Training chapters'], ['races', 'Races & trophies']] as const).map(([id, label]) =>
        <button type="button" key={id} aria-current={section === id ? 'page' : undefined} onClick={() => { setSelectedMajor(null); setSelectedRaceId(null); setNewMajor(undefined); setNewLocal(null); pick(id) }}>{label}</button>)}
    </nav>
    {isLiveRecovery(recovery) && <section className="journey-state" aria-label="Your recovery">
      <p>Your recovery has its own plan.</p><button type="button" className="button" onClick={() => openRecovery()}>Open recovery plan</button>
    </section>}
    {section === 'training' && <RunningJourney units={units} today={today} onArchived={onArchived} onOpenRecovery={openRecovery} />}
    {section !== 'training' && races.state.kind === 'loading' && <p role="status" className="journey-state">Loading your races and trophies…</p>}
    {section !== 'training' && races.state.kind === 'error' && <div role="alert" className="journey-state"><p>{races.state.message}</p><button type="button" className="button" onClick={races.refresh}>Try again</button></div>}
    {races.state.kind === 'ready' && <>
      {section !== 'training' && races.state.refreshFailed && <div className="journey-state" role="status"><p>Showing your races as last loaded. The latest changes couldn’t be fetched.</p><button type="button" className="button" onClick={races.refresh}>Retry race history</button></div>}
      {section === 'races' && <RaceMemories key={`${newMajor ?? 'all'}|${selectedMajor ?? ''}|${selectedRaceId ?? ''}|${newLocal?.id ?? ''}`} newLocal={newLocal} store={races} today={today} units={units}
        selectedMajor={selectedMajor} selectedRaceId={selectedRaceId} newMajor={newMajor}
        onClearFilter={() => { setSelectedMajor(null); setSelectedRaceId(null); setNewMajor(undefined); setNewLocal(null) }}
        onRecovery={journey.state.kind === 'ready' && !isLiveRecovery(recovery) ? memory => openRecovery(memory.result.id) : undefined}
        onSaved={(memory, earned) => {
          setNewMajor(undefined); setNewLocal(null)
          if (earned) setCelebrate(memory)
        }} />}
      {section === 'races' && <TrophyCabinet history={races.state.history} units={units} onLocalRace={local => { setNewMajor(undefined); setSelectedMajor(null); setSelectedRaceId(null); setNewLocal(local); showRaceList() }} onMajor={(major, earned) => {
        setSelectedMajor(earned ? major.id : null); setSelectedRaceId(null); setNewMajor(earned ? undefined : major.id); showRaceList()
      }} onRace={race => { setSelectedMajor(null); setSelectedRaceId(race.result.id); setNewMajor(undefined); showRaceList() }} />}
    </>}
    {celebrate && <FinishLineFilm variant="race" heading="RACE FINISHED." raceName={celebrate.eventName} lede={`You crossed the finish line of ${celebrate.eventName}. This one stays with you.`}
      metrics={[...(celebrate.result.finishTime ? [{ value: formatClock(celebrate.result.finishTime) ?? '', label: celebrate.result.timeKind === 'OfficialChip' ? 'Official chip time' : celebrate.result.timeKind === 'RecordedElapsed' ? 'Recording elapsed time' : 'Finish time' }] : []),
        ...(celebrate.eventDistanceKm != null ? [{ value: formatDistance(celebrate.eventDistanceKm, units), label: 'Event distance' }] : [])]}
      primaryLabel="Back to my journey" onPrimary={closeFilm} onClose={closeFilm} returnFocus={() => title.current} />}
  </div>
}
