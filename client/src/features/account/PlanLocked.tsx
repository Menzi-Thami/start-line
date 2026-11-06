import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { TrainingPlan } from '../../lib/types'
import { Runner } from '../shared/Runner'

interface Props {
  plan: TrainingPlan
  units: Units
  /** Signed out: sign in or create an account. */
  onSignIn?: () => void
  onSignUp?: () => void
  /** Signed in but not finished setting up: finish first. */
  onFinishSignUp?: () => void
}

/**
 * A plan opened from a link by someone who isn't signed in. They see which race and how long the plan is, never its
 * sessions or calendar: those are for a runner's own account. Signing in comes back to this same link, and the plan opens.
 */
export function PlanLocked({ plan, units, onSignIn, onSignUp, onFinishSignUp }: Props) {
  return (
    <section className="plan-locked panel" aria-labelledby="plan-locked-title">
      <Runner pose="crouch" size={44} className="plan-locked-runner" />
      <p className="plan-eyebrow">Your plan is ready</p>
      <h2 className="plan-title" id="plan-locked-title">{plan.race.name}</h2>
      <p className="plan-locked-facts">
        {formatDate(plan.race.date, 'long')} · {formatDistance(plan.race.distanceKm, units)} · {plan.weeks.length} weeks
      </p>
      <p>
        {onFinishSignUp
          ? 'Finish setting up your account to see your plan: every session, your calendar and your progress.'
          : 'Sign in to see your plan: every session, your calendar and your progress. It’s free, and it keeps your plan safe on any device.'}
      </p>
      <div className="submit-row">
        {onFinishSignUp ? (
          <button type="button" className="button button-primary" onClick={onFinishSignUp}>Finish setting up</button>
        ) : (
          <>
            {onSignUp && <button type="button" className="button button-primary" onClick={onSignUp}>Create a free account</button>}
            {onSignIn && <button type="button" className="button button-quiet" onClick={onSignIn}>Sign in</button>}
          </>
        )}
      </div>
    </section>
  )
}
