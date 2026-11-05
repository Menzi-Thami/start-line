import { Runner, type RunnerPose } from './Runner'

interface Props {
  title: string
  detail?: string
  pose?: RunnerPose
}

/** Reuses Taperday's own animated character for short, meaningful waiting states. */
export function RunnerStatus({ title, detail, pose = 'sprint' }: Props) {
  return (
    <div className="runner-status" role="status" aria-live="polite" aria-label={title}>
      <div className="runner-status-character" aria-hidden="true"><Runner pose={pose} size={46} /></div>
      <div className="runner-status-copy">
        <strong>{title}</strong>
        {detail && <p className="field-help">{detail}</p>}
      </div>
    </div>
  )
}
