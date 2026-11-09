import { useEffect, useId, useState } from 'react'
import { api } from '../../lib/api-client'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { Race } from '../../lib/types'

interface Props {
  units: Units
  /** The slug picked in the race step, if any. */
  selected: string
  /** A searched-for race that's picked, shown even when it's no longer in the results. */
  selectedRace?: Race
  onPick: (race: Race) => void
}

// Each answer remembers the text it was for, so a slow reply to older text never shows against newer text.
type Answer = { query: string; races: Race[] } | { query: string; failed: true }

const MIN_LETTERS = 2
const WAIT_MS = 250

const letters = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, '').length

/**
 * Every other race, found by name or place. The headline races hang on the rack above; this finds the rest of the
 * calendar. Results are radios in the same group as the rack, so keyboards and screen readers pick them the same way.
 */
export function RaceSearch({ units, selected, selectedRace, onPick }: Props) {
  const id = useId()
  const [text, setText] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const query = text.trim()
  const tooShort = letters(query) < MIN_LETTERS

  useEffect(() => {
    if (tooShort) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      api.searchRaces(query, controller.signal)
        .then((races) => setAnswer({ query, races }))
        .catch(() => {
          if (!controller.signal.aborted) setAnswer({ query, failed: true })
        })
    }, WAIT_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, tooShort])

  const current = !tooShort && answer?.query === query ? answer : null
  const failed = current !== null && 'failed' in current
  const shown = current && 'races' in current ? current.races : []
  const status = tooShort ? ''
    : !current ? 'Searching…'
      : failed ? 'Search isn’t available right now. Choose “Another race” to enter it yourself.'
        : shown.length === 0 ? `No upcoming race matches “${query}”. Choose “Another race” to enter it yourself.`
          : `${shown.length} ${shown.length === 1 ? 'race' : 'races'} found.`
  const pickedElsewhere = selectedRace && selectedRace.slug === selected && !shown.some((r) => r.slug === selected) ? selectedRace : null

  const row = (race: Race) => (
    <label className="choice race-search-result" key={race.slug}>
      <input type="radio" name="race" value={race.slug} checked={selected === race.slug} onChange={() => onPick(race)} />
      <span className="choice-name">{race.name}</span>
      <span className="choice-meta">
        {formatDate(race.date, 'long')} · {race.distanceConfirmed ? '' : 'About '}{formatDistance(race.distanceKm, units)} · {race.location}
        {race.dateStatus === 'Provisional' ? ' · date to be confirmed' : ''}
      </span>
    </label>
  )

  return (
    <div className="race-search">
      <label className="field-label" htmlFor={`${id}-q`}>Looking for another race?</label>
      <input
        id={`${id}-q`}
        className="input"
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Search by race or town, e.g. Knysna"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-describedby={`${id}-status`}
      />
      <p id={`${id}-status`} className="field-help" aria-live="polite">{status}</p>
      {(pickedElsewhere || shown.length > 0) && (
        <div className="race-search-results">
          {pickedElsewhere && row(pickedElsewhere)}
          {shown.map(row)}
        </div>
      )}
    </div>
  )
}
