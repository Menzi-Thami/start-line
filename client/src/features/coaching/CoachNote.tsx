import { useState } from 'react'
import { formatDuration } from '../../lib/format'
import type { CoachNote as Note, CoachReason, CoachVerdict } from '../../lib/types'

interface Props {
  preview?: boolean
  note: Note
  /** Rebuilds the plan from today after an injury. Offered, never done for the runner. */
  onInjuryReplan?: () => Promise<void>
  /** A faster goal the coach suggests after strong weeks, in seconds. */
  fasterGoal?: number
  onUseGoal?: (goalSeconds: number) => void
}

const TITLES: Record<CoachVerdict, string> = {
  NotEnoughToGoOn: 'Tell me how your runs go',
  OnTrack: 'On track',
  Struggling: 'An easier week',
  Hurting: 'Look after that first',
  Thriving: 'Strong week',
}

/** Why, in Taperday's voice. The API sends the reasons as codes so the words live in one place. */
const WHY: Record<CoachReason, string> = {
  FewCheckIns: 'Check in after your runs and I’ll fit each week to you.',
  RanAsPlanned: 'Last week went to plan.',
  FeltHarderThanPlanned: 'Several runs last week felt harder than they should.',
  MissedVolume: 'Last week came in well short of the plan.',
  HighHeartRateDrift: 'Your heart rate drifted up on easy runs, a sign of tiredness.',
  Niggles: 'Something niggled on more than one run.',
  Pain: 'Something hurt enough to change how you ran.',
  FeltEasierThanPlanned: 'Your hard sessions felt easier than they should.',
  FasterThanPlanned: 'You ran your hard sessions faster than planned.',
  StrugglingTwice: 'That’s two tough weeks in a row, so the easier week comes now.',
  ThrivingTwice: 'That’s two strong weeks in a row.',
  JustReplanned: 'You rebuilt your plan last week, so this week follows it as it is.',
  BuildingConsistency: 'Keep building consistency. Progression needs three strong weeks, complete logs and a positive recovery check.',
  RecoveryFatigue: 'You reported that you still feel tired, so recovery comes first.',
  RecoveryIllness: 'You reported feeling unwell or not ready to train. Rest and use the illness replan when ready.',
  RecoveryWeek: 'This is a recovery or taper week. Feeling good is a reason to respect it.',
  OneDemandAtATime: 'Only one demand increases: distance, workout difficulty or pace.',

}

/** What changed this week because of it. */
function change(note: Note): string | null {
  if (note.cutbackNow) return 'This is an easier week: less running and no hard sessions.'
  if (note.holdVolume && note.doseStep < 0) return 'This week stays at last week’s distance, with one smaller hard session instead of two.'
  if (note.holdVolume) return 'This week stays at last week’s distance.'
  if (note.doseStep > 0) return 'This week’s hard sessions are a step bigger.'
  if (note.verdict === 'Thriving') return 'Keep building consistency; any increase is reviewed with you first.'
  return null
}

/**
 * The coach's note for a week: what it saw last week and what it changed. Changes are shown after the runner applies a proposal; a
 * replan after an injury is only ever offered.
 */
export function CoachNote({ note, onInjuryReplan, fasterGoal, onUseGoal, preview = false }: Props) {
  const changed = change(note)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const replan = async () => {
    if (!onInjuryReplan) return
    setBusy(true)
    setError(null)
    try {
      await onInjuryReplan()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`coach-note is-${note.verdict.toLowerCase()}`} aria-label="Coach’s note">
      <p className="coach-note-kicker">{preview ? 'Proposed coaching · not applied' : 'Coach’s note'}</p>
      <h3>{TITLES[note.verdict]}</h3>
      {note.reasons.map((reason) => (
        <p key={reason}>{WHY[reason]}</p>
      ))}
      {changed && <p className="coach-note-change">{preview ? `If applied: ${changed}` : changed}</p>}
      {note.verdict === 'Thriving' && fasterGoal !== undefined && (
        <>
          <p>Your recent runs say {formatDuration(fasterGoal)} is within reach. Aim for it if you’d like the plan to ask more of you.</p>
          {onUseGoal && (
            <button type="button" className="button" onClick={() => onUseGoal(fasterGoal)}>
              Use {formatDuration(fasterGoal)} as my goal
            </button>
          )}
        </>
      )}
      {note.verdict === 'Hurting' && (
        <>
          <p>Rest until it settles. If it’s an injury, rebuild your plan from here so you come back gently.</p>
          {onInjuryReplan && (
            <button type="button" className="button" onClick={() => void replan()} disabled={busy}>
              {busy ? 'Rebuilding…' : 'Rebuild my plan after an injury'}
            </button>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  )
}
