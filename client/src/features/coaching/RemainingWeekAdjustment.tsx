import { useId, useRef, useState } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { RemainingWeekProposal, TrainingPlan } from '../../lib/types'

export interface RemainingWeekActions {
  reviewRemaining: () => Promise<RemainingWeekProposal>
  applyRemaining: (token: string) => Promise<void>
}
export function RemainingWeekAdjustment({
  current,
  units,
  actions,
}: {
  current: TrainingPlan
  units: Units
  actions: RemainingWeekActions
}) {
  const id = useId()
  const working = useRef(false)
  const [confirmed, setConfirmed] = useState(false)
  const [proposal, setProposal] = useState<RemainingWeekProposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (work: () => Promise<void>) => {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview the week again.')
      setProposal(null)
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  const describe = (km: number | null | undefined) => (km == null ? 'Rest day' : `Easy run · ${formatDistance(km, units)}`)
  return (
    <section className="section" aria-labelledby={id}>
      <h3 id={id}>Week didn’t go to plan?</h3>
      <p>
        Log what you actually ran first, including a different run or time-only entry. Preview an easier rest of this week without squeezing
        missed runs into another day.
      </p>
      <label className="session-done">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(e) => {
            setConfirmed(e.target.checked)
            setProposal(null)
          }}
        />
        I’ve logged the runs I did this week. Days without a run check-in can be treated as missed.
      </label>
      {!proposal ? (
        <button
          type="button"
          className="button button-quiet"
          disabled={!confirmed || busy}
          onClick={() => void run(async () => setProposal(await actions.reviewRemaining()))}
        >
          {busy ? 'Reviewing…' : 'Preview the rest of this week'}
        </button>
      ) : (
        <div className="callout" aria-live="polite">
          <h4>{proposal.changes.length ? 'Your easier week — preview' : 'No further adjustment suggested'}</h4>
          <p>{proposal.summary}</p>
          <p>Your plan has not changed. Today and earlier days stay as recorded. Future weeks and the race stay as written.</p>
          <ul>
            {proposal.changes.map((c) => (
              <li key={c.date}>
                {formatDate(c.date)}: {c.originalTitle} · {formatDistance(c.originalKm, units)} → {describe(c.easyKm)}
              </li>
            ))}
          </ul>
          <div className="submit-row">
            {proposal.changes.length > 0 && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await actions.applyRemaining(proposal.token)
                    setProposal(null)
                    setConfirmed(false)
                    setMessage('Remaining week updated. Original workouts and actual runs are kept in the history.')
                  })
                }
              >
                {busy ? 'Applying…' : 'Apply this easier week'}
              </button>
            )}
            <button type="button" className="button button-quiet" disabled={busy} onClick={() => setProposal(null)}>
              Keep my current plan
            </button>
          </div>
        </div>
      )}
      <p className="field-help">
        A short reset keeps runs easy and at most {formatDistance(8, units)}, never longer than planned. For illness, injury or a longer
        break, use Replan from here. If pain changes how you run, choose rest and seek professional advice.
      </p>
      {!!current.adjustments?.length && (
        <details>
          <summary>Original workouts and accepted adjustments</summary>
          <ul>
            {current.adjustments.map((c) => (
              <li key={c.date}>
                {formatDate(c.date)}: originally {c.originalTitle} · {formatDistance(c.originalKm, units)} → {describe(c.easyKm)} (accepted{' '}
                {formatDate(c.appliedOn)})
              </li>
            ))}
          </ul>
        </details>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  )
}
