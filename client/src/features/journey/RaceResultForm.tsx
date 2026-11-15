import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { formatDate, formatDistance, formatDuration, toTimeSpan, type Units } from '../../lib/format'
import type { Activity, ActivitySummary } from '../../lib/types'
import { raceMatches } from './race-match'
import { clockSeconds, formatClock, OUTCOME_WORDS, versusGoalWords } from './journey-model'
import type { PlanChapter, RaceOutcome, RaceResult, RaceTimeKind, SaveRaceResult } from './types'

export type RaceResultContext = Pick<PlanChapter, 'raceName' | 'raceDate' | 'startDate' | 'distanceKm' | 'raceResult'>

interface Props {
  chapter: RaceResultContext
  today: string
  units: Units
  /** Recorded runs around race day, to link one if the runner wants. Never picked for them. */
  runs?: readonly ActivitySummary[]
  /** Load the original evidence so elapsed (not moving) time is used when suggesting a finish. */
  onLoadActivity?: (id: string) => Promise<Activity>
  onSave: (body: SaveRaceResult) => Promise<RaceResult>
  onDelete: () => Promise<void>
  onCelebrate?: (trigger: HTMLElement) => void
  startEditing?: boolean
}

type Draft = { outcome: RaceOutcome; hours: string; minutes: string; seconds: string; distance: string; date: string; activityId: string; note: string; expectedVersion: string | null; timeKind: RaceTimeKind }

const draftFrom = (chapter: RaceResultContext, today: string, outcome: RaceOutcome = 'Finished'): Draft => {
  const result = chapter.raceResult
  const total = clockSeconds(result?.finishTime) ?? null
  const raceDate = chapter.raceDate && chapter.raceDate <= today ? chapter.raceDate : today
  return {
    outcome: result?.outcome ?? outcome,
    hours: total === null ? '' : String(Math.floor(total / 3600)),
    minutes: total === null ? '' : String(Math.floor((total % 3600) / 60)),
    seconds: total === null ? '' : String(total % 60),
    distance: result?.distanceKm != null ? String(result.distanceKm) : chapter.distanceKm != null ? String(chapter.distanceKm) : '',
    date: result?.raceDate ?? raceDate,
    activityId: result?.activityId ?? '',
    note: result?.note ?? '',
    expectedVersion: result?.version ?? null,
    timeKind: result?.timeKind ?? 'Unspecified',
  }
}

/**
 * "How did race day go?": the runner says whether they finished, didn't finish or didn't start, with their time if they
 * like. A race date passing is never taken as a finish, and a recorded run is never matched to the race by itself.
 * A synced recording can be proposed with one tap to confirm, but never marks a runner as a finisher without consent.
 * Saving can be edited or undone, and a failed save keeps everything typed.
 */
export function RaceResultForm({ chapter, today, units, runs = [], onLoadActivity, onSave, onDelete, onCelebrate, startEditing = false }: Props) {
  const id = useId()
  // What this form last saved or removed, until the reloaded journey brings the server's own copy.
  // It's dropped as soon as the server's copy changes, so a reload always wins.
  const serverVersion = chapter.raceResult?.version ?? null
  const [local, setLocal] = useState<{ result: RaceResult | null; over: string | null } | null>(null)
  const saved = local && local.over === serverVersion ? local.result : chapter.raceResult
  const [mode, setMode] = useState<'ask' | 'form' | 'later' | 'saved'>(startEditing ? 'form' : saved ? 'saved' : 'ask')
  const [draft, setDraft] = useState<Draft>(() => draftFrom(chapter, today))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [selectedRecording, setSelectedRecording] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const raceDay = draft.date
  const candidates = runs.filter(run => run.kind !== 'Other' && run.localDate === raceDay)
  const suggestions = !saved && chapter.raceDate && chapter.raceDate <= today ? raceMatches(chapter, runs) : []
  // Even two near-identical recordings can be separate runs. Ask the runner to choose, never infer a duplicate.
  const suggested = suggestions.length === 1 ? suggestions[0] : suggestions.find(run => run.id === selectedRecording)
  const found = suggestions.length > 0 && !!onLoadActivity

  const fromRecording = async (run: ActivitySummary, review = false, linkOnly = false) => {
    if (busy || !onLoadActivity) return
    setBusy(true)
    setError(null)
    try {
      const activity = await onLoadActivity(run.id)
      if (!mounted.current) return
      if (activity.id !== run.id || activity.localDate !== run.localDate
        || activity.kind !== run.kind
        || !Number.isFinite(activity.elapsedSeconds) || activity.elapsedSeconds < 60 || activity.elapsedSeconds > 48 * 3600
        || !Number.isFinite(activity.movingSeconds) || activity.movingSeconds < 0
        || activity.elapsedSeconds < activity.movingSeconds
        || !Number.isFinite(activity.distanceKm) || activity.distanceKm < 0.1 || activity.distanceKm > 400
        || (!linkOnly && !raceMatches(chapter, [{ ...run, ...activity }]).length)) {
        throw new Error('That recording could not be verified. You can enter your result manually.')
      }
      const seconds = Math.round(activity.elapsedSeconds)
      const next = {
        ...(linkOnly ? draft : draftFrom(chapter, today, 'Finished')),
        outcome: linkOnly ? draft.outcome : 'Finished' as const,
        date: activity.localDate,
        activityId: activity.id,
        hours: String(Math.floor(seconds / 3600)),
        minutes: String(Math.floor((seconds % 3600) / 60)),
        seconds: String(seconds % 60),
        distance: String(activity.distanceKm),
        timeKind: 'RecordedElapsed' as const,
      }
      // Keep the verified numbers if saving fails, so retrying doesn't require retyping them.
      setDraft(next)
      if (review || linkOnly) {
        setMode('form')
        return
      }
      setMode('form')
      const result = await onSave({
        outcome: 'Finished',
        raceDate: activity.localDate,
        finishTime: toTimeSpan(seconds),
        distanceKm: activity.distanceKm,
        activityId: activity.id,
        note: null,
        expectedVersion: next.expectedVersion,
        timeKind: 'RecordedElapsed',
      })
      setLocal({ result, over: serverVersion })
      setMode('saved')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The recording could not be loaded. You can enter your result manually.')
    } finally {
      setBusy(false)
    }
  }

  const begin = (outcome: RaceOutcome) => {
    setDraft({ ...draftFrom(chapter, today, outcome), outcome })
    setError(null)
    setMode('form')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const h = Number(draft.hours || 0), m = Number(draft.minutes || 0), s = Number(draft.seconds || 0)
    const anyTime = draft.hours !== '' || draft.minutes !== '' || draft.seconds !== ''
    const total = h * 3600 + m * 60 + s
    if (draft.outcome === 'Finished' && anyTime && (total < 60 || total > 48 * 3600 || m > 59 || s > 59 || [h, m, s].some(n => !Number.isFinite(n) || n < 0))) {
      setError('Check the finish time: 1 minute to 48 hours, with minutes and seconds up to 59.')
      return
    }
    const distance = draft.distance === '' ? null : Number(draft.distance)
    if (distance !== null && (!Number.isFinite(distance) || distance <= 0 || distance > 400)) {
      setError('Check the distance: a number of kilometres up to 400.')
      return
    }
    if (draft.date > today) {
      setError('A result can only be saved once the race has happened.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await onSave({
        outcome: draft.outcome,
        raceDate: draft.date,
        finishTime: draft.outcome === 'Finished' && anyTime ? toTimeSpan(total) : null,
        timeKind: draft.timeKind,
        distanceKm: draft.outcome === 'DidNotStart' ? null : distance,
        activityId: draft.outcome === 'DidNotStart' || !draft.activityId ? null : draft.activityId,
        note: draft.note.trim() || null,
        expectedVersion: draft.expectedVersion,
      })
      setLocal({ result, over: serverVersion })
      setMode('saved')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your result couldn’t be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    setBusy(true)
    setError(null)
    try {
      await onDelete()
      setLocal({ result: null, over: serverVersion })
      setConfirmUndo(false)
      setDraft(draftFrom({ ...chapter, raceResult: null }, today))
      setMode('ask')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The result couldn’t be removed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'saved' && saved) {
    const clock = formatClock(saved.finishTime)
    const versus = versusGoalWords(saved)
    return (
      <section className="race-result is-saved" aria-labelledby={`${id}-saved`}>
        <p className="plan-kicker">Race result · {formatDate(saved.raceDate, 'dayMonth')}</p>
        <h3 id={`${id}-saved`} className="race-result-title">
          {saved.outcome === 'Finished' ? (formatClock(saved.finishTime) ? `Finished in ${formatClock(saved.finishTime)}` : 'Finished') : saved.outcome === 'DidNotFinish' ? 'You started, and that took courage' : 'You didn’t start this one'}
        </h3>
        <dl className="race-result-facts">
          <div><dt>Result</dt><dd>{OUTCOME_WORDS[saved.outcome]}</dd></div>
          {clock && <div><dt>{saved.timeKind === 'OfficialChip' ? 'Official chip time' : saved.timeKind === 'RecordedElapsed' ? 'Recording elapsed time' : 'Finish time'}</dt><dd className="mono">{clock}</dd></div>}
          {saved.distanceKm != null && <div><dt>{saved.outcome === 'DidNotFinish' ? 'Distance covered' : 'Distance'}</dt><dd className="mono">{formatDistance(saved.distanceKm, units)}</dd></div>}
          {saved.activityId && <div><dt>Recording</dt><dd>Linked run</dd></div>}
        </dl>
        {versus && <p className="race-result-versus">{versus}</p>}
        {saved.outcome === 'DidNotFinish' && <p>Stopping when your body says so is a good decision. Rest first; the next start line will be there.</p>}
        {saved.outcome === 'DidNotStart' && <p>Not starting is sometimes the right call. Your training still happened, and it still counts.</p>}
        {saved.note && <p className="race-result-note">“{saved.note}”</p>}
        <div className="journey-actions">
          {saved.outcome === 'Finished' && onCelebrate && <button type="button" className="button" onClick={(event) => onCelebrate(event.currentTarget)}>Replay race celebration</button>}
          <button type="button" className="button button-quiet" onClick={() => { setDraft(draftFrom({ ...chapter, raceResult: saved }, today)); setMode('form') }}>Edit result</button>
          {!confirmUndo && <button type="button" className="button button-quiet" onClick={() => setConfirmUndo(true)}>Undo</button>}
        </div>
        {confirmUndo && (
          <div className="journey-confirm" role="group" aria-label="Remove race result">
            <p>Remove this result? Your race badge goes with it; your training story stays.</p>
            <button type="button" className="button" disabled={busy} onClick={() => void undo()}>{busy ? 'Removing…' : 'Remove result'}</button>
            <button type="button" className="button button-quiet" onClick={() => setConfirmUndo(false)}>Keep it</button>
          </div>
        )}
        {error && <p className="field-error" role="alert">{error}</p>}
      </section>
    )
  }

  if (mode === 'later') {
    return (
      <section className="race-result is-later" aria-label="Race result">
        <p>No rush. Your race result is here whenever you want to add it.</p>
        <button type="button" className="button" onClick={() => setMode('ask')}>Add my race result</button>
      </section>
    )
  }

  if (mode === 'ask') {
    return (
      <section className="race-result is-ask" aria-labelledby={`${id}-ask`}>
        <p className="plan-kicker">{chapter.raceDate ? formatDate(chapter.raceDate, 'dayMonth') : 'Race day'}</p>
        {found && (
          <div className="race-match-found" aria-label="Race recording found">
            <p className="plan-kicker">FINISH LINE · RECORDING FOUND</p>
            <h3 className="race-result-title">We found your {chapter.raceName}.</h3>
            <p>Already in Taperday{suggested ? ` from ${suggested.source.kind === 'Strava' ? 'Strava' : 'your uploaded runs'}` : ''}. No need to type the result again.{suggested?.source.recordedOnGarmin ? ' Recorded on Garmin.' : ''}</p>
            {suggestions.length > 1 && (
              <label className="field" htmlFor={`${id}-match`}>
                <span className="field-label">More than one recording matches. Choose your race recording</span>
                <select id={`${id}-match`} className="input" value={selectedRecording} disabled={busy} onChange={e => setSelectedRecording(e.target.value)}>
                  <option value="">Choose a recording</option>
                  {suggestions.map(run => <option key={run.id} value={run.id}>{run.source.kind === 'Strava' ? 'Strava' : 'Upload'} · {formatDistance(run.distanceKm, units)} · {formatDuration(run.movingSeconds)} moving · {run.startedAt}</option>)}
                </select>
              </label>
            )}
            {suggested && <dl className="race-match-stats">
              <div><dt>Recorded distance</dt><dd className="mono">{formatDistance(suggested.distanceKm, units)}</dd></div>
              <div><dt>Moving time</dt><dd className="mono">{formatDuration(suggested.movingSeconds)}</dd></div>
            </dl>}
            <p className="field-help">We use the recording’s full elapsed time when you confirm. Your official chip time may be different.</p>
            <div className="journey-actions">
              <button type="button" className="button button-primary" disabled={busy || !suggested} onClick={() => suggested && void fromRecording(suggested)}>
                {busy ? 'Checking your run…' : 'Confirm my recorded finish'}
              </button>
              <button type="button" className="button" disabled={busy || !suggested} onClick={() => suggested && void fromRecording(suggested, true)}>Review details</button>
            </div>
            {suggested?.source.kind === 'Strava' && suggested.source.viewUrl && (
              <a className="race-match-source" href={suggested.source.viewUrl} target="_blank" rel="noopener noreferrer">View recording on Strava</a>
            )}
          </div>
        )}
        <h3 id={`${id}-ask`} className="race-result-title">{found ? 'Not your race?' : 'How did race day go?'}</h3>
        <p className="field-help">{found ? 'Your recording is a suggestion, not an automatic result. Only you can confirm the finish.' : 'Only you know. Taperday never assumes a race was run because its date has passed.'}</p>
        <div className="race-result-choices">
          <button type="button" className="button button-primary" disabled={busy} onClick={() => begin('Finished')}>I finished</button>
          <button type="button" className="button" disabled={busy} onClick={() => begin('DidNotFinish')}>I didn’t finish</button>
          <button type="button" className="button" disabled={busy} onClick={() => begin('DidNotStart')}>I didn’t start</button>
          <button type="button" className="button button-quiet" disabled={busy} onClick={() => setMode('later')}>I’ll add it later</button>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </section>
    )
  }

  return (
    <form className="race-result is-form" onSubmit={(event) => void submit(event)} aria-labelledby={`${id}-form`} noValidate>
      <p className="plan-kicker">Race result</p>
      {draft.activityId && <p className="race-result-imported">A recording is linked. Your official chip time may differ from its elapsed time—use the time you want to record.</p>}
      <h3 id={`${id}-form`} className="race-result-title">{draft.outcome === 'Finished' ? 'Your finish' : draft.outcome === 'DidNotFinish' ? 'You started the race' : 'You didn’t start'}</h3>
      <fieldset className="race-result-outcome" disabled={busy}>
        <legend className="field-label">Result</legend>
        {(['Finished', 'DidNotFinish', 'DidNotStart'] as const).map(outcome => (
          <label key={outcome} className="session-done">
            <input type="radio" name={`${id}-outcome`} checked={draft.outcome === outcome} onChange={() => setDraft({ ...draft, outcome })} />
            {OUTCOME_WORDS[outcome]}
          </label>
        ))}
      </fieldset>
      {draft.outcome === 'Finished' && (
        <fieldset className="race-result-time" disabled={busy}>
          <legend className="field-label">Finish time <span className="field-help">(optional)</span></legend>
          <label><span className="visually-hidden">Hours</span><input className="input mono" inputMode="numeric" aria-label="Hours" placeholder="h" value={draft.hours} onChange={e => setDraft({ ...draft, hours: e.target.value.replace(/\D/g, '').slice(0, 2), timeKind: draft.timeKind === 'RecordedElapsed' ? 'Unspecified' : draft.timeKind })} /></label>
          <span aria-hidden="true">:</span>
          <label><span className="visually-hidden">Minutes</span><input className="input mono" inputMode="numeric" aria-label="Minutes" placeholder="mm" value={draft.minutes} onChange={e => setDraft({ ...draft, minutes: e.target.value.replace(/\D/g, '').slice(0, 2), timeKind: draft.timeKind === 'RecordedElapsed' ? 'Unspecified' : draft.timeKind })} /></label>
          <span aria-hidden="true">:</span>
          <label><span className="visually-hidden">Seconds</span><input className="input mono" inputMode="numeric" aria-label="Seconds" placeholder="ss" value={draft.seconds} onChange={e => setDraft({ ...draft, seconds: e.target.value.replace(/\D/g, '').slice(0, 2), timeKind: draft.timeKind === 'RecordedElapsed' ? 'Unspecified' : draft.timeKind })} /></label>
        </fieldset>
      )}
      {draft.outcome === 'Finished' && (
        <label className="field" htmlFor={`${id}-time-source`}>
          <span className="field-label" id={`${id}-time-source-label`}>Time source</span>
          <select id={`${id}-time-source`} aria-labelledby={`${id}-time-source-label`} className="input" disabled={busy} value={draft.timeKind} onChange={e => setDraft({ ...draft, timeKind: e.target.value as RaceTimeKind })}>
            <option value="Unspecified">Not specified</option>
            <option value="OfficialChip">Official chip time</option>
            <option value="RecordedElapsed">Recording elapsed time</option>
          </select>
        </label>
      )}
      {draft.outcome !== 'DidNotStart' && (
        <label className="field" htmlFor={`${id}-distance`}>
          <span className="field-label">{draft.outcome === 'DidNotFinish' ? 'Distance covered (km, optional)' : 'Distance (km)'}</span>
          <input id={`${id}-distance`} className="input mono" inputMode="decimal" disabled={busy} value={draft.distance} onChange={e => setDraft({ ...draft, distance: e.target.value })} />
        </label>
      )}
      <label className="field" htmlFor={`${id}-date`}>
        <span className="field-label">Race date</span>
        <input id={`${id}-date`} className="input" type="date" disabled={busy} max={today} min={chapter.startDate} value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value, activityId: '' })} />
      </label>
      {draft.outcome !== 'DidNotStart' && candidates.length > 0 && (
        <label className="field" htmlFor={`${id}-run`}>
          <span className="field-label">Link a recorded run (optional)</span>
          <select id={`${id}-run`} className="input" disabled={busy} value={draft.activityId} onChange={e => {
            const run = candidates.find(run => run.id === e.target.value)
            if (run && onLoadActivity) void fromRecording(run, true, true)
            else setDraft({ ...draft, activityId: e.target.value })
          }}>
            <option value="">Don’t link a run</option>
            {candidates.map(run => (
              <option key={run.id} value={run.id}>{formatDistance(run.distanceKm, units)} · {formatDuration(run.movingSeconds)}{run.plannedTitle ? ` · ${run.plannedTitle}` : ''}</option>
            ))}
          </select>
        </label>
      )}
      <label className="field" htmlFor={`${id}-note`}>
        <span className="field-label">A note for yourself (optional)</span>
        <textarea id={`${id}-note`} className="input" disabled={busy} maxLength={280} rows={2} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="journey-actions">
        <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save race result'}</button>
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => setMode(saved ? 'saved' : 'ask')}>Cancel</button>
      </div>
    </form>
  )
}
