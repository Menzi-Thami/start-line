import { RunningAppGuides } from './RunningAppGuides'

/** The same provider-specific instructions are available in Runs and connection settings. */
export function StravaDeviceGuide() {
  return <details className="device-guide">
    <summary>How do my runs get into Strava?</summary>
    <p className="field-help">A free Strava account is enough to connect phone apps and watches to Taperday. Link your recording app to Strava, then connect that same Strava account here.</p>
    <RunningAppGuides />
    <p className="field-help">Taperday checks recent recordings from the last six weeks. Your recording app controls what it sends to Strava; earlier history and individual measurements may be unavailable.</p>
  </details>
}
