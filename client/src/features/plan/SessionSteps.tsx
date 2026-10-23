import type { Units } from '../../lib/format'
import { hasSteps, stepText } from '../../lib/session-steps'
import type { SessionStep } from '../../lib/types'

function StepList({ steps, units }: { steps: readonly SessionStep[]; units: Units }) {
  return (
    <ol className="session-steps-list">
      {steps.map((step, i) => (
        <li key={i} className={`session-step session-step-${step.kind.toLowerCase()}`}>
          {stepText(step, units)}
          {step.kind === 'Repeat' && <StepList steps={step.steps} units={units} />}
        </li>
      ))}
    </ol>
  )
}

/**
 * How to run a session, step by step, each step at that week's pace: the warm-up, the work and its recoveries (a repeat
 * shows its block once, with how many times), and the cool-down. Plain runs already say their distance and pace, so they
 * show nothing more here.
 */
export function SessionSteps({ steps, units }: { steps?: readonly SessionStep[]; units: Units }) {
  // A plan saved in the browser before steps existed has none.
  if (!steps || !hasSteps(steps)) return null
  return (
    <div className="session-steps">
      <p className="session-steps-head">How to run it</p>
      <StepList steps={steps} units={units} />
    </div>
  )
}
