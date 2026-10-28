# Mobile and connection recovery checks

Automated browser emulation and physical-device checks are separate results. A Playwright iPhone profile uses desktop WebKit with an emulated viewport; it does not validate the iOS keyboard, Safari chrome, home indicator, or an installed iPhone PWA.

## Automated checks

From `client/`, install the pinned engines with `npx playwright install --with-deps chromium webkit`, then run:

```sh
npm run e2e
npm run e2e:mobile
```

The mobile configuration covers Android-sized Chromium, iPhone-sized WebKit and iPad-sized WebKit. It includes portrait/landscape forms and input focus, alongside the existing responsive training views and callback checks. Frontend tests exercise rejected screen downloads, plan retries with and without a saved copy, history-chart keyboard/touch inspection, and unit conversion.

## Physical-device checklist

Record device, OS, browser version, date, browser/installed mode and pass/fail notes. Run on an iPhone with Safari and an Android phone with Chrome; repeat the tablet layout on an iPad when available. Use a personal test account and sample uploads, without publishing account details or tokens in test notes.

- Open the daily dashboard in portrait and landscape. Check that the header, sticky tabs, last card and bottom navigation clear the notch/home indicator and Safari/Chrome toolbars.
- Build a custom-race plan. Enter distance, race date and goal time using the actual onscreen keyboard. Check focus, field visibility, validation messages and the Continue action while the keyboard is open.
- Open plan tabs by tap, swipe and external keyboard if available. Drag controls and select text without changing tabs accidentally. Check enlarged text and the device's reduced-motion setting.
- Inspect Home's weekly history by touch. Compare announced/visible distances with the accessible table; switch kilometres/miles.
- Throttle or interrupt the connection before loading a saved plan. A failure must offer Retry plan; an available saved copy stays usable and is labelled. Restore the connection and verify retry removes the warning and loads the current plan.
- Interrupt the first download of a screen such as Tools or Runs. The recovery message and reload action must be reachable. Reload after reconnecting; verify the current URL, saved plan and units are retained. Do not expect a screen never downloaded to be available offline.
- Install the app and repeat navigation, keyboard and safe-area checks in standalone mode. Verify previously cached app screens open offline and account data is not served from a service-worker cache.

## Current evidence and outstanding access

On 28 October 2026 the strict .NET Release build passed without analyzer overrides, and all 922 database-independent backend tests passed. Backend formatting and the pending-model-change check also passed. The prior CA1825 failures were caused by the two theory-data collection expressions; the equivalent xUnit constructors preserve every test case and snapshot.

The complete frontend suite passed 484 tests in 53 files. TypeScript, frontend lint, production build and dependency audit passed. The desktop/phone Chromium browser suite passed all 17 tests, and the dedicated Android-sized Chromium project passed all 4 tests. Browser runs used the installed official Google Chrome binary with the real API and production client; these are browser-emulation results, not physical Android results.

Physical iPhone/Android/iPad checks have **not been run**: no physical-device service or device connection is available in this environment. WebKit installation is blocked by the current network policy, so WebKit results must remain **unrun**, not counted as passed or skipped tests.

SQL integration validation is also **unrun** until a real SQL Server is available. This environment's SQL Server image redirects to `centralus.data.mcr.microsoft.com`; Microsoft's signed SQL package feed redirects to `pmc-geofence.trafficmanager.net`. Both routes were investigated with verification enabled. The package build was stopped after diagnosing the blocked redirect.

The environment draft preserves existing domains and adds `playwright.download.prss.microsoft.com` and `pmc-geofence.trafficmanager.net`; the previously saved Chromium/SQL image/GitHub API destinations are still pending too. Review/save the environment settings and publish the environment to activate the configuration. Then retry the affected downloads before claiming readiness:

1. Pull `mcr.microsoft.com/mssql/server:2022-latest` and use the generated-password SQL startup/readiness pattern in `.github/workflows/ci.yml`. Never log or commit the password.
2. Set `STARTLINE_TEST_SQL` for an isolated test database and run `dotnet test StartLine.slnx -c Release` without filtering integration tests.
3. Run `scripts/check.sh` with that database configured. It remains the full premerge check; a successful filtered backend suite does not replace it.
4. Install WebKit and run `npm run e2e:mobile`. Record each engine's actual outcome separately, then complete the physical-device checklist above.
