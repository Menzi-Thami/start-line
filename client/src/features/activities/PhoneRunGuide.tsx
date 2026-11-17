interface Props {
  onOpenConnections: () => void
  onOpenPlan?: () => void
}

/** Phone recordings use the same Strava import as watch recordings; no file export is needed. */
export function PhoneRunGuide({ onOpenConnections, onOpenPlan }: Props) {
  return (
    <div className="phone-run-guide">
      <p>No watch needed. Keep recording in your running app and use Strava to bring new runs into Taperday.</p>
      <h3>Nike Run Club</h3>
      <ol className="export-steps">
        <li>In Nike Run Club, open your profile, then <strong>Settings → Partners → Strava</strong>, and connect your accounts.</li>
        <li>In Taperday, open <strong>Account → Connections &amp; run sources</strong> and connect Strava.</li>
        <li>Keep recording with Nike Run Club. New saved runs sync through Strava to Taperday.</li>
      </ol>
      <p className="field-help">Only runs recorded after linking Nike to Strava will sync. Older Nike runs stay in Nike Run Club; linking does not import them.</p>
      <p className="field-help"><a href="https://support.strava.com/en-us/articles/15401850-nike-and-strava" target="_blank" rel="noopener noreferrer">Nike Run Club connection help</a></p>
      <h3>Strava on iPhone or Android</h3>
      <p className="field-help">You can also record directly in the Strava app: choose Record, select Run, then start and save your run. Connect Strava to Taperday once to import saved runs automatically.</p>
      <button type="button" className="button button-primary" onClick={onOpenConnections}>Open connection settings</button>
      {onOpenPlan && <>
        <h3>No file for a training run?</h3>
        <p className="field-help">In your current training plan, use <strong>Log a run</strong> to save the time and distance you know. A manual log does not add GPS data or recording analysis.</p>
        <button type="button" className="button button-quiet" onClick={onOpenPlan}>Open my training plan</button>
      </>}
    </div>
  )
}
