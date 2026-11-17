# Phone and Nike Run Club recordings

The reported runner uses Nike Run Club on a phone and could not find a file to export. Runs previously led with watch file instructions. It now offers **I run with my phone** before uploads, and the file help links to the same guide with keyboard focus moved to its disclosure label. Empty Runs also opens phone/app options. The open guide survives switches between the mobile page and desktop split view.

The guide explains both connections: **Nike Run Club → Strava → Taperday**. Nike's Settings → Partners connection sends newly recorded runs only; it does not import existing Nike history. The action opens Taperday's actual Account → Connections & run sources section, where the existing Strava authorization flow is available. It does not connect or claim authorization automatically.

With a current training plan, the guide also opens that plan, where **Log a run** accepts known time and distance. Manual training entries retain their existing date limits and cannot supply missing GPS, splits or heart-rate data. Without a current plan, that action is absent. No independent run storage or background GPS recorder is added.

Account's device guide now includes Nike Run Club and corrects the Samsung Health connection direction; connecting Health Connect is not presented as an import of Android workouts. Existing file upload, duplication handling, analysis and provider retention remain unchanged.

## Evidence

| Viewport | Light | Night Run |
| --- | --- | --- |
| 375px | [Phone guide](phone-375-light.png) | [Phone guide](phone-375-dark.png) |
| 1440px | [Phone guide](phone-1440-light.png) | [Phone guide](phone-1440-dark.png) |

- `activities.test.tsx`: actual App navigation from file help to focused phone guidance, honest Nike history limits, no file uploaded, no plan action when no plan exists, and the real expanded connection settings/Strava control. Existing upload and deletion coverage remains.
- `sync.test.tsx`: Nike guidance remains accessible in Account alongside the existing devices.
- `phone-runs.spec.ts`: actual App with synthetic authentication/API data; phone guide → connection settings, manual log navigation with an active plan, no plan action without one, and no browser errors. All WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags and horizontal overflow checks run at 320, 375, 768 and 1440px in both themes. Responsive layout changes mount a new Runs panel; the guide must remain open throughout. The file runs in Chromium desktop/phone and the additional Android Chromium, iPhone/iPad WebKit and Firefox CI matrix.
- Connection navigation runs at the project's native device size before the viewport audits, followed by a return to Runs. This preserves the full navigation checks while avoiding stale mobile pointer coordinates after desktop-size emulation.
- The existing `plan-theatre.spec.ts` final-day calendar test pins 16 November 2026: November 30 is exactly the 14-day earliest race date. Its visibility, hit-target, selection and Continue-button assertions remain intact as the real date advances.

Provider behavior was checked against the official [Nike/Strava guide](https://support.strava.com/en-us/articles/15401850-nike-and-strava), [phone recording guide](https://support.strava.com/en-us/articles/15402137-how-do-i-record-an-activity-on-strava) and [Samsung Health guide](https://support.strava.com/en-us/articles/15401747-samsung-health-and-strava) on 17 November 2026. These are instructions for external apps; synthetic browser tests do not establish a successful live Nike authorization, real-device delivery or historical backfill.

Test counts and the tested commit are recorded in the pull request. No production data or account was used, and no merge or deployment was performed.
