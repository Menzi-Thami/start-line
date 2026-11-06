# Taperday UX: verified gap matrix (Phase 0)

The handover for this redesign is #202 (`CLAUDE_UX_HANDOVER.md` and `DESIGN_IMPLEMENTATION_CONTRACT.md`).

- **Audited:** `origin/staging` at `fb97ee2`, on 6 November 2026.
- **Status key:** Existing · Partial · Missing · Broken · Unverified.

## How this was checked

- **Code and git history:** the app shell, `TabBar`, the screens and the styles on `staging`. I compared `staging` with `main` for the shell.
- **Baseline screenshots:** these show the real signed-in app. They come from a new test-only page, `client/e2e/fixtures/ux-shell.html`, which renders `<App/>` with an in-page synthetic API. They cover:
  - **Sizes:** phone 390, tablet 768 and desktop 1440;
  - **Themes:** light and dark;
  - **Screens:** Home, Home with no plan, Plan week, Plan calendar, Plan progress, Runs, Account, and the signed-out builder.
- **PR #201 artefacts:** I downloaded and reviewed the CI screenshots from run 42113416401, covering 320 to 2560 wide.
- **Targeted unit tests (all passed, 16 files and 68 tests):**
  - `TabBar`;
  - the builder (DatePicker, StrengthDays, PlanTheatre and TimeWheel);
  - `PlanCalendar`;
  - Strava completion;
  - sync;
  - Couch to 5K.

## Brand: what is actually on staging

- **The current look is "Frame" (#129, 1 November):**
  - a light grey page with a rounded frame;
  - Instrument Serif headings over Instrument Sans;
  - a sage accent (`#b4c7a8` and `#3e683d`);
  - a dark theme;
  - the peeking green runner wordmark (#173).
- **The previous look was "Night Run" (#23 to #27, 9 October to 1 November):**
  - a near-black ground with a volt accent (`#d7ff3e`);
  - Bricolage Grotesque, Atkinson Hyperlegible and JetBrains Mono.

  Its names survive in some CSS comments, but its tokens no longer apply.
- **The conflict:** #202's boards and wording ("lime accent", `#C6FF3E` on near-black) and the attached mock-ups describe the Night Run look, not the current one. **Needs a decision before any colour or type change (Gate A).**

## A. App shell and bottom navigation (P0)

| Item | Status | Evidence |
|---|---|---|
| Bottom bar on phones | **Existing** | `app/TabBar.tsx`, rendered at `App.tsx:1084` below 48rem (768px) for signed-in runners. Items are Home, Plan, Runs and Account, with icons, labels and `aria-current`, an animated pill, 56px targets and safe-area padding. It's identical on `main` and `staging`. |
| History of the bar | Context | 26 Oct (`04e3d30`): Home, Plan, Runs, **Strength**, Account. 29 Oct (#119, `a67be02`): Strength was removed, leaving 4 items. |
| Bar for signed-out runners and runners with a plan link | **Missing** | The bar shows only when `state.kind === 'ready'`. |
| Bar on tablets (768 to 1023) | **Missing** | Tablets get header text links instead. |
| Desktop navigation | Partial | Header pills (Home, Plan, Runs, Account) sit in a centred column. At 1440 and 2560 the content stays narrow, with wide empty margins (PR #201 artefact `ux-run-plan-dark-2560.png`). |
| Progress as a top-level destination | Partial | It's reachable through Plan's Progress tab and Home's "View training progress", but it isn't in the bar. |
| Deep links, Back and refresh | Existing | The `?view=`, `planTab`, `day`, `planWeek` and `month` parameters, plus `popstate`. |

## B. Home (P0)

| Item | Status | Evidence |
|---|---|---|
| Today and next-workout card | Existing | The "Today" card with "Open today's workout", "Log a run" and "Open your plan". |
| Week progress ring | Existing | The ring is clamped at 100% (`Home.tsx:251`), and the copy explains overrun ("8 km past the plan"). |
| Race countdown | Existing | The "Your finish line" card shows the race bib chips and days to go. |
| Recent run and Strava sync state on Home | **Missing** | Runs and sync sit behind "Your running → View all runs" and the collapsed insights. |
| Runner illustration | Partial | It appears only on Strava completion. |
| Layout weight | Partial | Below the fold are six stacked accordion rows: coaching review, feeling, running, insights, tools and get set up. The primary action is above the fold. |
| No-plan state | Existing | `S02-home-noplan-*`. |

## C. Race catalogue and builder (P0)

| Item | Status | Evidence |
|---|---|---|
| Goal-first custom race, race bibs, retry | Existing | #201 and `BuilderForm.tsx`. The e2e test `refinements.spec.ts` covers it. |
| Continue reachable on a phone | Existing | #196 and `cc48ee2`. The e2e tests cover it. |
| Date sheet shows the whole month, legible blocked days, CTA hidden | Existing | #197 and `9a5a76c`, `1c37c62`. `PlanCalendar` and `DatePicker` tests pass. |
| 9 November start honoured, foundation weeks | Existing | #195 and `52d5c8c`, `a0cf093`, with backend tests. |
| Strength days on the chosen days | Existing | `6ff353d` and `6659660`. |
| One question per step, review and edit | Partial | The builder is a long single form with steps. Review exists. A step-by-step layout on phones needs a visual check (Phase 1). |
| **Plan-building film** | **Partial (regressed)** | See below. |

The plan-building film has regressed from production to staging:

- **On `main` (production):** `PlanTheatre` plays five staged scenes, each with its own set pieces:
  - a sleeping runner with "zzz";
  - a start line;
  - kilometre markers (5, 10 and 21.1 km);
  - finish tapes;
  - the CSS classes `wait-film wait-scene-*`.
- **On `staging`:** commit `a65ed5b` replaced it with one track, a runner and a "FINISH" label. It keeps the five captions and poses but loses the set pieces.
- **Proposal:** restore the original scenes, still without tips or pause, as the user asked in #196.

## D. Plan overview and calendar (P0)

| Item | Status | Evidence |
|---|---|---|
| This week, Calendar and Progress tabs | Existing | `PlanView.tsx:86`. |
| Week strip, previous and next, back to this week | Existing (cluttered) | "Week 4 of 9" appears twice. On a 390 phone the previous and next pills wrap to two lines. |
| Seven-day list with status | Existing | The day rows and the `WeekGlance` strip. |
| Dedicated day detail | Existing | `DaySummary dedicated` (`PlanView.tsx:381`). The inline `DayPreview` then needs "Open day details". |
| Desktop split view (week and detail) | Partial | On wide screens the detail panel is a short card next to the list, which leaves a large empty area below it (PR #201 artefact). |
| Strength access | Existing | It's in the "Strength workouts" disclosure on Plan. |
| Below-the-fold tools | Partial | Six accordions: review and adjust, race-day checklist, life happens, workout export, plan options and strength. |

## E. Workout completion (P0)

| Item | Status | Evidence |
|---|---|---|
| Tick, check-in, short or long supportive copy | Existing | `CheckInCard` and `workout-distance-feedback.ts`. |
| Strava auto-tick, cached runs, no double count | Existing | `strava-completion.ts`, #198 and `run-arrival.ts`. The tests pass. |
| "Run received from Strava" notice | Existing | `4350f61` and `344dff2`. |
| Completion moment with the runner animation | Partial | `c51377f` added the runner icon. There's no celebratory state change on the day detail itself. |

## F. Runs and run detail (P1)

| Item | Status | Evidence |
|---|---|---|
| Journal with filters (All, This week, Last 30 days) | Existing | `MyRuns.tsx` and `S08-runs-*`. |
| Source label on each row | Existing | For example "Uploaded recording" and Strava. |
| Matching plan session per row | Partial | It's in the detail view, not in the list. |
| Run detail tabs | Partial | Overview, Pacing, Coach and Splits always all render. When there are no splits, the Splits panel says data is unavailable; the handover asks to hide tabs that have no data. |
| Desktop list and detail side by side | **Missing** | The detail replaces the list. |

## G. Progress (P1)

| Item | Status | Evidence |
|---|---|---|
| Progress tab in Plan | Existing | `PlanProgress`, `ProgressInsights` and `ProgressStory`, with the volume chart. |
| A dedicated top-level Progress screen | **Missing** | It exists only inside Plan, and Home links to it. |
| Single metrics source | Existing | Server `progress` and `insights` endpoints. Keep it. |

## H. Account (P1)

| Item | Status | Evidence |
|---|---|---|
| Profile, run connections (Strava), shoes, app and calendars, offline, notifications, data and privacy, sign out | Existing | `AccountPage.tsx`. |
| Duplicated navigation | Partial | The shortcut pills ("My profile", "Connected apps" and others) repeat the accordion rows directly below them (`S11-account-*`). On a phone the pills wrap to two lines. |

## I. Cross-cutting

| Item | Status | Evidence |
|---|---|---|
| Light and dark themes | Existing | Frame tokens with dark values. |
| Reduced motion | Existing | Film bypass, tab-bar transitions turned off. |
| Purposeful desktop or wide layout | **Partial** | The content column is bounded, with no second column on Plan, Runs or Progress. |
| 320 px overflow | Unverified | Phase 1 Playwright pass. |
| iOS Safari, PWA safe areas | Unverified | This needs a manual check by the user on staging. |

## Known problem areas (from the request)

| Area | Status |
|---|---|
| Training start date (9 November) | Fixed in #195. Backend and builder tests are present, and the targeted tests pass. |
| Calendar visibility (month end) | Fixed in #197. The tests pass. |
| Strength-day scheduling | Fixed in #196 (foundation weeks). The tests pass. |
| Race catalogue | Loads, with retry (#201). The e2e test covers it. |
| Strava auto-completion | Existing, and the tests pass. Live behaviour needs the user's Strava on staging. |
| Mobile Continue | Fixed in #196 (`cc48ee2`). The e2e test covers it. |
