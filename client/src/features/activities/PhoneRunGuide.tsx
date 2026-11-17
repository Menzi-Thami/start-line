import { RunningAppGuides } from '../sync/RunningAppGuides'
import { PoweredByStrava } from '../sync/StravaBrand'

interface Props {
  onOpenConnections: () => void
  onOpenPlan?: () => void
}

/** One setup route for phones and watches, with provider limits and a manual fallback. */
export function PhoneRunGuide({ onOpenConnections, onOpenPlan }: Props) {
  return (
    <div className="phone-run-guide">
      <PoweredByStrava />
      <p><strong>A free Strava account is enough.</strong> Connect it to Taperday once. Record with Strava on your phone, or link your running app or watch to Strava, and shared recordings import automatically.</p>
      <button type="button" className="button button-primary" onClick={onOpenConnections}>Open connection settings</button>
      <p className="field-help"><a href="https://www.strava.com/mobile" target="_blank" rel="noopener noreferrer">Get Strava for your phone</a> · No paid Strava subscription required.</p>
      <p className="field-help">Taperday checks recordings from the last six weeks. Time and distance come from the recording; heart rate and elevation appear when your recorder shares them. Your recording app controls which runs and measurements it shares.</p>
      <details className="device-guide"><summary>Help connecting my app or watch</summary><RunningAppGuides /></details>
      {onOpenPlan && <>
        <h3>No file for a training run?</h3>
        <p className="field-help">In your current training plan, use <strong>Log a run</strong> to save the time and distance you know. A manual log does not add GPS data or recording analysis.</p>
        <button type="button" className="button button-quiet" onClick={onOpenPlan}>Open my training plan</button>
      </>}
    </div>
  )
}
