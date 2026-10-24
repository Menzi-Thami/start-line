/**
 * Every way a run gets into Taperday, and the ones still coming, honestly marked. Strava has its own section just above
 * this in Account; Home only nudges when it isn't connected.
 */
export function RunSources({ onOpenRuns }: { onOpenRuns: () => void }) {
  return (
    <section className="section" aria-labelledby="run-sources">
      <h3 id="run-sources">Your runs, from anywhere</h3>
      <ul className="home-connections">
        <li className="home-connection">
          <span className="home-connection-name">Any watch</span>
          <span className="field-help">Upload a .fit, .gpx or .tcx file: Garmin, Coros, Polar, Suunto and more.</span>
          <button type="button" className="link-button" onClick={onOpenRuns}>
            Upload a run
          </button>
        </li>
        <li className="home-connection home-connection-soon">
          <span className="home-connection-name">Garmin Connect</span>
          <span className="field-help">Coming. Until then, upload your .fit files from Garmin Connect.</span>
        </li>
        <li className="home-connection home-connection-soon">
          <span className="home-connection-name">Apple Health · Health Connect</span>
          <span className="field-help">Coming with the Taperday phone app: a website can’t read them.</span>
        </li>
      </ul>
    </section>
  )
}
