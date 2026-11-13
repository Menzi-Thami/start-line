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

const makeSwap = (from: string, to?: string): LifeChange =>
  ({ situation: 'SwapRuns', date: from, moveTo: to ?? null, canRun: true })

const GENTLE = ['Easy', 'Recovery', 'EasyWithStrides', 'Shakeout', 'Strength', 'Race']

/**
 * Short, accessible confirmation for both calendar drops and the day view Move Run button. A run goes to a free day, or
 * trades days with another run (a swap): it never overwrites or stacks on a day that already has one.
 */
export function MoveRunDialog({ from, to, plan, units, actions, onClose }: Props) {
  const [proposal, setProposal] = useState<{ change: LifeChange; result: LifeProposal } | null>(null)
  const [swapTargets, setSwapTargets] = useState<string[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)
  const [undoDates, setUndoDates] = useState<string[]>([])
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const runOn = (date?: string | null) => date ? plan.weeks.flatMap(w => w.sessions).find(s => s.date === date && s.type !== 'Strength' && s.type !== 'Race') : undefined
  const session = runOn(from)
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

  // Dropped on a day that has a run: that's a swap. Otherwise a move.
  const occupied = !!to && !!runOn(to)

  useEffect(() => {
    let cancelled = false
    const initial = occupied ? makeSwap(from, to) : makeMove(from, to)
    void (async () => {
      try {
        const result = await preview(initial)
        if (!cancelled) setProposal({ change: initial, result })
      } catch (reason) {
        // A drop can land on a day the domain cannot use (past, race-adjacent, or a run that can't swap).
        // Ask the server for the free days and the runs this one can trade with.
        try {
          const [offered, swaps] = await Promise.all([
            preview(makeMove(from)),
            preview(makeSwap(from)).catch(() => null),
          ])
          if (cancelled) return
          setProposal({ change: makeMove(from), result: offered })
          setSwapTargets(swaps?.moveTargets ?? [])
          setError(offered.moveTargets.length || swaps?.moveTargets.length
            ? `${to ? formatDate(to) : 'That day'} is not available. Choose another day below.`
            : 'No free days or runs to swap with remain this week. Your run has not changed.')
        } catch {
          if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load available dates.')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [from, to, occupied, preview])

  const choose = async (date: string, swap = false) => {
    setBusy(true)
    setError(null)
    try {
      const change = swap ? makeSwap(from, date) : makeMove(from, date)
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
  const swapping = proposal?.change.situation === 'SwapRuns'
  const partner = swapping ? runOn(destination) : undefined
  // Any hard session that lands next to another hard one gets a warning; the runner decides.
  const sessions = result?.proposed.weeks.flatMap(w => w.sessions) ?? []
  const hardOn = (date: string) => sessions.some(s => s.date === date && !GENTLE.includes(s.type))
  const adjacent = result?.changes.some(c => c.movedFrom && !GENTLE.includes(c.originalType) && (hardOn(addDays(c.date, -1)) || hardOn(addDays(c.date, 1))))
  const offering = !complete && !busy && result?.changes.length === 0 && (result.moveTargets.length > 0 || swapTargets.length > 0)

  return (
    <div className="move-run-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="move-run-dialog" role="dialog" aria-modal="true" aria-labelledby="move-run-heading" aria-describedby="move-run-summary">
        <div className="move-run-dialog-header">
          <h2 id="move-run-heading">{complete ? (swapping ? 'Runs swapped' : 'Run moved') : swapping ? 'Swap these runs?' : 'Move this run?'}</h2>
          <button ref={closeRef} type="button" className="move-run-close" aria-label="Close move run" onClick={onClose}>×</button>
        </div>
        <p id="move-run-summary">
          <strong>{session?.title ?? 'Scheduled run'}{session?.distanceKm ? ` · ${formatDistance(session.distanceKm, units)}` : ''}</strong>
          <span>{formatDate(from)}{destination ? ` ${swapping ? '⇄' : '→'} ${formatDate(destination)}` : ''}</span>
          {partner && <span>{partner.title}{partner.distanceKm ? ` · ${formatDistance(partner.distanceKm, units)}` : ''} moves to {formatDate(from)}</span>}
        </p>
        {busy && !complete && <p role="status">Checking your training calendar…</p>}
        {error && <p className="move-run-error" role="alert">{error}</p>}
        {offering && result.moveTargets.length > 0 && (
          <div className="move-run-options">
            <p>Choose a free day</p>
            <div role="group" aria-label="Available dates">
              {result.moveTargets.map(date => <button className="button button-quiet" type="button" key={date} onClick={() => void choose(date)}>{formatDate(date)}</button>)}
            </div>
          </div>
        )}
        {offering && swapTargets.length > 0 && (
          <div className="move-run-options">
            <p>Or swap with another run</p>
            <div role="group" aria-label="Runs to swap with">
              {swapTargets.map(date => <button className="button button-quiet" type="button" key={date} onClick={() => void choose(date, true)}>{formatDate(date)}{runOn(date) ? ` · ${runOn(date)!.title}` : ''}</button>)}
            </div>
          </div>
        )}
        {!complete && result && result.changes.length > 0 && (
          <>
            {adjacent && <p className="move-run-warning" role="note">This creates back-to-back hard sessions. Consider making the other session easy.</p>}
            <p className="field-help">{swapping ? 'Both workouts stay the same. They trade days.' : 'Your workout stays the same. The original day becomes a rest day.'}</p>
            <div className="move-run-actions">
              <button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>Cancel</button>
              <button type="button" className="button" disabled={busy} onClick={() => void confirm()}>{busy ? (swapping ? 'Swapping…' : 'Moving…') : swapping ? 'Swap runs' : 'Move run'}</button>
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
