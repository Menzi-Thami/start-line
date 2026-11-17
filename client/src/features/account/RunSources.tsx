/**
 * Supported recording routes and the limits of native health-store access. Strava has its own section just above
 * this in Account; Home only nudges when it isn't connected.
 */
export function RunSources({ onOpenRuns }: { onOpenRuns: () => void }) {
  return (
    <section className="section" aria-labelledby="run-sources">
      <h3 id="run-sources">Your runs, from anywhere</h3>
      <ul className="home-connections">
        <li className="home-connection">
          <span className="home-connection-name">Phones and watches</span>
          <span className="field-help">Use a free Strava account for compatible recording apps and watches, or upload a .fit, .gpx or .tcx file.</span>
          <button type="button" className="link-button" onClick={onOpenRuns}>
            See import options
          </button>
        </li>
        <li className="home-connection">
          <span className="home-connection-name">Garmin, COROS, Polar, Suunto and more</span>
          <span className="field-help">Connect your device’s app to Strava, or upload its recording file. Direct device-account connections are not available here.</span>
        </li>
        <li className="home-connection">
          <span className="home-connection-name">Apple Health · Health Connect</span>
          <span className="field-help">Direct Apple Health or Health Connect access is not available in this web app. Check the app-specific Strava setup in Runs.</span>
        </li>
      </ul>
    </section>
  )
}
