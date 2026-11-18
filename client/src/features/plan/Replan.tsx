import { useId, useState, type FormEvent } from 'react'
import { ApiError } from '../../lib/api-client'
import { formatDate, formatDuration, parseTimeSpan, toKilometres, type Units } from '../../lib/format'
import type { ReplanInputs } from '../../lib/plan-url'
import type { Setback, TrainingPlan } from '../../lib/types'

/** Rebuilds the plan from today after a setback, or (with undefined) puts it back as first built. */
export type ReplanAction = (replan: ReplanInputs | undefined) => Promise<void>

const SETBACKS: readonly { value: Setback; label: string; help: string }[] = [
  { value: 'MissedTraining', label: 'I missed some training', help: 'Up to about two weeks off.' },
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

/** Says a plan was rebuilt, and offers to undo it or take the slower goal it suggests. */
export function ReplanBanner({ plan, onReplan, onUseGoal }: { plan: TrainingPlan; onReplan: ReplanAction; onUseGoal?: (goalSeconds: number) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!plan.replan) return null
  const suggested = plan.suggestedGoal ? parseTimeSpan(plan.suggestedGoal) : null
  const undo = async () => {
    setBusy(true)
    setError(null)
    try {
      await onReplan(undefined)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="replan-banner" role="status">
      <p>
        <strong>Rebuilt from {formatDate(plan.replan.from)}</strong> after {AFTER[plan.replan.setback]}. Your race and goal are the same.
      </p>
      <div className="submit-row">
        {suggested !== null && onUseGoal && (
          <button type="button" className="button" onClick={() => onUseGoal(suggested)} disabled={busy}>
            Use {formatDuration(suggested)} as my goal
          </button>
        )}
        <button type="button" className="button button-quiet" onClick={() => void undo()} disabled={busy}>
          Undo replan
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Rebuild from today: after missed training, illness, injury or a lean spell, the rest of the plan is rebuilt from today.
 * The weeks already run stay, and so do the race date and the goal; the plan suggests a goal when it's out of reach.
 */
export function ReplanForm({ today, units, onReplan, onDone }: { today: string; units: Units; onReplan: ReplanAction; onDone?: () => void }) {
  const id = useId()
  const [setback, setSetback] = useState<Setback | null>(null)
  const [lastWeek, setLastWeek] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lastWeekKm = lastWeek.trim() === '' ? undefined : toKilometres(Number(lastWeek), units)
  const lastWeekInvalid = lastWeekKm !== undefined && !(Number.isFinite(lastWeekKm) && lastWeekKm >= 0 && lastWeekKm <= 300)
  const needsLastWeek = setback === 'Behind' && !lastWeekKm

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!setback || needsLastWeek || lastWeekInvalid) return
    setBusy(true)
    setError(null)
    try {
      await onReplan({ from: today, setback, recentWeeklyKm: lastWeekKm ? Math.round(lastWeekKm * 10) / 10 : undefined })
      setSetback(null)
      setLastWeek('')
      onDone?.()
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="replan-form" onSubmit={(event) => void submit(event)} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Rebuild from today</h3>
      <p className="field-help">Your race, goal and the weeks you’ve run stay the same.</p>
      <fieldset className="field">
        <legend className="field-label">Why?</legend>
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
      </div>
    </form>
  )
}
