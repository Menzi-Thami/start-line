/** Setup and limits checked against the linked provider documentation. The recording must reach Strava first. */
const SOURCES = [
  { id: 'strava', name: 'Strava on a phone',
    steps: 'On iPhone or Android, open the Strava app, choose Record → Run, then start and save your run. Connect that same Strava account to Taperday.',
    note: 'A free Strava account is enough. A watch and a paid Strava subscription are not required.',
    help: 'https://support.strava.com/en-us/articles/15402137-how-do-i-record-an-activity-on-strava' },
  { id: 'nike', name: 'Nike Run Club',
    steps: 'In Nike Run Club, open your profile, then Settings → Partners → Strava. Link your accounts, then connect that Strava account to Taperday.',
    note: 'Only runs recorded after linking Nike to Strava will sync. Older Nike runs stay in Nike Run Club; linking does not import them.',
    help: 'https://support.strava.com/en-us/articles/15401850-nike-and-strava' },
  { id: 'garmin', name: 'Garmin',
    steps: 'In Strava, open You → Settings → Connect an App or Device → Garmin. Sign in to Garmin Connect and allow Activities sharing. Save and sync your run in Garmin Connect.',
    note: 'Check that the recording appears in Strava first. Garmin controls which past activities it sends; a missing older run can also be uploaded as a file.',
    help: 'https://support.strava.com/en-us/articles/15401903-garmin-and-strava' },
  { id: 'apple', name: 'Apple Watch / Apple Workout',
    steps: 'In Strava, open Settings → Manage Apps and Devices → Health. Allow Workouts and turn on Automatic Uploads for runs recorded with Apple Workout.',
    note: 'Apple Workout activities from the past 30 days can sync. Workouts another app writes to Apple Health are not forwarded through this connection.',
    help: 'https://support.strava.com/en-us/articles/15402024-apple-health-and-strava' },
  { id: 'samsung', name: 'Samsung Health',
    steps: 'On Android, open Samsung Health → Settings → Services and connect Strava. Record a GPS run and let Samsung Health finish syncing it.',
    note: 'Samsung Health only sends GPS activities through this connection. Its iPhone app does not offer this Strava connection.',
    help: 'https://support.strava.com/en-us/articles/15401747-samsung-health-and-strava' },
  { id: 'google', name: 'Fitbit / Pixel Watch / Google Health',
    steps: 'In Strava, open You → Settings → Connect an app or device → Google Health, or use Partner Apps → Strava in Google Health. Enable sharing for running activities.',
    note: 'Update the connection if you still use the older GPS-only integration. Health Connect alone does not import your workouts into Strava.',
    help: 'https://support.strava.com/en-us/articles/15401544-google-health-and-strava' },
  { id: 'huawei', name: 'Huawei Health',
    steps: 'Open Huawei Health → Me → Privacy Management → Data Sharing and Authorization → Strava, and authorize the connection.',
    note: 'Availability depends on your country. If the option is missing or a run does not reach Strava, check Huawei’s syncing guidance or use a supported recording file.',
    help: 'https://support.strava.com/en-us/articles/15401666-huawei-health-and-strava' },
  { id: 'coros', name: 'COROS',
    steps: 'In the COROS app, open Profile → Settings → 3rd Party Apps → Strava, and authorize the connection. Sync the watch to COROS after each run.',
    note: 'You can also export a FIT or TCX recording from the activity in COROS and upload it to Taperday.',
    help: 'https://support.strava.com/en-us/articles/15401790-coros-and-strava' },
  { id: 'watches', name: 'Polar, Suunto or Wahoo',
    steps: 'In your device’s app, open its connected or partner apps settings and link Strava. Sync your recording to the device’s app, then check that it appears on Strava.',
    note: 'Menu names and historical imports vary by provider. A FIT, GPX or TCX file is an alternative when available.',
    help: 'https://support.strava.com/en-us/articles/16312772-what-devices-and-apps-are-compatible-with-strava' },
  { id: 'indoor', name: 'Treadmill or virtual running',
    steps: 'Use a compatible watch or treadmill app to record time and distance and send the recording to Strava. Taperday accepts recorded treadmill and virtual runs; a GPS map is not required.',
    note: 'Manually typed Strava activities and entries with totals only do not contain the recording samples needed for analysis. You can log known time and distance in your training plan.',
    help: 'https://support.strava.com/en-us/articles/15401956-indoor-treadmill-and-bike-trainer-activities' },
  { id: 'other', name: 'Another running app or watch',
    steps: 'Look for a Strava connection in your app’s settings. Otherwise, export a FIT, GPX or TCX recording and upload it directly to Taperday.',
    note: 'A screenshot or shareable activity link is not a recording file. Some apps do not export recordings or share earlier activities.',
    help: 'https://support.strava.com/en-us/articles/16312772-what-devices-and-apps-are-compatible-with-strava' },
] as const

export function RunningAppGuides() {
  return <div className="export-guide running-app-guides">
    {SOURCES.map(source => <details key={source.id} className="export-way" data-run-source={source.id}>
      <summary>{source.name}</summary>
      <p className="field-help">{source.steps}</p>
      <p className="field-help">{source.note}</p>
      <p className="field-help"><a href={source.help} target="_blank" rel="noopener noreferrer">{source.name} setup help</a></p>
    </details>)}
  </div>
}
