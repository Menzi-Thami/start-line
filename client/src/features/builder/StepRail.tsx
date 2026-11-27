import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Runner } from '../shared/Runner'
import './step-rail.css'

export interface RailStep {
  label: string
  icon: 'account' | 'race' | 'goal' | 'days' | 'finish'
}

interface Props {
  steps: readonly RailStep[]
  /** Index of the screen shown now. */
  current: number
  /** Go back to an earlier step. */
  onPick?: (index: number) => void
  /** Which done steps can be tapped (default: all). */
  canPick?: (index: number) => boolean
}

/** How long the runner takes to reach the next marker; matches the CSS transition. */
export const RUN_MS = 700

const ICON: Record<RailStep['icon'], string> = {
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0',
  race: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h2a2 2 0 0 1 0 4h-2M7 6H5a2 2 0 0 0 0 4h2',
  goal: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2 2M10 2h4',
  days: 'M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M4 11h16',
  finish: 'M5 21V4M5 4h11l-2 4 2 4H5',
}

function Icon({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * The plan builder's progress: one marker per question, done ones ticked (and tappable to go back), the current one
 * ringed, and Taperday's runner on the current marker. Moving to another step, the runner sprints along the rail to it;
 * at the finish it throws its arms up. Decorative apart from the back buttons: "Step N of M" in the action bar stays
 * the progress that screen readers hear.
 */
export function StepRail({ steps, current, onPick, canPick = () => true }: Props) {
  const [moving, setMoving] = useState<'forward' | 'back' | null>(null)
  const shown = useRef(current)
  useEffect(() => {
    if (shown.current === current) return
    const direction = current > shown.current ? 'forward' : 'back'
    shown.current = current
    if (reducedMotion()) return
    setMoving(direction)
    const timer = window.setTimeout(() => setMoving(null), RUN_MS)
    return () => window.clearTimeout(timer)
  }, [current])

  const last = steps.length - 1
  const at = last > 0 ? current / last : 0
  const finished = current === last && !moving

  return (
    <div className="step-rail" style={{ '--rail-at': at } as CSSProperties}>
      <div className="step-rail-track" aria-hidden="true"><span className="step-rail-fill" /></div>
      <span className={`step-rail-runner${moving ? ` is-moving is-${moving}` : ''}`} aria-hidden="true">
        <Runner pose={finished ? 'victory' : 'sprint'} size={30} />
      </span>
      <ol className="step-rail-steps" aria-label="Plan builder steps">
        {steps.map((step, i) => {
          const state = i < current ? 'done' : i === current ? 'now' : 'next'
          const pickable = state === 'done' && !!onPick && canPick(i)
          const dot = <span className="step-rail-dot" aria-hidden="true">{state === 'done' ? <Icon path="M5 12l5 5L20 7" /> : <Icon path={ICON[step.icon]} />}</span>
          return (
            <li key={step.label} className={`step-rail-step is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
              {pickable
                ? <button type="button" className="step-rail-button" onClick={() => onPick(i)} aria-label={`Back to ${step.label.toLowerCase()}`}>{dot}<span className="step-rail-label">{step.label}</span></button>
                : <>{dot}<span className="step-rail-label">{step.label}</span></>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
