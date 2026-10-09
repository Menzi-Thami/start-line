import type { PlanProgress as Progress } from '../../lib/plan-day'
import { Runner, type RunnerPose } from '../shared/Runner'

interface Props {
  progress: Progress
  weeks: number
  currentWeek: number | null
}

const RING = 2 * Math.PI * 24
const POSE: Record<Progress['kind'], RunnerPose> = {
  before: 'crouch',
  training: 'sprint',
  rest: 'sleep',
  race: 'victory',
  after: 'victory',
}

function countdown({ kind, daysToGo, daysToStart }: Progress): string {
  if (kind === 'race') return 'Race day'
  if (kind === 'after') return 'Race done'
  if (kind === 'before') return daysToStart === 1 ? 'Starts tomorrow' : `Starts in ${daysToStart} days`
  return daysToGo === 1 ? '1 day to go' : `${daysToGo} days to go`
}

/**
 * Where the runner is in the plan, by today's date: a ring that closes day by day until race day, and the runner on
 * the course (crouched before the start, sprinting on training days, asleep on rest days, through the tape on race
 * day). The words carry the meaning; the picture is decoration.
 */
export function PlanProgress({ progress, weeks, currentWeek }: Props) {
  const percent = `${(progress.fraction * 100).toFixed(1)}%`
  const weekLabel = progress.kind === 'before' ? `0/${weeks}` : `${currentWeek ?? weeks}/${weeks}`

  return (
    <div className={`plan-progress is-${progress.kind}`}>
      <div className="plan-ring" aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="24" className="plan-ring-track" />
          <circle
            cx="32"
            cy="32"
            r="24"
            className="plan-ring-fill"
            transform="rotate(-90 32 32)"
            style={{ strokeDasharray: RING, ['--ring-offset' as string]: `${RING * (1 - progress.fraction)}`, ['--ring-full' as string]: `${RING}` }}
          />
        </svg>
        <span className="mono">{weekLabel}</span>
      </div>

      <div className="plan-course">
        <p className="plan-countdown mono">{countdown(progress)}</p>
        <div className="course" aria-hidden="true">
          <span className="course-done" style={{ width: percent }} />
          <span className="course-flag" />
          <span className="course-runner" style={{ left: percent }}>
            <Runner pose={POSE[progress.kind]} size={progress.kind === 'rest' ? 16 : 30} />
            {progress.kind === 'rest' && (
              <span className="zzz">
                <i>z</i>
                <i>z</i>
                <i>z</i>
              </span>
            )}
            {progress.kind === 'race' && (
              <span className="tape">
                <i />
                <i />
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
