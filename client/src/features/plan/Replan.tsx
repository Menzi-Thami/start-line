import { useId, useState, type FormEvent } from 'react'
import { ApiError } from '../../lib/api-client'
import { addDays, formatDate, formatDuration, parseTimeSpan, toKilometres, type Units } from '../../lib/format'
import type { ReplanInputs } from '../../lib/plan-url'
import type { Setback, TrainingPlan } from '../../lib/types'

interface Props {
  plan: TrainingPlan
  today: string
  units: Units
  /** Rebuilds the plan from today after a setback, or (with undefined) puts it back as first built. */
  onReplan: (replan: ReplanInputs | undefined) => Promise<void>
  /** Takes the suggested goal: the plan is rebuilt around it. */
  onUseGoal: (goalSeconds: number) => void
}

/** The days before the race a plan can still be rebuilt: the API's rule too. */
const MIN_DAYS_BEFORE_RACE = 14

const SETBACKS: readonly { value: Setback; label: string; help: string }[] = [
  { value: 'MissedTraining', label: 'I missed some training', help: 'A holiday, work or life got in the way, for up to about two weeks.' },
  { value: 'Illness', label: 'I was ill', help: 'Rest this week, then a week of easy runs.' },
  { value: 'Injury', label: 'I was injured', help: 'Two weeks of easy runs once you’re pain-free.' },
  { value: 'Behind', label: 'I’m running less than planned', help: 'The plan picks up from what you ran last week.' },
]

const AFTER: Record<Setback, string> = {
  MissedTraining: 'missed training',
  Illness: 'illness',
  Injury: 'injury',
  Behind: 'running less than planned',
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return Object.values(error.fieldErrors).flat()[0] ?? error.message
  return error instanceof Error ? error.message : 'That didn’t work. Try again.'
}

/**
 * "Replan from here": after a missed week, illness, injury or a lean spell, the rest of the plan is rebuilt from today.
 * The weeks already run stay, and so do the race date and the goal; the plan suggests a goal when it's out of reach.
 */
export function Replan({ plan, today, units, onReplan, onUseGoal }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [setback, setSetback] = useState<Setback | null>(null)
  const [lastWeek, setLastWeek] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canReplan = today >= plan.startDate && today <= addDays(plan.race.date, -MIN_DAYS_BEFORE_RACE)
  const suggested = plan.suggestedGoal ? parseTimeSpan(plan.suggestedGoal) : null
  const lastWeekKm = lastWeek.trim() === '' ? undefined : toKilometres(Number(lastWeek), units)
  const lastWeekInvalid = lastWeekKm !== undefined && !(Number.isFinite(lastWeekKm) && lastWeekKm >= 0 && lastWeekKm <= 300)
  const needsLastWeek = setback === 'Behind' && !lastWeekKm

  const run = async (replan: ReplanInputs | undefined) => {
    setBusy(true)
    setError(null)
    try {
      await onReplan(replan)
      setOpen(false)
      setSetback(null)
      setLastWeek('')
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!setback || needsLastWeek || lastWeekInvalid) return
    void run({ from: today, setback, recentWeeklyKm: lastWeekKm ? Math.round(lastWeekKm * 10) / 10 : undefined })
  }

  if (!plan.replan && !canReplan) return null

  return (
    <div className="replan">
      {plan.replan && (
        <div className="replan-banner" role="status">
          <p>
            <strong>Rebuilt from {formatDate(plan.replan.from)}</strong> after {AFTER[plan.replan.setback]}. The weeks before stay as they
            were, and your race date and goal haven’t changed.
          </p>
          <div className="submit-row">
            {suggested !== null && (
              <button type="button" className="button" onClick={() => onUseGoal(suggested)} disabled={busy}>
                Use {formatDuration(suggested)} as my goal
              </button>
            )}
            <button type="button" className="button button-quiet" onClick={() => void run(undefined)} disabled={busy}>
              Undo replan
            </button>
          </div>
        </div>
      )}

      {canReplan && !open && (
        <button type="button" className="button button-quiet replan-open" onClick={() => setOpen(true)} aria-expanded={false}>
          Fell behind? Replan from here
        </button>
      )}

      {canReplan && open && (
        <form className="replan-form" onSubmit={submit} aria-labelledby={`${id}-title`}>
          <h3 id={`${id}-title`}>Replan from today</h3>
          <p className="field-help">
            Rebuilds the rest of your plan from where you are now. Your race and goal stay the same.
          </p>
          <fieldset className="field">
            <legend className="field-label">What happened?</legend>
            <div className="choice-list" role="radiogroup">
              {SETBACKS.map((s) => (
                <label key={s.value} className="choice choice-other">
                  <input type="radio" name={`${id}-setback`} value={s.value} checked={setback === s.value} onChange={() => setSetback(s.value)} />
                  <span className="choice-name">{s.label}</span>
                  <span className="choice-meta">{s.help}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-last`}>
              How far did you run last week? ({units})
            </label>
            <input
              id={`${id}-last`}
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={lastWeek}
              onChange={(e) => setLastWeek(e.target.value)}
              aria-invalid={needsLastWeek || lastWeekInvalid}
              aria-describedby={`${id}-last-help`}
            />
            <span className="field-help" id={`${id}-last-help`}>
              {setback === 'Behind' ? 'Needed, so the plan can pick up from there.' : 'Optional. The plan won’t jump far above it.'}
            </span>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="submit-row">
            <button type="submit" className="button" disabled={busy || !setback || needsLastWeek || lastWeekInvalid}>
              {busy ? 'Rebuilding…' : 'Rebuild my plan'}
            </button>
            <button type="button" className="button button-quiet" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {!open && error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
