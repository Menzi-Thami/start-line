# Plan → Day Detail → Run Analysis implementation

This is a working implementation slice of #185 on #187. It does not complete the whole-app roadmap. Base: `main` at `6ba76a92335572f792ec497f02fc1dabef017d34`. Implementation commits: `8d0755d`, `7aad834`, `194a5d1`. The other open PRs (#179, #185, #186) were inspected for overlap; none is merged into this branch or modified remotely.

## Implemented

- Seven-date phone selector with separate today/selection states, selected-day preview, larger date controls below 360px, previous/next week controls and coming-up list. Desktop uses a vertical schedule beside the preview.
- Week and month previews open the same full-height day screen. Day URLs support browser Back/Forward, refresh, and week/tab/month return context. Selection does not mutate check-ins. Existing run logging, source associations, saved entries, exercise tracking, strength completion and sharing remain in the existing components.
- Shared preview/week/month status text and icons distinguish completion, partial/skipped answers, recorded activity, provisional Strava evidence, planned sessions and rest. Day detail explicitly labels cut-short and provisional states.
- Run analysis has keyboard-accessible Overview/Pacing/Coach/Splits tabs. Pacing includes an interactive per-split pace trace, optional work-target band and accessible split selector; exact values remain in the split table. Source attribution, shoes, HR context, best efforts, sharing and deletion remain available.
- Existing deterministic review and #187's distance comparison are reused. Matching distance never claims that intervals, recoveries or cool-down were followed. Exact stage execution is explicitly unassessed. No provider calls, API contracts, generator versions or permanent Strava-derived storage were added.
- Plan tools and preparation controls follow the schedule; safety warnings remain near the top. Existing shipped theme tokens and device light/dark selection are preserved.

## Executed checks

- TypeScript check and warning-denying lint: passed.
- Production client build: passed; existing >500 kB chunk advisory remains.
- Full client suite: **665 passed / 88 files**, one worker, 30-second test timeout. Following final navigation/chart refinements, focused regression suite: **46 passed / 5 files**. See raw [unit output](logs/client-tests.log) and [focused output](logs/focused-tests.log).
- Backend domain: **1,094 passed**; application: **127 passed**; architecture: **7 passed**. See [logs](logs/).
- Release solution build: passed with **0 warnings / 0 errors** ([output](logs/backend-build.log)).
- Focused Chromium suite: **16 passed** ([output](logs/browser-tests.log)), including all nine requested widths, preview/detail/run keyboard navigation, browser Back/Forward, deep-link refresh, calendar return context, saved-log lifecycle, source expiry and mutation failures. Extra cases cover light theme, 900×430 landscape and 200% CSS zoom at 1440 px. CSS zoom is an approximation, not a physical-device text-scale test.

Reproduce browser checks from `client/` with `npx playwright test --config playwright.redesign.config.ts`. This uses Playwright's installed Chromium by default; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select a locally installed Chrome. The config starts a local Vite fixture server and makes no production requests.

The client suite was first run with two workers and exposed a lazy-loaded screen timing failure under load; the targeted case passed, the navigation helper now allows 10 seconds for the lazy screen, and the full documented one-worker run passed. Browser expectations for the old inline summary were updated to follow preview → detail, rather than querying hidden schedule controls.

## Actual browser screenshots

These show real components rendered in local Chromium with synthetic fixture data, not production runner data or fabricated UI. Before screenshots use the original `main` components with the same plan, activity, date, theme and viewport as after screenshots. These QA assets are not approved production campaign images for #186.

| Width | Original week | New week | Original day | New day | New pacing |
| --- | --- | --- | --- | --- | --- |
| 320 | [Before](week-before-320.png) | [After](week-after-320.png) | [Before](day-before-320.png) | [After](day-after-320.png) | [Chart](pacing-after-320.png) |
| 768 | [Before](week-before-768.png) | [After](week-after-768.png) | [Before](day-before-768.png) | [After](day-after-768.png) | [Chart](pacing-after-768.png) |
| 1440 | [Before](week-before-1440.png) | [After](week-after-1440.png) | [Before](day-before-1440.png) | [After](day-after-1440.png) | [Chart](pacing-after-1440.png) |

Additional week/day/pacing/splits snapshots cover 375, 390, 430, 1024, 1280 and 1920 px. Original full run screens are captured at 320, 768 and 1440 px. All evidence is in this directory.

## Continuation checklist

- [ ] Extend Domain `RunReview` using reliable time/distance stream evidence to assess warm-up, work, recovery and cool-down stages. Cover pauses, GPS noise, partial/time-only workouts and ambiguous activity associations. Keep source expiry, ownership and no-persistent-Strava-assessment rules intact. This PR only presents existing review and split/distance evidence.
- [ ] Finish Runs listing card hierarchy and advanced analysis presentation, with source/error/empty-state coverage.
- [ ] Progress: preserve the existing volume chart; add comparable-pace trends, period controls, consistency calendar and milestone drilldowns with accessible data alternatives. No new Progress visualizations are claimed here.
- [ ] Home: simplify the dashboard and add direct navigation into the canonical day route. Builder, Strength and Account: implement the remaining prioritized audit changes and verify retained drafts/set tracking/settings.
- [ ] Consolidate legacy CSS only with cross-screen regression evidence; unify remaining Home/Runs/Progress status surfaces and mixed-session semantics.
- [ ] Validate against #179 after its contracts are ready, without absorbing its unfinished account-sync implementation.
- [ ] Full `scripts/check.sh`, SQL-backed integration/migration checks against disposable local SQL, entire application Playwright suite, Firefox/Safari, assistive technology and physical iOS/Android/PWA testing remain outstanding. Focused Chromium fixtures do not establish these results. No production services or real Strava accounts were used.

Keep this PR draft and unmerged. No deployment or customer email is authorized by this verification record.
