import { useId } from 'react'
import { formatDuration, parseTimeSpan } from '../../lib/format'
import type { GoalOutlook, GoalVerdict } from '../../lib/types'

const HEADINGS: Record<GoalVerdict, string> = {
  NotAssessed: 'About your goal',
  AheadOfGoal: 'You could aim higher',
  OnTrack: 'Your goal looks realistic',
  Stretch: 'Your goal is a stretch',
  AtRisk: 'Your goal is at risk',
}

interface Props {
  outlook: GoalOutlook
  /** Takes the goal the coach suggests: the plan is rebuilt around it. Without it, the suggestion is only told. */
  onUseGoal?: (goalSeconds: number) => void
}

/**
 * The coach's read on the goal: what it means in a sentence, and why. The reasons are open when the news asks for a
 * decision (aim higher, or at risk) and a tap away otherwise. The colour is only a hint: the heading says it in words.
 */
export function OutlookCard({ outlook, onUseGoal }: Props) {
  const headingId = useId()
  const suggested = outlook.suggestedGoal ? parseTimeSpan(outlook.suggestedGoal) : null
  const asksForADecision = outlook.verdict === 'AheadOfGoal' || outlook.verdict === 'AtRisk'

  return (
    <section className={`outlook outlook-${outlook.verdict.toLowerCase()}`} aria-labelledby={headingId}>
      <h3 id={headingId}>{HEADINGS[outlook.verdict]}</h3>
      <p>{outlook.summary}</p>
      {outlook.reasons.length > 0 && (
        <details className="outlook-why" open={asksForADecision}>
          <summary>Why</summary>
          <ul>
            {outlook.reasons.map((r) => (
              <li key={r.code}>{r.message}</li>
            ))}
          </ul>
        </details>
      )}
      {suggested !== null && onUseGoal && (
        <button type="button" className="button" onClick={() => onUseGoal(suggested)}>
          Use {formatDuration(suggested)} as my goal
        </button>
      )}
    </section>
  )
}
