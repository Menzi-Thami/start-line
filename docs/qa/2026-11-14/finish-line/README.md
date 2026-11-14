# Finish line → race → recovery → next chapter: QA record (PR #262)

Screenshots in this folder are of the **real React screens** (`client/src/features/journey`), driven by Playwright through
`client/e2e/finish-line.spec.ts` against the test-only fixture `client/e2e/fixtures/finish-line.tsx`. The fixture keeps a
synthetic journey in memory in place of the API (no account, no database, no real runner). The API itself is covered
separately by the SQL integration tests (`tests/StartLine.Integration.Tests/JourneyTests.cs`) on a disposable LocalDB.

## Screens

| # | Screen | Files |
|---|---|---|
| 02 | Finish Line film: runner mid-course, revealed, reduced-motion still (dark) | `02-finish-film-*.png` |
| 03 | Training story, phone light and dark | `03-training-story-phone-*.png` |
| 04 | "How did race day go?" and the result form | `04-race-result-*.png` |
| 05 | Race celebration (its own film, with the goal comparison) | `05-race-celebration-phone-light.png` |
| 06 | Recovery offer (optional, effort, preference, red flags) | `06-recovery-offer-phone-light.png` |
| 07 | Recovery on the plan after a "Good to go" check-in; Home's recovery card | `07-*.png` |
| 08 | Calendar: plan ended mid-month, custom mid-week start, recovery days only from the recovery plan, a run recorded after it | `08-*.png` |
| 09 | Next chapter: keep running comfortably, another race, more recovery | `09-next-challenge-phone-light.png` |
| 10 | Maintenance | `10-maintenance-phone-light.png` |
| 11 | Running journey with a past chapter opened, desktop light and dark | `11-running-journey-desktop-*.png` |
| matrix | Story, recovery and journey at 375, 1024 and 1440 px, light and dark | `matrix-*.png` |
| edge | Incomplete training, pain check-in, very long race name, no history, history unavailable | `edge-*.png` |

## What the browser journeys assert

- No horizontal scroll and every button at least 44 px tall at 320, 375, 768, 1024 and 1440 px, light and dark.
- axe-core WCAG 2.2 AA: no violations on the story, recovery and journey screens at every width and theme.
- The film is a dialog: focus starts on its main action and stays inside it on Tab, Escape closes it, page scroll is
  locked while it's open and restored after, focus returns to "Replay finish line". Reduced motion shows the same
  content, still.
- The card downloads as `taperday-training-story.png`.
- Full journey: race result saved → race film → recovery offered → started → "Good to go" → "I feel recovered" → next
  chapter → maintenance started.
- Calendar: real rest inside the plan; neutral before a custom start and after the race; recovery only on its own days;
  an unplanned run after the plan is "activity recorded", not "done".

## Limits

- Emulated phone viewports in desktop Chromium, not physical iPhone/Android devices; native share sheets and the
  installed PWA were not exercised on a device.
- The fixture stands in for the API; persistence, ownership, idempotency and concurrency are tested at the API layer.
