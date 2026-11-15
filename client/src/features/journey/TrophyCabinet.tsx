import { useMemo } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import { AchievementShare } from './AchievementShare'
import { distanceBadge, formatClock } from './journey-model'
import type { CardContent } from './share-card'
import type { MajorDefinition, MarathonMajor, RaceHistory, RaceMemory } from './types'
import { SA_RACES, southAfricanFinish, type SouthAfricanRace } from './sa-races'

const LANDMARKS: Record<MarathonMajor, string> = {
  Tokyo: 'M29 55h42M32 60h36M38 55v28M62 55v28M37 70h26M48 43h4v10',
  Boston: 'M28 79h44M33 79V61h34v18M30 61h40L50 48zM41 67v12M50 67v12M59 67v12',
  London: 'M34 82V58h9V47h14v11h9v24M43 61h14M43 67h14M50 40v7M47 52h6',
  Berlin: 'M27 61h46M30 56h40M34 61v21M43 61v21M57 61v21M66 61v21M27 82h46M44 50h12',
  Chicago: 'M29 82V64h12v18M43 82V48h15v34M60 82V57h11v25M48 48v-6M53 48v-9',
  NewYork: 'M44 83l3-24h7l3 24M50 59V48l7-8M54 45l5 4M35 83h30M47 56l-9 5M49 48l-4-7',
  Sydney: 'M24 80h52M29 76l6-23 15 23M40 76l13-31 10 31M56 76l10-21 8 21',
  CapeTown: 'M24 79l11-16 6 3 4-12h20l4 14 8 11M45 54h20M27 84h49',
}

function Medal({ major, earned }: { major: MarathonMajor; earned: boolean }) {
  return <svg className={`cabinet-medal${earned ? ' is-earned' : ''}`} viewBox="0 0 100 128" aria-hidden="true">
    <path className="cabinet-ribbon" d="M27 5h18l14 43-17 8zM55 5h18L58 56l-17-8z" />
    <circle className="cabinet-disc" cx="50" cy="72" r="38" />
    <circle className="cabinet-ring" cx="50" cy="72" r="31" />
    <path className="cabinet-city" d={LANDMARKS[major]} />
    <path className="cabinet-star" d="m50 91 2 4 5 1-4 3 1 4-4-2-4 2 1-4-4-3 5-1z" />
  </svg>
}

export function TrophyCabinet({ history, units, onMajor, onRace, onLocalRace }: {
  history: RaceHistory; units: Units; onMajor: (major: MajorDefinition, earned: boolean) => void; onRace: (race: RaceMemory) => void
  onLocalRace?: (race: SouthAfricanRace) => void
}) {
  const finishes = useMemo(() => history.races.filter(race => race.result.outcome === 'Finished' && !race.needsReview), [history.races])
  const earned = new Set(finishes.filter(race => race.majorEligible).map(race => race.major))
  const original = history.majors.filter(major => major.originalSix)
  const originalCount = original.filter(major => earned.has(major.id)).length
  const earnedCount = history.majors.filter(major => earned.has(major.id)).length
  const card = useMemo<CardContent>(() => earnedCount === 0 ? {
    kicker: 'TAPERDAY · TROPHY CABINET', heading: 'EVERY FINISH COUNTS', raceName: finishes.length === 1 ? finishes[0]!.eventName : 'Every finish has a story.',
    stats: [{ value: String(finishes.length), label: 'Race finishes confirmed' },
      ...(finishes.every(race => race.eventDistanceKm != null) ? [{ value: formatDistance(finishes.reduce((sum, race) => sum + (race.eventDistanceKm ?? 0), 0), units), label: 'Combined event distance' }] : []),
      { value: String(new Set(finishes.map(race => race.result.raceDate.slice(0, 4))).size), label: 'Years with a finish' }],
    footer: 'MY PERSONAL COLLECTION · taperday.run',
  } : {
    kicker: 'TAPERDAY · TROPHY CABINET', heading: 'EARNED IN MILES.', raceName: 'My Marathon Majors collection',
    stats: [{ value: `${earnedCount}/${history.majors.length}`, label: 'Major events finished' }],
    medals: history.majors.map(major => ({ label: major.city, earned: finishes.some(race => race.major === major.id && race.majorEligible) })),
    footer: `${finishes.length} RACE FINISHES · MY COLLECTION · taperday.run`,
  }, [earnedCount, finishes, history.majors, units])
  return <section className="trophy-cabinet" aria-labelledby="cabinet-title">
    <header className="cabinet-heading">
      <p className="plan-kicker">NO TWO FINISH LINES FEEL THE SAME.</p>
      <h2 id="cabinet-title">Earned in miles.</h2>
      <p>Your trophy cabinet. Every confirmed finish has a place here.</p>
      <dl className="cabinet-totals"><div><dt>Race finishes</dt><dd>{finishes.length}</dd></div><div><dt>Major events</dt><dd>{earnedCount}<span>/{history.majors.length}</span></dd></div><div><dt>Original six</dt><dd>{originalCount}<span>/{original.length}</span></dd></div></dl>
    </header>
    {history.races.some(race => race.needsReview) && <p className="journey-state" role="status">Some older races have more than one saved result. Review them in Your races and remove the incorrect copies. They earn no cabinet trophies until resolved.</p>}
    <div className="cabinet-collection-head"><h3>South African finish lines</h3><p className="field-help">From local favourites to ultras. These are places for your confirmed finishes, not automatically awarded medals.</p></div>
    <ul className="cabinet-grid" aria-label="South African race collection">
      {SA_RACES.map(event => {
        const finish = southAfricanFinish(event, finishes)
        return <li key={event.id}><button type="button" className={`cabinet-slot${finish ? ' is-earned' : ''}`}
          disabled={!finish && !onLocalRace} onClick={() => finish ? onRace(finish) : onLocalRace?.(event)}>
          <span className="cabinet-local-icon" aria-hidden="true">{finish ? '★' : '◇'}</span>
          <strong>{event.name}</strong><span className="cabinet-slot-status">{event.place} · {formatDistance(event.distanceKm, units)}</span>
          <span className="cabinet-slot-action">{finish ? `Finished · ${finish.result.raceDate.slice(0, 4)} · View result` : 'Link a recorded finish'}</span>
        </button></li>
      })}
    </ul>
    <div className="cabinet-collection-head"><h3>Marathon Majors</h3><p className="field-help">One medal per event. Every edition you finish stays with it.</p></div>
    <ul className="cabinet-grid" aria-label="Marathon Majors collection">
      {history.majors.map(major => {
        const races = finishes.filter(race => race.major === major.id && race.majorEligible)
        return <li key={major.id}><button type="button" className={`cabinet-slot${races.length ? ' is-earned' : ''}`}
          onClick={() => onMajor(major, races.length > 0)}>
          <Medal major={major.id} earned={races.length > 0} />
          <strong>{major.city}</strong>{' '}<span className="cabinet-slot-status">{races[0] ? `Finished · ${races[0].result.raceDate.slice(0, 4)}${races.length > 1 ? ` · ${races.length} times` : ''}` : 'A finish still to come'}</span>{' '}
          <span className="cabinet-slot-action">{races.length ? 'View finishes' : 'Record a finish'}</span>
        </button></li>
      })}
    </ul>
    <p className="field-help cabinet-explainer">Your personal collection, based on results you confirm. It does not verify official Abbott World Marathon Majors stars. Sydney counts from 2025 and Cape Town from 2026; earlier finishes remain in your race history.</p>
    {finishes.length > 0 && <AchievementShare card={card} text={`My Taperday trophy cabinet: ${finishes.length} race ${finishes.length === 1 ? 'finish' : 'finishes'}.${earnedCount ? ` ${earnedCount} of ${history.majors.length} Major events: ${history.majors.filter(major => earned.has(major.id)).map(major => major.city).join(', ')}.` : ''} Every finish is a beginning. #Taperday`} fileName="taperday-trophy-cabinet" />}
    <div className="cabinet-collection-head"><h3>Every finish counts</h3><p className="field-help">The local 5K. Your first half. The ultra you still talk about.</p></div>
    {finishes.length === 0 ? <div className="journey-empty"><p>Your first medal starts with a race you confirm.</p><p className="field-help">Add a past race, or record the result from one of your training chapters.</p></div>
      : <ul className="cabinet-finishes" aria-label="All race finishes">{finishes.map(race => <li key={race.result.id}>
        <button type="button" className="cabinet-finish" onClick={() => onRace(race)}>
          <span className="cabinet-finish-icon" aria-hidden="true">★</span><span><strong>{race.eventName}</strong><span>{formatDate(race.result.raceDate, 'dayMonth')} {race.result.raceDate.slice(0, 4)}{race.eventDistanceKm != null && <> · {distanceBadge(race.eventDistanceKm)}</>}</span></span>
          <span className="mono">{formatClock(race.result.finishTime) ?? (race.eventDistanceKm != null ? formatDistance(race.eventDistanceKm, units) : 'Finished')}</span>
        </button>
      </li>)}</ul>}
  </section>
}
