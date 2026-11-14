import { useId, useState, type FormEvent } from 'react'
import { formatDate, formatDistance, formatDuration, toTimeSpan, type Units } from '../../lib/format'
import type { Activity, ActivitySummary } from '../../lib/types'
import { raceMatches } from './race-match'
import { clockSeconds, formatClock, OUTCOME_WORDS, versusGoalWords } from './journey-model'
import type { PlanChapter, RaceOutcome, RaceResult, SaveRaceResult } from './types'

interface Props {
  chapter: PlanChapter
  today: string
  units: Units
  /** Recorded runs around race day, to link one if the runner wants. Never picked for them. */
  runs?: readonly ActivitySummary[]
  /** Load the original evidence so elapsed (not moving) time is used when suggesting a finish. */
  onLoadActivity?: (id: string) => Promise<Activity>
  onSave: (body: SaveRaceResult) => Promise<RaceResult>
  onDelete: () => Promise<void>
  onCelebrate?: (trigger: HTMLElement) => void
}

type Draft = { outcome: RaceOutcome; hours: string; minutes: string; seconds: string; distance: string; date: string; activityId: string; note: string }

const draftFrom = (chapter: PlanChapter, today: string, outcome: RaceOutcome = 'Finished'): Draft => {
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
  }
}

/**
 * "How did race day go?": the runner says whether they finished, didn't finish or didn't start, with their time if they
 * like. A race date passing is never taken as a finish, and a recorded run is never matched to the race by itself.
 * A synced recording can be proposed with one tap to confirm, but never marks a runner as a finisher without consent.
 * Saving can be edited or undone, and a failed save keeps everything typed.
 */
export function RaceResultForm({ chapter, today, units, runs = [], onLoadActivity, onSave, onDelete, onCelebrate }: Props) {
  const id = useId()
  // What this form last saved or removed, until the reloaded journey brings the server's own copy.
  // It's dropped as soon as the server's copy changes, so a reload always wins.
  const serverVersion = chapter.raceResult?.version ?? null
  const [local, setLocal] = useState<{ result: RaceResult | null; over: string | null } | null>(null)
  const saved = local && local.over === serverVersion ? local.result : chapter.raceResult
  const [mode, setMode] = useState<'ask' | 'form' | 'later' | 'saved'>(saved ? 'saved' : 'ask')
  const [draft, setDraft] = useState<Draft>(() => draftFrom(chapter, today))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const raceDay = draft.date
  const candidates = runs.filter(run => run.kind !== 'Other' && run.localDate === raceDay)
  const suggestions = !saved && chapter.raceDate && chapter.raceDate <= today ? raceMatches(chapter, runs) : []
  const suggested = suggestions[0]
  // Multiple genuinely different long runs on the same day must be reviewed, not silently treated as one event.
  const ambiguous = !!suggested && suggestions.slice(1).some(run =>
    Math.abs(run.distanceKm - suggested.distanceKm) > 0.5
    || Math.abs(run.movingSeconds - suggested.movingSeconds) > 600,
  )

  const fromRecording = async (run: ActivitySummary, review = false) => {
    if (busy || !onLoadActivity) return
    setBusy(true)
    setError(null)
    try {
      const activity = await onLoadActivity(run.id)
      if (activity.id !== run.id || activity.localDate !== run.localDate
        || activity.kind !== run.kind
        || !Number.isFinite(activity.elapsedSeconds) || activity.elapsedSeconds < 60 || activity.elapsedSeconds > 48 * 3600
        || !Number.isFinite(activity.distanceKm) || !raceMatches(chapter, [{ ...run, distanceKm: activity.distanceKm }]).length) {
        throw new Error('That recording could not be verified. You can enter your result manually.')
      }
      const seconds = Math.round(activity.elapsedSeconds)
      const next = {
        ...draftFrom(chapter, today, 'Finished'),
        outcome: 'Finished' as const,
        date: activity.localDate,
        activityId: activity.id,
        hours: String(Math.floor(seconds / 3600)),
        minutes: String(Math.floor((seconds % 3600) / 60)),
        seconds: String(seconds % 60),
        distance: String(Math.round(activity.distanceKm * 100) / 100),
      }
      if (review) {
        setDraft(next)
        setMode('form')
        return
      }
      const result = await onSave({
        outcome: 'Finished',
        raceDate: activity.localDate,
        finishTime: toTimeSpan(seconds),
        distanceKm: activity.distanceKm,
        activityId: activity.id,
        note: null,
        expectedVersion: saved?.version ?? null,
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
    if (draft.outcome === 'Finished' && anyTime && (total < 60 || m > 59 || s > 59 || [h, m, s].some(n => !Number.isFinite(n) || n < 0))) {
      setError('Check the finish time: hours, then minutes and seconds up to 59.')
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
        distanceKm: draft.outcome === 'DidNotStart' ? null : distance,
        activityId: draft.outcome === 'DidNotStart' || !draft.activityId ? null : draft.activityId,
        note: draft.note.trim() || null,
        expectedVersion: saved?.version ?? null,
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
          {clock && <div><dt>Finish time</dt><dd className="mono">{clock}</dd></div>}
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
        {suggested && onLoadActivity && (
          <div className="race-match-found" aria-label="Race recording found">
            <p className="plan-kicker">FINISH LINE · RECORDING FOUND</p>
            <h3 className="race-result-title">We found your {chapter.raceName}.</h3>
            <p>Already in Taperday from {suggested.source.kind === 'Strava' ? 'Strava' : 'your uploaded runs'}. No need to type the result again.</p>
            <dl className="race-match-stats">
              <div><dt>Recorded distance</dt><dd className="mono">{formatDistance(suggested.distanceKm, units)}</dd></div>
              <div><dt>Moving time</dt><dd className="mono">{formatDuration(suggested.movingSeconds)}</dd></div>
            </dl>
            <p className="field-help">We use the recording’s full elapsed time when you confirm. Your official chip time may be different.</p>
            {ambiguous
              ? <p className="field-help">More than one run looks like your race. Please review which one it was.</p>
              : <div className="journey-actions">
                  <button type="button" className="button button-primary" disabled={busy} onClick={() => void fromRecording(suggested)}>
                    {busy ? 'Checking your run…' : 'Confirm my recorded finish'}
                  </button>
                  <button type="button" className="button" disabled={busy} onClick={() => void fromRecording(suggested, true)}>Review details</button>
                </div>}
            {suggested.source.viewUrl && (
              <a className="race-match-source" href={suggested.source.viewUrl} target="_blank" rel="noopener noreferrer">View recording on Strava</a>
            )}
          </div>
        )}
        <h3 id={`${id}-ask`} className="race-result-title">{suggested && onLoadActivity ? 'Not your race?' : 'How did race day go?'}</h3>
        <p className="field-help">Your recording is a suggestion, not an automatic result. Only you can confirm the finish.</p>
        <div className="race-result-choices">
          <button type="button" className="button button-primary" onClick={() => begin('Finished')}>I finished</button>
          <button type="button" className="button" onClick={() => begin('DidNotFinish')}>I didn’t finish</button>
          <button type="button" className="button" onClick={() => begin('DidNotStart')}>I didn’t start</button>
          <button type="button" className="button button-quiet" onClick={() => setMode('later')}>I’ll add it later</button>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </section>
    )
  }

  return (
    <form className="race-result is-form" onSubmit={(event) => void submit(event)} aria-labelledby={`${id}-form`} noValidate>
      <p className="plan-kicker">Race result</p>
      {draft.activityId && <p className="race-result-imported">Values loaded from your run. The elapsed recording time can differ from the official chip time—edit it if needed.</p>}
      <h3 id={`${id}-form`} className="race-result-title">{draft.outcome === 'Finished' ? 'Your finish' : draft.outcome === 'DidNotFinish' ? 'You started the race' : 'You didn’t start'}</h3>
      <fieldset className="race-result-outcome">
        <legend className="field-label">Result</legend>
        {(['Finished', 'DidNotFinish', 'DidNotStart'] as const).map(outcome => (
          <label key={outcome} className="session-done">
            <input type="radio" name={`${id}-outcome`} checked={draft.outcome === outcome} onChange={() => setDraft({ ...draft, outcome })} />
            {OUTCOME_WORDS[outcome]}
          </label>
        ))}
      </fieldset>
      {draft.outcome === 'Finished' && (
        <fieldset className="race-result-time">
          <legend className="field-label">Finish time <span className="field-help">(optional)</span></legend>
          <label><span className="visually-hidden">Hours</span><input className="input mono" inputMode="numeric" aria-label="Hours" placeholder="h" value={draft.hours} onChange={e => setDraft({ ...draft, hours: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></label>
          <span aria-hidden="true">:</span>
          <label><span className="visually-hidden">Minutes</span><input className="input mono" inputMode="numeric" aria-label="Minutes" placeholder="mm" value={draft.minutes} onChange={e => setDraft({ ...draft, minutes: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></label>
          <span aria-hidden="true">:</span>
          <label><span className="visually-hidden">Seconds</span><input className="input mono" inputMode="numeric" aria-label="Seconds" placeholder="ss" value={draft.seconds} onChange={e => setDraft({ ...draft, seconds: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></label>
        </fieldset>
      )}
      {draft.outcome !== 'DidNotStart' && (
        <label className="field" htmlFor={`${id}-distance`}>
          <span className="field-label">{draft.outcome === 'DidNotFinish' ? 'Distance covered (km, optional)' : 'Distance (km)'}</span>
          <input id={`${id}-distance`} className="input mono" inputMode="decimal" value={draft.distance} onChange={e => setDraft({ ...draft, distance: e.target.value })} />
        </label>
      )}
      <label className="field" htmlFor={`${id}-date`}>
        <span className="field-label">Race date</span>
        <input id={`${id}-date`} className="input" type="date" max={today} min={chapter.startDate} value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value, activityId: '' })} />
      </label>
      {draft.outcome !== 'DidNotStart' && candidates.length > 0 && (
        <label className="field" htmlFor={`${id}-run`}>
          <span className="field-label">Link a recorded run (optional)</span>
          <select id={`${id}-run`} className="input" value={draft.activityId} onChange={e => setDraft({ ...draft, activityId: e.target.value })}>
            <option value="">Don’t link a run</option>
            {candidates.map(run => (
              <option key={run.id} value={run.id}>{formatDistance(run.distanceKm, units)} · {formatDuration(run.movingSeconds)}{run.plannedTitle ? ` · ${run.plannedTitle}` : ''}</option>
            ))}
          </select>
        </label>
      )}
      <label className="field" htmlFor={`${id}-note`}>
        <span className="field-label">A note for yourself (optional)</span>
        <textarea id={`${id}-note`} className="input" maxLength={280} rows={2} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} />
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="journey-actions">
        <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save race result'}</button>
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => setMode(saved ? 'saved' : 'ask')}>Cancel</button>
      </div>
    </form>
  )
}
