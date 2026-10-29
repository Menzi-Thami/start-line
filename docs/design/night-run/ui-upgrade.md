# Responsive UI upgrade

Taperday keeps its Night run identity: near-black surfaces, volt actions, the tapering wordmark, Bricolage headings, Atkinson body text and mono running numbers. The desktop/tablet/phone design board guides composition rather than introducing new capabilities.

## Experience

- Desktop pairs the greeting with a real race countdown, places today's session beside weekly progress, and gives running history and records their own columns. Content stays bounded on ultrawide screens.
- Phones stack the race and daily session above supporting details. The existing mobile dock keeps its sliding selection and safe-area spacing.
- Calendar dates support arrow keys and Home/End. Every date, including rest days, opens a responsive planned/recorded day summary and returns focus on close. See [calendar day summaries](../../calendar-day-summary.md).
- Weekly-volume charts support touch selection, keyboard inspection and Escape dismissal, with announced week/distance values and the existing accessible data table.
- Home and plan swipes leave native controls, editable content, calendars and charts alone. Cancelled and multi-touch starts do not navigate.
- Scroll progress, back-to-top, page transitions, card feedback and loading skeletons respect reduced motion. Back-to-top returns keyboard focus to navigation.
- Calculators download when Tools first opens and retain their values when switching tabs. Account and running pages have separate chunks; the sign-in SDK loads only when accounts are configured.

The countdown and time-to-race rail use existing plan dates. Training volume and running totals retain their existing definitions. No training-load score, route elevation, run recording action, new API or generator behavior was added.

## Validation

- TypeScript (`npm run typecheck`), frontend lint (`npm run lint`) and production build (`npm run build`) pass.
- Complete frontend suite: **474 tests in 51 files passed**, using `npx vitest run --testTimeout=30000 --maxWorkers=1` on Node 22.
- **15 Playwright tests passed** against the real API and production client, using official Google Chrome. Includes plan generation, shared links, calendar feeds, miles, PWA/offline behavior, intro motion, callback handling, and new responsive/keyboard/reduced-motion checks.
- Layout overflow checks cover **320, 390, 768, 1024, 1440 and 2560px**. The actual Home component was also visually reviewed using a local fixture at phone, tablet, desktop and ultrawide widths.
- Backend: **7 architecture, 103 application and 812 domain tests passed**. Domain validation used `-p:WarningsNotAsErrors=CA1825` for the pre-existing analyzer findings below; that is not a strict solution-build pass.
- Production main JavaScript is approximately **430 kB (133 kB gzip)**; no large-chunk warning. The authentication SDK is a separate approximately 257 kB chunk.
- Final diff reviewed; dependency declarations, lockfiles, backend source, data models, generator versions and API contracts are unchanged.

## Limits before merge

The strict backend solution build still fails existing CA1825 errors in `GeneratorV1SnapshotTests.cs:91` and `ExperienceAndStrengthTests.cs:156`. SQL integration tests were not run because the SQL Server image download is blocked by the environment network policy. Consequently `scripts/check.sh` is not fully green; do not merge until those independent checks are resolved.

Browser validation uses Chromium with phone emulation, not physical iOS/Android devices or WebKit. Live Entra sign-in and Strava authorization were not exercised; existing frontend account/sync tests and callback browser coverage passed.

## Changed files

- `client/e2e/ui-polish.spec.ts`
- `client/src/app/App.tsx`
- `client/src/app/AppAuth.test.tsx`
- `client/src/app/AppAuth.tsx`
- `client/src/app/ScrollProgress.test.tsx`
- `client/src/app/ScrollProgress.tsx`
- `client/src/app/TabBar.test.tsx`
- `client/src/app/TabBar.tsx`
- `client/src/app/sign-in-flow.test.tsx`
- `client/src/features/plan/PlanCalendar.test.tsx`
- `client/src/features/plan/PlanCalendar.tsx`
- `client/src/features/plan/PlanView.tsx`
- `client/src/features/plan/VolumeChart.test.tsx`
- `client/src/features/plan/VolumeChart.tsx`
- `client/src/features/runner-home/Home.test.tsx`
- `client/src/features/runner-home/Home.tsx`
- `client/src/lib/swipe.test.ts`
- `client/src/lib/swipe.ts`
- `client/src/main.tsx`
- `client/src/styles/app.css`
- `client/src/styles/polish.css`
- `docs/design/night-run/ui-upgrade.md` (this report)
