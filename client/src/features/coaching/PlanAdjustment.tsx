import { useRef, useState } from 'react'
import { formatDistance, formatPaceRange, type Units } from '../../lib/format'
import type { CoachingProposal, TrainingPlan } from '../../lib/types'
import { ZONES } from '../plan/copy'
import { CoachNote } from './CoachNote'

export interface AdjustmentActions {
  review: () => Promise<CoachingProposal>
  apply: (token: string) => Promise<void>
}
/** A preview never saves a call; the runner applies the exact proposal they reviewed. */
export function PlanAdjustment({ current, units, actions }: { current: TrainingPlan; units: Units; actions: AdjustmentActions }) {
  const [proposal, setProposal] = useState<CoachingProposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const working = useRef(false)
  const run = async (work: () => Promise<void>) => {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.')
      setProposal(null)
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  return (
    <section className="plan-adjustment" aria-label="Review upcoming training">
      <p className="field-help">
        Your completed runs and original workouts stay in your plan. Review coaching before changing upcoming training.
      </p>
      {!proposal ? (
        <button
          type="button"
          className="button button-quiet"
          disabled={busy}
          onClick={() => void run(async () => setProposal(await actions.review()))}
        >
          {busy ? 'Reviewing…' : 'Review training adjustments'}
        </button>
      ) : (
        <>
          <h3>{proposal.hasChanges ? 'Suggested training adjustment' : 'Keep training as planned'}</h3>
          <p>
            {proposal.hasChanges
              ? 'This is a preview. Your plan has not changed.'
              : 'Your plan stays as it is. Weekly suggestions need enough completed training and cannot rewrite past workouts. Use Replan from here to rebuild future weeks.'}
          </p>
          {proposal.canApply && proposal.proposed.coaching?.at(-1) && <CoachNote note={proposal.proposed.coaching.at(-1)!} preview />}
          {proposal.hasChanges && (
            <ul>
              {proposal.proposed.plan.weeks.flatMap((week, i) => {
                const before = current.weeks[i]
                return before && JSON.stringify(before.sessions) !== JSON.stringify(week.sessions)
                  ? [
                      <li key={week.number}>
                        Week {week.number}: {formatDistance(before.plannedKm, units)} → {formatDistance(week.plannedKm, units)} ·{' '}
                        {week.sessions
                          .filter((s) => s.type !== 'Strength')
                          .map((s) => s.title)
                          .join(', ')}
                      </li>,
                    ]
                  : []
              })}
            </ul>
          )}
          {proposal.proposed.plan.paces.some((pace) => {
            const before = current.paces.find((p) => p.zone === pace.zone)
            return (
              before && (before.fastestSecondsPerKm !== pace.fastestSecondsPerKm || before.slowestSecondsPerKm !== pace.slowestSecondsPerKm)
            )
          }) && (
            <div>
              <h4>Pace changes</h4>
              <ul>
                {proposal.proposed.plan.paces.flatMap((pace) => {
                  const before = current.paces.find((p) => p.zone === pace.zone)
                  return before &&
                    (before.fastestSecondsPerKm !== pace.fastestSecondsPerKm || before.slowestSecondsPerKm !== pace.slowestSecondsPerKm)
                    ? [
                        <li key={pace.zone}>
                          {ZONES[pace.zone].name} pace: {formatPaceRange(before.fastestSecondsPerKm, before.slowestSecondsPerKm, units)} →{' '}
                          {formatPaceRange(pace.fastestSecondsPerKm, pace.slowestSecondsPerKm, units)}
                        </li>,
                      ]
                    : []
                })}
              </ul>
            </div>
          )}
          <div className="submit-row">
            {proposal.canApply && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await actions.apply(proposal.token)
                    setSuccess(
                      proposal.hasChanges
                        ? 'Training updated. Your past workouts and completed runs stay unchanged.'
                        : 'Weekly review saved. Training stays as planned.',
                    )
                    setProposal(null)
                  })
                }
              >
                {busy ? 'Applying…' : proposal.hasChanges ? 'Apply this adjustment' : 'Keep this week as planned'}
              </button>
            )}
            <button type="button" className="button button-quiet" disabled={busy} onClick={() => setProposal(null)}>
              Close preview
            </button>
          </div>
        </>
      )}
      {success && <p role="status">{success}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
