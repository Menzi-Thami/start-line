import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { ApiError } from '../../lib/api-client'
import { exactDistance, formatDate } from '../../lib/format'
import type { CheckIn, RemainingWeekProposal, SessionRevision } from '../../lib/types'
import { feltMuchHarder } from './check-in-copy'
import { runTypeName } from './run-types'
import type { SessionCoach } from './useCheckIns'

// "Keep my plan" holds for that exact suggestion (its token changes when the runner's reports or the plan change).
const declinedKey = (token: string) => `taperday.adapt.declined.${token}`
const wasDeclined = (token: string) => { try { return localStorage.getItem(declinedKey(token)) !== null } catch { return false } }
const decline = (token: string) => { try { localStorage.setItem(declinedKey(token), '1') } catch { /* private mode: it may ask again */ } }

type State =
  | { kind: 'checking' }
  | { kind: 'quiet' }
  | { kind: 'proposal'; proposal: RemainingWeekProposal }
  | { kind: 'applied'; dates: string[] }
  | { kind: 'undone' }
  | { kind: 'kept' }

/**
 * What the coach makes of a rating, straight after it's saved. Taperday's own rules only (no AI): the rest of this week is
 * checked against what the runner reported (pain that changed their running, two runs that felt much harder than they
 * should, runs cut short, swapped or skipped). No suggestion: nothing shows. A suggestion is a preview with Apply and Keep
 * my plan, and an applied one has Undo. Nothing changes by itself.
 */
export function AdaptationPrompt({ entry, coach }: { entry: CheckIn; coach: SessionCoach }) {
  const actions = coach.adjustments
  const [state, setState] = useState<State>({ kind: 'checking' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const working = useRef(false)

  // One check per save (and per "check again"): the actions object is rebuilt on every render of its screen, and a re-run
  // would both repeat the request and wipe an Applied / Undo state.
  const review = useEffectEvent(() => actions?.reviewRemaining?.(true))
  useEffect(() => {
    const request = review()
    if (!request) return
    let live = true
    request.then(
      proposal => { if (live) setState((proposal?.changes?.length ?? 0) > 0 && !wasDeclined(proposal.token) ? { kind: 'proposal', proposal } : { kind: 'quiet' }) },
      // The check is a help, not a gate: if it can't run (offline, signed out), the rating still stands.
      () => { if (live) setState({ kind: 'quiet' }) },
    )
    return () => { live = false }
  }, [attempt])

  if (!actions?.reviewRemaining) return null

  const run = async (work: () => Promise<void>) => {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setError('Your running or plan changed since this suggestion. Checking again.')
        setAttempt(n => n + 1)
      } else {
        setError(failure instanceof Error ? failure.message : 'That didn’t work. Try again.')
      }
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  const describe = (c: SessionRevision) =>
    c.easyKm == null ? 'rest day' : `${c.type ? runTypeName(c.type) : 'Easy run'} · ${exactDistance(c.easyKm, coach.units)}`

  const note = feltMuchHarder(entry) && state.kind === 'quiet'
    ? <p className="field-help adaptation-note">That felt harder than this kind of run should. Keep the next one easy; if it feels the same, the coach will suggest easing your week.</p>
    : null

  if (state.kind === 'proposal') {
    const { proposal } = state
    return (
      <section className="adaptation-prompt" aria-label="Suggested change to this week">
        <h4>Ease the rest of this week?</h4>
        <p>{proposal.summary}</p>
        <ul>
          {proposal.changes.map(c => (
            <li key={c.date}>{formatDate(c.date)}: {c.originalTitle} · {exactDistance(c.originalKm, coach.units)} → {describe(c)}</li>
          ))}
        </ul>
        <p className="field-help">Nothing changes until you apply it. Past days, future weeks and the race stay as written.</p>
        <div className="post-run-rating-actions">
          <button type="button" className="button button-primary" disabled={busy}
            onClick={() => void run(async () => {
              await actions.applyRemaining!(proposal.token, true)
              setState({ kind: 'applied', dates: proposal.changes.map(c => c.date) })
            })}>
            {busy ? 'Applying…' : 'Apply this easier week'}
          </button>
          <button type="button" className="link-button" disabled={busy} onClick={() => { decline(proposal.token); setState({ kind: 'kept' }) }}>Keep my plan</button>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </section>
    )
  }

  if (state.kind === 'applied') {
    return (
      <p className="adaptation-prompt-result" role="status">
        Rest of this week eased.{' '}
        {actions.life?.restore && (
          <button type="button" className="link-button" disabled={busy}
            onClick={() => void run(async () => { await actions.life!.restore(state.dates); setState({ kind: 'undone' }) })}>
            Undo
          </button>
        )}
        {error && <span className="field-error" role="alert"> {error}</span>}
      </p>
    )
  }

  if (state.kind === 'undone') return <p className="adaptation-prompt-result" role="status">Back as planned.</p>
  if (state.kind === 'kept') return <p className="adaptation-prompt-result" role="status">Your plan stays as it is.</p>
  return note
}
