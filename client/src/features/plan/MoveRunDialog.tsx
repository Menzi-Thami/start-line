import { useEffect, useRef, useState } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { LifeChange, LifeProposal, TrainingPlan } from '../../lib/types'
import type { LifeHappensActions } from './LifeHappens'
import './move-run-dialog.css'

interface Props {
  from: string
  to?: string
  plan: TrainingPlan
  units: Units
  actions: LifeHappensActions
  onClose: () => void
}

const makeMove = (from: string, to?: string): LifeChange =>
  ({ situation: 'MoveRun', date: from, moveTo: to ?? null, canRun: true })

/** Short, accessible confirmation for both calendar drops and the day view Move Run button. */
export function MoveRunDialog({ from, to, plan, units, actions, onClose }: Props) {
  const [proposal, setProposal] = useState<{ change: LifeChange; result: LifeProposal } | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)
  const [undoDates, setUndoDates] = useState<string[]>([])
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const session = plan.weeks.flatMap(w => w.sessions).find(s => s.date === from && s.type !== 'Strength' && s.type !== 'Race')
  const preview = actions.preview
  const apply = actions.apply
  const restore = actions.restore

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const dialog = document.querySelector<HTMLElement>('.move-run-dialog')
      const controls = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled)')
      if (!controls?.length) return
      const first = controls[0]!
      const last = controls[controls.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previousFocus.current?.focus({ preventScroll: true })
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    const initial = makeMove(from, to)
    void (async () => {
      try {
        const result = await preview(initial)
        if (!cancelled) setProposal({ change: initial, result })
      } catch (reason) {
        // A drop can land on a rest day the domain cannot use, including
        // occupied/past/race-adjacent days. Ask the server for eligible dates.
        try {
          const offered = makeMove(from)
          const result = await preview(offered)
          if (cancelled) return
          setProposal({ change: offered, result })
          setError(result.moveTargets.length
            ? `${to ? formatDate(to) : 'That day'} is not available. Choose a free day below.`
            : 'No eligible free days remain this week. Your run has not changed.')
        } catch {
          if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load available dates.')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [from, to, preview])

  const choose = async (date: string) => {
    setBusy(true)
    setError(null)
    try {
      const change = makeMove(from, date)
      const result = await preview(change)
      setProposal({ change, result })
    } catch (reason) {
      setProposal(null)
      setError(reason instanceof Error ? reason.message : 'This date is not available.')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!proposal?.result.changes.length || busy) return
    setBusy(true)
    setError(null)
    try {
      await apply(proposal.change, proposal.result.token)
      setUndoDates([...new Set(proposal.result.changes.map(c => c.date))])
      setComplete(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not move the run. Please try again.')
      // A stale acceptance token should not be reusable.
      setProposal(null)
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    setBusy(true)
    setError(null)
    try {
      await restore(undoDates)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not undo the move.')
    } finally {
      setBusy(false)
    }
  }

  const result = proposal?.result
  const destination = proposal?.change.moveTo
  const moved = result?.changes.find(c => c.movedFrom === from)
  const hard = moved && !['Easy', 'Recovery', 'EasyWithStrides', 'Shakeout'].includes(moved.originalType)
  const adjacent = hard && result?.proposed.weeks.flatMap(w => w.sessions).some(s =>
    (s.date === addDays(moved.date, -1) || s.date === addDays(moved.date, 1)) &&
    !['Easy', 'Recovery', 'EasyWithStrides', 'Shakeout', 'Strength', 'Race'].includes(s.type))

  return (
    <div className="move-run-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="move-run-dialog" role="dialog" aria-modal="true" aria-labelledby="move-run-heading" aria-describedby="move-run-summary">
        <div className="move-run-dialog-header">
          <h2 id="move-run-heading">{complete ? 'Run moved' : 'Move this run?'}</h2>
          <button ref={closeRef} type="button" className="move-run-close" aria-label="Close move run" onClick={onClose}>×</button>
        </div>
        <p id="move-run-summary">
          <strong>{session?.title ?? 'Scheduled run'}{session?.distanceKm ? ` · ${formatDistance(session.distanceKm, units)}` : ''}</strong>
          <span>{formatDate(from)}{destination ? ` → ${formatDate(destination)}` : ''}</span>
        </p>
        {busy && !complete && <p role="status">Checking your training calendar…</p>}
        {error && <p className="move-run-error" role="alert">{error}</p>}
        {!complete && !busy && result?.changes.length === 0 && result.moveTargets.length > 0 && (
          <div className="move-run-options">
            <p>Choose a free day</p>
            <div role="group" aria-label="Available dates">
              {result.moveTargets.map(date => <button className="button button-quiet" type="button" key={date} onClick={() => void choose(date)}>{formatDate(date)}</button>)}
            </div>
          </div>
        )}
        {!complete && result && result.changes.length > 0 && (
          <>
            {adjacent && <p className="move-run-warning" role="note">This creates back-to-back hard sessions. Consider making the other session easy.</p>}
            <p className="field-help">Your workout stays the same. The original day becomes a rest day.</p>
            <div className="move-run-actions">
              <button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>Cancel</button>
              <button type="button" className="button" disabled={busy} onClick={() => void confirm()}>{busy ? 'Moving…' : 'Move run'}</button>
            </div>
          </>
        )}
        {complete && (
          <div role="status" className="move-run-success">
            <p>Saved! Your training calendar has been updated.</p>
            <div className="move-run-actions">
              <button type="button" className="button button-quiet" disabled={busy} onClick={() => void undo()}>Undo</button>
              <button type="button" className="button" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function addDays(iso: string, delta: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}
