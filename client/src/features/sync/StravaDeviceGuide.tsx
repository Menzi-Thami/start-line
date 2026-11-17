/**
 * How runs from each kind of watch or phone reach Strava, and so Taperday. Strava is the hub: almost every device
 * already syncs there, so one connection covers them all. Menu names differ between app versions, so the steps say
 * where to look rather than promising exact labels.
 */
const DEVICES = [
  {
    name: 'Nike Run Club',
    steps: 'In Nike Run Club, open your profile, then Settings → Partners → Strava. Connect Strava to Taperday here too. Only runs recorded after linking Nike to Strava will sync; older Nike runs are not imported.',
  },
  {
    name: 'Garmin',
    steps: 'In the Garmin Connect app, open Settings, then Connected Apps, and connect Strava. Runs sync after each save.',
  },
  {
    name: 'Apple Watch or iPhone',
    steps:
      'In the Strava app, go to Settings, then Applications, Services, and Devices, and connect Health. Workouts from the Workout app then copy to Strava. Or record with Strava on the watch.',
  },
  {
    name: 'Android, Samsung, Pixel or Fitbit',
    steps:
      'Record with the Strava app on your phone. If you use Samsung Health on Android, connect Strava under Samsung Health’s Settings → Services; only GPS workouts sync. For another device, check its app’s Strava connections.',
  },
  {
    name: 'COROS, Polar, Suunto or Wahoo',
    steps: 'In your watch maker’s app, look for third-party or partner apps in its settings and connect Strava.',
  },
  {
    name: 'Just a phone',
    steps: 'Record your run with the Strava app. It lands in Taperday when you save it.',
  },
] as const

export function StravaDeviceGuide() {
  return (
    <details className="device-guide">
      <summary>How do my runs get into Strava?</summary>
      <p className="field-help">Almost every watch and phone can send runs to Strava. Set it up once, and every run you save reaches Taperday too.</p>
      <dl className="device-guide-list">
        {DEVICES.map((device) => (
          <div key={device.name}>
            <dt>{device.name}</dt>
            <dd>{device.steps}</dd>
          </div>
        ))}
      </dl>
      <p className="field-help">Not on Strava at all? Upload the run’s .fit file from My runs instead.</p>
    </details>
  )
}
