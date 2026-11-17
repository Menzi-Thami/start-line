# Phone, watch and automatic import coverage

Runs now offers one collapsed **Connect a phone or watch** guide before file upload. It explicitly says a **free Strava account is enough**, links the phone app, and explains connecting the same account to Taperday. Individual setup rows cover Strava phone recording, Nike Run Club, Garmin, Apple Workout, Samsung Health, Fitbit/Pixel/Google Health, Huawei, COROS, Polar/Suunto/Wahoo, indoor/virtual runs and other apps/files. Account uses the same source guidance. The open outer guide survives mobile/desktop layout changes; export help opens it with keyboard focus below the sticky header.

Known measurements come from the recording. No watch, paid runner subscription or invented recording is required. Missing heart rate/elevation stay missing. Source-specific limits are explicit: Nike only sends newly recorded runs after linking; Apple's connection forwards native Apple Workout activities from the past 30 days, not arbitrary Health entries; Samsung's connection is Android/GPS only; Huawei availability varies by country. Direct native Apple Health/Health Connect access is unavailable in this web app. A compatible FIT, GPX or TCX file remains an alternative. Manual training logging is offered when a current training plan exists, retaining its existing date limits.

## Reliability changes

The newest run's date was an unsafe catch-up cursor. SQL regression tests reproduced a late Nike recording being missed and an expired recent copy failing to return when a newer run existed. Catch-up now rescans the supported six-week window within the existing throttle/page/rate limits. It skips fresh cached runs and uploaded originals. Totals-only/manual Strava entries produce an explanatory skipped issue rather than disappearing; these are negatively cached for a day, and update webhooks fetch immediately. A new fetch clears old issues for that runner/provider/activity.

Runs now starts catch-up without requiring a training plan, polls pending work and reconciles missed webhooks on foreground/visible periodic checks. Failed requests remain failures, with retry; already loaded recordings remain visible within their lifetime. Expired imports and their displayed bests are removed even offline. Account changes and late responses cannot reveal/replace another runner's runs. Your run data refreshes even when an import is skipped and the list remains empty. Account reports cached recordings available in Runs and provides Check for runs rather than claiming they are all in a plan.

## Screenshots

Synthetic runners and production fonts. Default synced Runs stays compact; setup detail is opt-in.

| View | Light | Night Run |
| --- | --- | --- |
| Setup, 375px | [Phone](phone-375-light.png) | [Phone](phone-375-dark.png) |
| Setup, 1440px | [Desktop](phone-1440-light.png) | [Desktop](phone-1440-dark.png) |
| Synced Runs, 375px | [Phone](synced-375-light.png) | [Phone](synced-375-dark.png) |

Before this expansion: [phone guide at d9a159c](https://github.com/Menzi-Thami/start-line/blob/d9a159c48c3d7424546c9da6bbaab761387eadc1/docs/qa/2026-11-17/phone-runs/phone-375-dark.png). The same PR preserves Night Run colours, typography, runner animation, bottom navigation, uploads, analysis and provider retention.

## Sequence matrix

| Layer | Scenarios |
| --- | --- |
| Disposable SQL and fake provider | Late upload behind a newer recording → catch-up → repeated catch-up without duplicates; expiry → newer import → catch-up restores supported older recording; phone/Nike/Apple/COROS/virtual measured metrics; missing samples → explained skip → no immediate redundant fetch → update webhook restores recording and removes issue |
| Shared hook | Immediate recording read while status waits; catch-up without a plan; pending → new recording → stop frequent poll; foreground and visible timer; failed initial read distinct from empty; failed refresh retains valid data → retry; stale responses; account switch; hidden/disabled screens; expiry while offline removes imported run/best and preserves upload |
| Actual App / browser | Export help → focused guide → real expanded connection settings → official Strava control → return; manual training log with plan, absent without plan; import without plan → pending → actual measured card → failed refresh → retry → reload; reconnect, unavailable integration, failed initial read and recovery; skipped import details appear despite an empty list |
| Visual / accessibility | Both themes; 320, 375, 768, 1440px; production fonts; all WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags; no horizontal overflow; desktop Chromium, Android Chromium, iPhone/iPad WebKit and Firefox CI projects |

Native-device navigation runs before viewport sweeps to preserve real pointer behavior. No forced clicks or disabled WCAG checks. The existing final-day calendar test pins 16 November 2026 so November 30 remains its intended 14-day boundary; hit-target, visibility, selection and Continue assertions remain intact.

## Provider evidence and limits

Setup instructions were checked on 17 November 2026 against official Strava documentation: [phone](https://support.strava.com/en-us/articles/15402137-how-do-i-record-an-activity-on-strava), [Nike](https://support.strava.com/en-us/articles/15401850-nike-and-strava), [Garmin](https://support.strava.com/en-us/articles/15401903-garmin-and-strava), [Apple](https://support.strava.com/en-us/articles/15402024-apple-health-and-strava), [Samsung](https://support.strava.com/en-us/articles/15401747-samsung-health-and-strava), [Google Health](https://support.strava.com/en-us/articles/15401544-google-health-and-strava), [Huawei](https://support.strava.com/en-us/articles/15401666-huawei-health-and-strava), [COROS](https://support.strava.com/en-us/articles/15401790-coros-and-strava), [indoor](https://support.strava.com/en-us/articles/15401956-indoor-treadmill-and-bike-trainer-activities) and the [supported-app directory](https://support.strava.com/en-us/articles/16312772-what-devices-and-apps-are-compatible-with-strava).

These tests use synthetic authentication/API responses and a fake provider, never real runner data. They do not prove live third-party authorization, physical-device delivery or Taperday's Strava app capacity/approval. Those settings are separate from runners using free Strava accounts. Existing six-week initial/catch-up scan, five-page listing bound, 1,000-recording account cap and seven-day rolling provider cache remain. Linked sources control which recordings and measurements they expose; unsupported historical Nike recordings cannot be retrieved by this change. No direct device SDK, native GPS recorder, schema migration or independent manual-history store is added.

Actual final check results and tested commit are recorded in PR #272. No merge or deployment performed.
