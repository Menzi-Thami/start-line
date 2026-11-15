import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { ActivitySummary } from '../../lib/types'
import { SA_RACES, likelyEditionRecording, type SouthAfricanRace } from './sa-races'
import type { RaceMemory } from './types'

/** Optional suggestion from an imported recording, never an automatically awarded race. */
export function RecordedRaceSuggestions({ saved, today, units, onPick }: {
  saved: readonly RaceMemory[]; today: string; units: Units; onPick: (race: SouthAfricanRace) => void
}) {
  const auth = useAuth()
  const [runs, setRuns] = useState<ActivitySummary[]>([])
  useEffect(() => {
    let mounted = true
    auth.getToken().then(token => token ? api.me.activities(token) : []).then(value => {
      if (mounted) setRuns(value)
    }).catch(() => { /* This suggestion is optional; manual race history stays available. */ })
    return () => { mounted = false }
  }, [auth])
  const candidates = SA_RACES.flatMap(event => {
    const run = likelyEditionRecording(event, runs, saved)
    return run && 'editionDate' in event && event.editionDate <= today ? [{ event, run }] : []
  })
  if (candidates.length === 0) return null
  return <section className="race-recording-suggestions" aria-label="Possible races from your runs">
    <p className="plan-kicker">FROM YOUR RECORDED RUNS</p>
    <h3>A finish line worth checking.</h3>
    {candidates.map(({ event, run }) => <div key={event.id} className="race-recording-suggestion">
      <div><strong>Possible {event.name}</strong>
        <p>{formatDate(run.localDate, 'long')} · {formatDistance(run.distanceKm, units)} · {run.source.kind}</p>
        <p className="field-help">The event date and distance match a recording. Only you can confirm you ran this race.</p>
      </div>
      <button type="button" className="button button-primary" onClick={() => onPick(event)}>Review recorded race</button>
    </div>)}
  </section>
}
