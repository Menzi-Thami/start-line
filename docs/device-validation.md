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

Current implementation, browser-engine results, SQL evidence and remaining live checks are recorded in [the follow-up QA report](qa/2026-11-14/app-gaps.md). The complete Chromium suite and disposable SQL validation run independently of any live provider credentials.

Every PR also runs `npm run e2e:connections` in Android-sized Chromium, iPhone-sized WebKit, iPad-sized WebKit and Firefox. See [provider and device validation](integration-validation.md) for the staging configuration report and live verification matrix.

No physical iPhone, Android or iPad is connected to this environment. Live provider identities and an owned test inbox/opted-in push device are still required for actual authorization, delivery, installed-device offline reopen and native WhatsApp/Instagram checks. Browser emulation is recorded separately and does not count those checks as passed.
