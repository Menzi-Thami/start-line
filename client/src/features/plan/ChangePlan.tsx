import { useState } from 'react'
import type { Units } from '../../lib/format'
import type { TrainingPlan } from '../../lib/types'
import { RemainingWeekAdjustment, type RemainingWeekActions } from '../coaching/RemainingWeekAdjustment'
import { ChangedDays, LifeHappens, type LifeChoice, type LifeHappensActions } from './LifeHappens'
import { ReplanBanner, ReplanForm, type ReplanAction } from './Replan'
import { canReplan } from './plan-math'

type Choice = LifeChoice | 'week' | 'rebuild'

const LIFE: readonly { value: LifeChoice; label: string }[] = [
  { value: 'MissedRun', label: 'Missed a run' },
  { value: 'ShortOnTime', label: 'Short on time' },
  { value: 'Travelling', label: 'Travelling' },
  { value: 'Unwell', label: 'Feeling unwell' },
]

interface Props {
  plan: TrainingPlan
  today: string
  units: Units
  /** Day-to-day changes to a saved plan. Without them (a plan from a link) only a rebuild is offered. */
  life?: LifeHappensActions
  /** An easier rest of this week, for a saved plan. */
  week?: Partial<RemainingWeekActions>
  onReplan?: ReplanAction
  onUseGoal?: (goalSeconds: number) => void
  /** Opens by itself, from an older link to one of the separate forms this replaced. */
  defaultOpen?: boolean
}

/**
 * One door for every change to the plan: a missed run, a short day, travel, feeling unwell, an off-track week or a
 * rebuild from today. Each previews before it saves. Moving a single run stays on that run's day.
 */
export function ChangePlan({ plan, today, units, life, week, onReplan, onUseGoal, defaultOpen = false }: Props) {
  const [choice, setChoice] = useState<Choice | null>(null)
  const reviewWeek = week?.reviewRemaining && week.applyRemaining ? { reviewRemaining: week.reviewRemaining, applyRemaining: week.applyRemaining } : null
  const rebuild = onReplan && canReplan(plan, today)
  const choices: { value: Choice; label: string }[] = [
    ...(life ? LIFE : []),
    ...(reviewWeek ? [{ value: 'week' as const, label: 'Week off track' }] : []),
    ...(rebuild ? [{ value: 'rebuild' as const, label: 'Rebuild from today' }] : []),
  ]
  const banner = onReplan && <ReplanBanner plan={plan} onReplan={onReplan} onUseGoal={onUseGoal} />
  if (choices.length === 0) return banner || null
  return (
    <>
      {banner}
      <details className="disclosure change-plan" id="change-plan" open={defaultOpen || undefined}>
        <summary>Change my plan</summary>
        <p className="field-help">Say what happened. You’ll see what changes before anything is saved.</p>
        <div className="pills" role="group" aria-label="What happened?">
          {choices.map((c) => (
            <button key={c.value} type="button" className="button button-quiet" aria-pressed={choice === c.value} onClick={() => setChoice(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
        {life && choice && choice !== 'week' && choice !== 'rebuild' && <LifeHappens key={choice} plan={plan} today={today} units={units} actions={life} situation={choice} />}
        {reviewWeek && choice === 'week' && <RemainingWeekAdjustment current={plan} units={units} actions={reviewWeek} />}
        {onReplan && rebuild && choice === 'rebuild' && <ReplanForm today={today} units={units} onReplan={onReplan} onDone={() => setChoice(null)} />}
        {life ? <>
          <ChangedDays plan={plan} today={today} units={units} actions={life} />
          <p className="field-help">To move a run, open its day.</p>
        </> : <p className="field-help">Save this plan to change single days.</p>}
      </details>
    </>
  )
}
