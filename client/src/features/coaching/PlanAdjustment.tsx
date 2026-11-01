import { useId, useRef, useState } from 'react'
import { formatDate, formatDistance, formatPaceRange, type Units } from '../../lib/format'
import type { CoachingProposal, RecoveryReadiness, TrainingPlan } from '../../lib/types'
import { ZONES } from '../plan/copy'
import { CoachNote } from './CoachNote'
import { RemainingWeekAdjustment, type RemainingWeekActions } from './RemainingWeekAdjustment'

export interface AdjustmentActions extends Partial<RemainingWeekActions> {
  review: (recovery?: RecoveryReadiness) => Promise<CoachingProposal>
  apply: (token: string, recovery?: RecoveryReadiness) => Promise<void>
  /** Says no to the reviewed change: the plan stays as it is and the answer is kept in the coaching history. */
  decline?: (token: string, recovery?: RecoveryReadiness) => Promise<void>
}
const RECOVERY_WORDS: Record<RecoveryReadiness, string> = {
  NotReported: 'not given',
  Ready: 'fresh',
  Tired: 'tired',
  Unwell: 'unwell',
}

/** A preview never saves a call; the runner applies the exact proposal they reviewed. */
export function PlanAdjustment({ current, units, actions }: { current: TrainingPlan; units: Units; actions: AdjustmentActions }) {
  const [proposal, setProposal] = useState<CoachingProposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<RecoveryReadiness>('NotReported')
  const recoveryId = useId()
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
      {actions.reviewRemaining && actions.applyRemaining && (
        <RemainingWeekAdjustment
          current={current}
          units={units}
          actions={{ reviewRemaining: actions.reviewRemaining, applyRemaining: actions.applyRemaining }}
        />
      )}
      <h3>Weekly review</h3>
      <p>
        On Sunday, review this week for next Monday. From Monday, review the week just finished. Changes are applied only after you review
        them.
      </p>
      <div className="field">
        <label className="field-label" htmlFor={recoveryId}>
          How recovered do you feel for the week ahead?
        </label>
        <select
          id={recoveryId}
          className="input"
          value={recovery}
          disabled={busy}
          onChange={(e) => {
            setRecovery(e.target.value as RecoveryReadiness)
            setProposal(null)
            setSuccess(null)
          }}
        >
          <option value="NotReported">Not sure / prefer not to say</option>
          <option value="Ready">Recovered and ready</option>
          <option value="Tired">Still tired</option>
          <option value="Unwell">Unwell or not ready to train</option>
        </select>
      </div>
      <p className="field-help">
        Your completed runs and original workouts stay in your plan. Review coaching before changing upcoming training.
      </p>
      {!proposal ? (
        <button
          type="button"
          className="button button-quiet"
          disabled={busy}
          onClick={() => void run(async () => setProposal(await actions.review(recovery)))}
        >
          {busy ? 'Reviewing…' : 'Review training adjustments'}
        </button>
      ) : (
        <>
          <h3>{proposal.hasChanges ? 'Suggested training adjustment' : 'Keep training as planned'}</h3>
          {proposal.review && (
            <div className="callout">
              <h4>
                Week of {formatDate(proposal.review.reviewedWeek)} → training from {formatDate(proposal.review.targetWeek)}
              </h4>
              <ul>
                <li>
                  {proposal.review.runsCompleted} of {proposal.review.runsPlanned} planned runs logged · {proposal.review.skipped} skipped ·{' '}
                  {proposal.review.missingCheckIns} without a log
                </li>
                <li>
                  {formatDistance(proposal.review.reportedKm, units)} reported · {formatDistance(proposal.review.plannedKm, units)}{' '}
                  prescribed
                </li>
                <li>
                  {proposal.review.substitutions} substitutions · {proposal.review.unknownDistances} runs without a reported distance
                </li>
                {proposal.review.recoveryFromCheckIn && (
                  <li>
                    Using your daily check-in: {RECOVERY_WORDS[proposal.review.recovery]}. Choose an answer above to use that instead.
                  </li>
                )}
              </ul>
              {proposal.review.missingCheckIns > 0 && (
                <p>
                  Log completed runs and mark missed workouts as skipped before finalising. Strava syncing alone does not complete a
                  prescribed workout.
                </p>
              )}
              <p className="field-help">
                Lasting coaching uses your entries and uploaded files. Progression needs three strong weeks, complete logs and a positive
                recovery check. One demand increases at a time; recovery and taper weeks are protected.
              </p>
            </div>
          )}
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
                    await actions.apply(proposal.token, recovery)
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
            {proposal.canApply && proposal.hasChanges && actions.decline && (
              <button
                type="button"
                className="button button-quiet"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await actions.decline!(proposal.token, recovery)
                    setSuccess('Suggestion declined. Your plan stays as it is, and your answer is in your coaching history.')
                    setProposal(null)
                  })
                }
              >
                Decline this change
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
