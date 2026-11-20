import { useState, type FormEvent } from 'react'
import type { LifeChange, LifeProposal } from '../../lib/types'
import type { AiCoachAnswer } from '../../lib/api-client'

/**
 * A deliberate, user-triggered AI pilot. Existing deterministic training rules
 * preview and apply the change; the language model never writes to a plan.
 */
export function AiCoachPanel({
  ask,
  apply,
}: {
  ask: (question: string) => Promise<AiCoachAnswer>
  apply: (change: LifeChange, token: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<AiCoachAnswer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const proposal: LifeProposal | null | undefined = answer?.proposal

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (question.trim().length < 3 || busy) return
    setError(null)
    setAnswer(null)
    setApplied(false)
    setBusy(true)
    try {
      setAnswer(await ask(question.trim()))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach your coach. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function accept() {
    if (!answer?.change || !proposal || !proposal.changes.length || busy) return
    setError(null)
    setBusy(true)
    try {
      await apply(answer.change, proposal.token)
      setAnswer(null)
      setApplied(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your plan changed. Ask again to refresh this suggestion.')
      setAnswer(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-label="AI training coach">
      <button type="button" className="button button-quiet" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {open ? 'Hide AI coach' : 'Ask the Taperday coach'}
      </button>
      {open && (
        <div>
          <p className="field-help">Ask about your next session, training progress or a shorter workout. This pilot uses your plan
            and independently entered check-ins only. It excludes Strava and linked imported runs.
            Asking sends that limited information to our AI provider.</p>
          <form onSubmit={event => void submit(event)}>
            <label htmlFor="ai-coach-question">What would you like help with?</label>
            <textarea
              id="ai-coach-question"
              value={question}
              onChange={event => setQuestion(event.target.value.slice(0, 500))}
              rows={3}
              minLength={3}
              maxLength={500}
              placeholder="I only have 30 minutes for tomorrow's run. Can we adjust it?"
              required
            />
            <div className="submit-row">
              <button type="submit" className="button button-primary" disabled={busy || question.trim().length < 3}>
                {busy ? 'Thinking…' : 'Ask coach'}
              </button>
            </div>
          </form>
          {error && <p role="alert" className="field-error">{error}</p>}
          {applied && <p role="status" className="field-help">Your plan has been updated. You can restore the original workout in your plan.</p>}
          {answer && (
            <div className="callout" aria-live="polite">
              <p>{answer.reply}</p>
              {proposal && answer.change && proposal.changes.length > 0 && (
                <div>
                  <p className="field-help">Review the proposed workout change before accepting:</p>
                  <ul>
                    {proposal.changes.map((change, index) => (
                      <li key={index}>
                        {change.date}: {change.easyKm == null ? 'Rest or reduced session' : `${change.easyKm.toFixed(2)} km easy`}
                        {' '}instead of {change.originalKm.toFixed(2)} km. Your plan's safe easy pace applies.
                      </li>
                    ))}
                  </ul>
                  <div className="submit-row">
                    <button type="button" className="button button-primary" onClick={() => void accept()} disabled={busy}>
                      {busy ? 'Updating…' : 'Apply this adjustment'}
                    </button>
                    <button type="button" className="button button-quiet" onClick={() => setAnswer(null)} disabled={busy}>Keep my original plan</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
