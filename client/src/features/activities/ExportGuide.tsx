/**
 * How to get a run out of a watch or app as a file Taperday can read, one short set of steps per source. Garmin and
 * Apple Watch come first because most runners have one. Runs added from a file are the runner's own, so they stay on
 * Taperday for good (a run synced from Strava only stays seven days).
 */
export function ExportGuide() {
  return (
    <div className="export-guide">
      <details className="export-way">
        <summary>Garmin</summary>
        <p className="field-help">
          <strong>One run:</strong> the Garmin Connect app can’t export, so use the website (it works in your phone’s browser too).
        </p>
        <ol className="export-steps">
          <li>
            Go to <strong>connect.garmin.com</strong> and sign in.
          </li>
          <li>Open the run (Activities → All activities).</li>
          <li>
            Tap the <strong>gear</strong> at the top right and choose <strong>Export Original</strong>.
          </li>
          <li>Upload the zip it downloads, as it is.</li>
        </ol>
        <p className="field-help">
          <strong>All your runs at once:</strong> on garmin.com, go to Account → <strong>Data Management → Export Your Data</strong> and request
          the export. Garmin emails a link (it can take a few days). Upload that zip as it is: Taperday picks out the runs and skips everything else.
        </p>
        <p className="field-help">
          <strong>From the watch:</strong> plug it into a computer and upload the .fit files in its <strong>GARMIN/Activity</strong> folder.
        </p>
      </details>

      <details className="export-way">
        <summary>Apple Watch</summary>
        <p className="field-help">
          Apple’s Fitness and Health apps can’t save a single workout as a file. Two ways round that:
        </p>
        <ol className="export-steps">
          <li>
            <strong>Through Strava (free):</strong> let your watch sync to Strava as usual, then export the run from Strava’s website (see Strava, below).
          </li>
          <li>
            <strong>With an exporter app:</strong> apps such as HealthFit or RunGap save Apple Watch workouts as .fit files (some features may cost).
            Export the run as .fit and upload it here.
          </li>
        </ol>
      </details>

      <details className="export-way">
        <summary>Strava</summary>
        <ol className="export-steps">
          <li>
            Open the run on <strong>strava.com</strong> (the website, not the app; in your phone’s browser, ask for the desktop site).
          </li>
          <li>
            Tap the <strong>⋯</strong> button and choose <strong>Export Original</strong> (the watch’s own file) or <strong>Export GPX</strong>.
          </li>
          <li>Upload the file. A run added this way stays on Taperday for good.</li>
        </ol>
      </details>

      <details className="export-way">
        <summary>COROS, Polar, Suunto, Wahoo and others</summary>
        <p className="field-help">
          Open the run in the watch’s app or website and look for <strong>Export</strong> or <strong>Share</strong>. Choose .fit if it’s offered,
          otherwise .gpx or .tcx, and upload the file.
        </p>
      </details>
    </div>
  )
}
