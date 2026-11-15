import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { addDays, formatDate, formatDistance, type Units } from '../../lib/format'
import type { ActivitySummary } from '../../lib/types'
import { formatClock, OUTCOME_WORDS } from './journey-model'
import { personalBests, timeSource } from './race-history-model'
import { RaceResultForm } from './RaceResultForm'
import type { MajorDefinition, MarathonMajor, RaceMemory } from './types'
import type { RaceHistoryStore } from './useRaceHistory'

interface Props {
  store: RaceHistoryStore
  today: string
  units: Units
  selectedMajor: MarathonMajor | null
  selectedRaceId?: string | null
  newMajor: MarathonMajor | null | undefined
  onClearFilter: () => void
  onSaved: (memory: RaceMemory, celebrate: boolean) => void
  onRecovery?: (memory: RaceMemory) => void
}

export function RaceMemories({ store, today, units, selectedMajor, selectedRaceId, newMajor, onClearFilter, onSaved, onRecovery }: Props) {
  const [editing, setEditing] = useState<RaceMemory | 'new' | null>(newMajor !== undefined ? 'new' : null)
  const [year, setYear] = useState('all')
  const [shown, setShown] = useState(20)
  const title = useRef<HTMLHeadingElement>(null)
  if (store.state.kind !== 'ready') return null
  const { races, majors } = store.state.history
  const bests = personalBests(races)
  const years = [...new Set(races.map(memory => memory.result.raceDate.slice(0, 4)))].sort().reverse()
  const filtered = races.filter(memory => (year === 'all' || memory.result.raceDate.startsWith(year)) && (!selectedMajor || memory.major === selectedMajor) && (!selectedRaceId || memory.result.id === selectedRaceId))
  const close = () => { setEditing(null); title.current?.focus() }
  return <section className="race-memories" aria-labelledby="race-memories-title">
    <header className="journey-section-head">
      <div><p className="plan-kicker">THE FINISH LINES YOU REMEMBER</p><h2 id="race-memories-title" ref={title} tabIndex={-1}>Your races.</h2>
        <p>Every distance. Every chapter. Including the races you ran before Taperday.</p></div>
      <button type="button" className="button button-primary" onClick={() => setEditing('new')}>Add a past race</button>
    </header>
    {editing && <RaceMemoryEditor key={editing === 'new' ? `new-${newMajor ?? ''}` : editing.result.id}
      memory={editing === 'new' ? null : editing} initialMajor={editing === 'new' ? newMajor ?? null : editing.major}
      majors={majors} store={store} today={today} units={units} onCancel={close}
      onSaved={(memory) => { onSaved(memory, memory.result.outcome === 'Finished' && (editing === 'new' || editing.result.outcome !== 'Finished')); close() }} />}
    <div className="race-history-filters">
      <label className="field"><span className="field-label">Race year</span><select className="input" value={year} onChange={event => { setYear(event.target.value); setShown(20) }}>
        <option value="all">All years</option>{years.map(value => <option key={value}>{value}</option>)}
      </select></label>
      {(selectedMajor || selectedRaceId) && <button type="button" className="button button-quiet" onClick={onClearFilter}>Show all races</button>}
    </div>
    {filtered.length === 0 ? <div className="journey-empty race-memory-empty"><p>{races.length ? 'No saved races match this view.' : 'Your first finish line belongs here.'}</p>
      <p className="field-help">Save a race you remember, or confirm a result from a training chapter. A finish is always your choice.</p></div>
      : <ol className="race-memory-list" aria-label="Saved races">{filtered.slice(0, shown).map(memory => <li key={memory.result.id} className="race-memory">
        <div className="race-memory-mark" aria-hidden="true">{memory.result.outcome === 'Finished' ? '★' : '↗'}</div>
        <div className="race-memory-body">
          <p className="plan-kicker"><time dateTime={memory.result.raceDate}>{formatDate(memory.result.raceDate, 'long')}</time></p>
          <h3>{memory.eventName}</h3>
          {memory.needsReview && <p className="journey-state">Another saved result describes this event. Review the results and remove the incorrect copy. Your training chapters stay saved; trophies wait until there is one result.</p>}
          <p className="race-memory-outcome">{OUTCOME_WORDS[memory.result.outcome]}{memory.eventDistanceKm != null && <> · {formatDistance(memory.eventDistanceKm, units)} event</>}</p>
          {memory.result.finishTime && <p className="race-memory-clock"><strong className="mono">{formatClock(memory.result.finishTime)}</strong><span>{timeSource(memory)}</span></p>}
          {memory.result.distanceKm != null && <p className="field-help">Distance covered: {formatDistance(memory.result.distanceKm, units)}</p>}
          {bests.has(memory.result.id) && <p className="race-memory-pb">Personal best · saved chip times</p>}
          {memory.major && !memory.majorEligible && !memory.needsReview && memory.result.outcome === 'Finished' && <p className="field-help">Your finish is saved. This edition predates eligibility for the Majors collection.</p>}
          {memory.result.note && <p className="race-memory-note">{memory.result.note}</p>}
          <p className="field-help">{memory.result.planId ? 'Saved with your training chapter' : 'A race from your own running history'}</p>
          <div className="journey-actions"><button type="button" className="button button-quiet" onClick={() => setEditing(memory)} aria-label={`Edit result for ${memory.eventName}`}>Edit result</button>
            {onRecovery && memory.result.outcome !== 'DidNotStart' && memory.result.raceDate >= addDays(today, -60) && <button type="button" className="button button-quiet" onClick={() => onRecovery(memory)}>Plan recovery</button>}
          </div>
        </div>
      </li>)}</ol>}
    {filtered.length > shown && <button type="button" className="button" onClick={() => setShown(shown + 20)}>Show more races</button>}
  </section>
}

function RaceMemoryEditor({ memory, initialMajor, majors, store, today, units, onCancel, onSaved }: {
  memory: RaceMemory | null; initialMajor: MarathonMajor | null; majors: MajorDefinition[]; store: RaceHistoryStore; today: string; units: Units
  onCancel: () => void; onSaved: (memory: RaceMemory) => void
}) {
  const auth = useAuth()
  const id = useId()
  const [recordId] = useState(() => memory?.result.id ?? crypto.randomUUID())
  const [major, setMajor] = useState<MarathonMajor | ''>(initialMajor ?? '')
  const selected = majors.find(definition => definition.id === major)
  const [name, setName] = useState(memory?.eventName ?? selected?.name ?? '')
  const [date, setDate] = useState(memory?.result.raceDate ?? '')
  const [distance, setDistance] = useState(String(memory?.eventDistanceKm ?? (selected ? 42.195 : '')))
  const [stage, setStage] = useState<'event' | 'result'>('event')
  const [error, setError] = useState<string | null>(null)
  const [runs, setRuns] = useState<ActivitySummary[] | undefined>()
  const [recordingId, setRecordingId] = useState('')
  const chosenRecording = runs?.find(run => run.id === recordingId)
  const heading = useRef<HTMLHeadingElement>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  useEffect(() => {
    let current = true
    heading.current?.focus()
    auth.getToken().then(token => current && token ? api.me.activities(token) : undefined).then(value => { if (current) setRuns(value) }).catch(() => { /* Results can be recorded without imported evidence. */ })
    return () => { current = false }
  }, [auth])
  const next = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !date || date > today || date < '1900-01-01' || !Number.isFinite(Number(distance)) || Number(distance) < .1 || Number(distance) > 400) {
      setError('Give the race a name, a past date and a distance between 0.1 and 400 km.'); return
    }
    setError(null); setStage('result')
  }
  return <section className="race-memory-editor" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} ref={heading} tabIndex={-1}>{memory ? 'Correct your race memory' : 'Save a race to your journey'}</h3>
    {stage === 'event' ? <form aria-label="Race details" onSubmit={next}>
      {!memory && runs?.some(run => run.kind === 'Run' || run.kind === 'TrailRun') && <label className="field" htmlFor={`${id}-recording`}>
        <span className="field-label" id={`${id}-recording-label`}>Use a recorded run (optional)</span>
        <select id={`${id}-recording`} aria-labelledby={`${id}-recording-label`} className="input" value={recordingId} onChange={event => {
          setRecordingId(event.target.value)
          const run = runs.find(value => value.id === event.target.value)
          if (run) setDate(run.localDate)
        }}><option value="">Choose a recording, or enter the race yourself</option>
          {runs.filter(run => run.kind === 'Run' || run.kind === 'TrailRun').map(run => <option key={run.id} value={run.id}>{formatDate(run.localDate, 'long')} · {formatDistance(run.distanceKm, units)} · {run.source.kind}</option>)}
        </select>
        <span className="field-help">Its date is filled in here. Its actual distance and elapsed time are loaded when you confirm the result.</span>
      </label>}
      <label className="field"><span className="field-label">Event collection</span><select className="input" value={major} onChange={event => {
        const nextMajor = majors.find(definition => definition.id === event.target.value)
        setMajor(nextMajor?.id ?? '')
        if (nextMajor) { setName(nextMajor.name); setDistance('42.195') }
      }}><option value="">Any race</option>{majors.map(definition => <option value={definition.id} key={definition.id}>{definition.name}</option>)}</select></label>
      <label className="field"><span className="field-label">Race name</span><input className="input" value={name} maxLength={120} required onChange={event => { setName(event.target.value); setMajor('') }} /></label>
      <div className="race-event-fields">
        <label className="field"><span className="field-label">Event date</span><input className="input" type="date" value={date} min="1900-01-01" max={today} required onChange={event => { setDate(event.target.value); if (chosenRecording?.localDate !== event.target.value) setRecordingId('') }} /></label>
        <label className="field"><span className="field-label">Event distance (km)</span><input className="input mono" inputMode="decimal" value={distance} required onChange={event => { setDistance(event.target.value); setMajor('') }} /></label>
      </div>
      <p className="field-help">This is the event distance. You can keep a recording’s actual distance and elapsed time separately when confirming the result.</p>
      <div className="journey-actions"><button type="submit" className="button">Continue to result</button><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button></div>
    </form> : <>
      <p className="race-memory-editor-event">{name} · {formatDate(date, 'long')} · {formatDistance(Number(distance), units)}</p>
      {runs === undefined && <p className="field-help" role="status">Recordings are unavailable or still loading. You can save the result yourself.</p>}
      <RaceResultForm chapter={{ raceName: name, raceDate: date, distanceKm: Number(distance), startDate: '1900-01-01', raceResult: memory?.result ?? null }}
        startEditing={!!memory} today={today} units={units} runs={chosenRecording ? [chosenRecording] : runs}
        onLoadActivity={async activityId => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to load this recording.'); return api.me.activity(token, activityId) }}
        onSave={async body => {
          const saved = await store.save(recordId, { eventName: name.trim(), eventDistanceKm: Number(distance), raceDate: body.raceDate ?? date,
            outcome: body.outcome, finishTime: body.finishTime, distanceKm: body.distanceKm, activityId: body.activityId, note: body.note,
            major: major || null, timeKind: body.timeKind ?? 'Unspecified', expectedVersion: body.expectedVersion })
          onSaved(saved)
          return saved.result
        }} onDelete={async () => { if (memory) await store.remove(memory); onCancel() }} />
      <div className="journey-actions"><button type="button" className="button button-quiet" onClick={() => setStage('event')}>Change event details</button><button type="button" className="button button-quiet" onClick={onCancel}>Close</button></div>
    </>}
    {memory && <div className="race-memory-remove">
      {!confirmRemove ? <button type="button" className="link-button journey-link" onClick={() => setConfirmRemove(true)}>Remove this race result</button> : <>
        <p>Remove this result and its finisher trophy? Your training chapter and recovery stay saved.</p>
        <div className="journey-actions"><button type="button" className="button" disabled={removing} onClick={async () => {
          if (removing) return
          setRemoving(true); setError(null)
          try { await store.remove(memory); onCancel() } catch (reason) { setError(reason instanceof Error ? reason.message : 'The result couldn’t be removed.') }
          finally { setRemoving(false) }
        }}>{removing ? 'Removing…' : 'Remove result and trophy'}</button><button type="button" className="button button-quiet" disabled={removing} onClick={() => setConfirmRemove(false)}>Keep race result</button></div>
      </>}
    </div>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>
}
