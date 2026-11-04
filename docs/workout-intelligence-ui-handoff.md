# Taperday — Plan Day Navigation + Workout Intelligence UI (Codex implementation handoff)

Status: DESIGN/IMPLEMENTATION SPEC ONLY. This draft PR changes documentation, not production behavior. Preserve Night Run look and existing capabilities. Do not merge automatically.

## Product decision (approved 4 Nov 2026)
Keep Plan > This week / Calendar / Progress as a highly scannable weekly schedule. **Tap anywhere on any day row to open a dedicated day detail view, not an accordion/inline expansion.** Mobile navigates to its own page with obvious Back; tablet/desktop can use master-detail two-column layout with schedule left and selected day right. Maintain deep links and browser/PWA back/forward. Long pages scroll independently without being obscured by bottom nav or floating up-arrow.

User scenario: Tue 3 Nov 2026 Goal pace run: 10 km planned, 5.05 km recorded from Strava, activity recorded but workout only partially done. Show both planned instructions and observed performance without conflating “showed up” with “followed prescription.”

## Approved adaptive weekly schedule layout (supersedes vertical-only direction)

**Mobile: HYBRID — seven-day horizontal date strip + selected-day preview.** This is the default on narrow viewports, replacing the earlier seven-full-rows layout as the primary mobile presentation. The strip shows all seven dates of the current week together at common phone widths: weekday initials, date number, subtle dot/indicator for scheduled or completed activity, selected-day state and today state (these must remain distinguishable). Each date is a large enough accessible touch target; no compulsory sideways swipe to discover hidden dates. At very narrow widths (e.g. 320px), intelligently adjust padding/font sizing while preserving readable touch targets and no overflow; if physical constraints make seven 44px targets impossible, provide an accessible alternative without truncating/overlapping dates. Include clear previous/next week navigation and planned km / session count summary.

Beneath the date strip, show a **focused preview of the selected day**: title, activity kind, planned distance, recorded/completion status, 1-line purpose or instruction teaser, and one prominent action/tap target to open full day details. Beneath preview optionally show a **short upcoming sessions list** (typically next 2–3 relevant workouts; no duplication of every full week's card and no confusing second day selector). Day strip selection changes preview in place, with keyboard focus/announcement; tapping the preview opens a new dedicated day detail route. This intentionally differentiates **select date** from **open full detail**.

**Tablet/desktop: master-detail.** Use a vertical list of all seven dated workout rows at left and a selected-day preview/detail panel at right. Use available width meaningfully. Selecting a day updates the right panel; provide an explicit accessible “Open full details” navigation. On mobile, open a full-screen dedicated day view (not an accordion). The This week / Calendar / Progress modes remain and calendar dates lead to same day-detail route. Desktop breakpoints should be determined by actual content fit, not an arbitrary device name.

**Status presentation:** no misleading checkmark for activity recorded when prescribed stages are unverified; distinguish recorded/partial/prescribed completion. Preserve pending/strength/rest/multiple-activities days and existing interactions. Night Run tokens, sage selected states, refined consistent typography and restrained motion. Respect screen reader, reduced-motion and long translated labels.

**Layout acceptance:** mobile 320/375/390/430 px date selection and preview, tablet 768/1024 px and desktop 1280/1440 px master-detail. Seven dates visible at standard smartphone widths, no horizontal body overflow; sufficient touch target sizes; focus and back behavior; no clipped calendar selector/nav. Take actual before/after screenshots on all form factors.

Mobile wireframe:
```
TAPERDAY / PLAN                         26 km planned · 5 runs
           [‹]  2–8 November  [›]
      M     T     W     T     F     S     S
      2     3    [4]    5     6     7     8
      •     •           •           •     •

      WEDNESDAY'S TRAINING
      [ Mobility + light strength                  ]
      [ Recovery day · quality movement            ]
      [                              Open day ›     ]

      COMING UP
      Thu 5   Easy run + strides          3 km   ›
      Sat 7   Easy run                    3 km   ›
      Sun 8   Long run                    7 km   ›
```
Desktop wireframe:
```
[Week nav + weekly metrics]
[Mon 2 Recovery           ] | [Selected day preview / details]
[Tue 3 Goal pace run      ] | [Planned stages and recorded summary]
[Wed 4 Mobility  selected ] | [Open full day details]
[Thu 5 Easy + strides     ] |
[Fri 6 Mobility           ] |
[Sat 7 Easy               ] |
[Sun 8 Long               ] |
```

## Approved UI flow and visual guidance
1. **Weekly plan (adaptive hybrid)** — mobile uses a full seven-date horizontal selector plus a selected-day workout preview and short coming-up list; selecting a date switches preview, tapping preview opens full day detail. Tablet/desktop shows a vertical seven-day list with a selected-day preview/detail panel. Statuses stay concise and factual (e.g. “5.05 / 10 km recorded”). Today highlight is subtle sage. No inline giant accordion. Preserve This week / Calendar / Progress and current progress functionality.
2. **Day detail** — contextual back to week/calendar, date and workout title, goal/type and distance, compact status/progress indicator, structured numbered workout steps (warm-up, repeats/work, recovery, cool-down), “Why this matters,” planned activities including multiple sessions, strength, rest, race, additional runs. Show actual matched activity summary when present, then a clear **View run analysis** action. All existing log/edit/skip/Keep this tick/conﬂict actions remain accessible.
3. **Run detail (Runs area and linked from day)** — first screen shows clean title/date and distance, pace, recording source/availability. Use sections/tabs **Overview / Pacing / Coach / Splits** (or adaptive accessible equivalent). Overview = progress and stage summary; Pacing = chart or bars with planned vs actual where data exists; Coach = evidence-bound, encouraging deterministic feedback; Splits = complete accessible table with HR when consented. Advanced details (heart rate, best efforts, removal rules) live in secondary collapsibles rather than giant uninterrupted scroll. Preserve “View on Strava” and official unmodified branding, Garmin credit where relevant.
4. On desktop show usefully wider, balanced grid, not a stretched phone view. Tablet support and full responsive PWA, iOS safe areas. Use existing Night Run near-black/sage/electric-lime tokens, consistent type and card spacing, purposeful 180–250 ms transitions with prefers-reduced-motion support; no hard-coded screenshot pixel dimensions.

Text wireframes (prior assistant UI concepts are design references, not assets):
```
DESKTOP WEEK LIST                      DAY / TUE 3 NOV
Mon 2  Recovery run          >          ← This week
Tue 3  Goal pace run         >          Goal pace run — 10 km planned
       5.05 of 10 km recorded           [Activity recorded] 5.05 / 10km
Wed 4  Mobility              >          01 Warm-up — 2km easy
Thu 5  Easy run + strides    >          02 Work — 2 x 3km @ 4:59/km
Fri 6  Mobility              >          03 Recovery — 3min jog between
Sat 7  Easy run              >          04 Cool-down — 1.5km easy
Sun 8  Long run              >          Why: rehearse controlled goal pace
                                       [View run analysis]
RUN DETAIL
← Runs | Goal pace run | Tue 3 Nov
5.05km recorded | 10km planned | Partial workout
[Overview] [Pacing] [Coach] [Splits]
50.5% distance | stage-by-stage progress (only if data justifies)
Coach: “Good speed; shorter than prescribed. Protect warm-up.”
```

## Existing code and documents — read before editing
- `client/src/features/plan/WeekList.tsx`, `client/src/features/plan/DaySummary.tsx`, Plan views and routing/navigation.
- `client/src/features/activities/ActivityPage.tsx` and Runs listing, chart/splits components.
- `src/StartLine.Domain/Activities/RunReview.cs`; existing activity stream/review pipeline. **Reuse/extend rather than duplicate.**
- `client/src/features/coaching/StravaCompletion.tsx`, `client/src/lib/strava-auto-completion.ts`, `src/StartLine.Domain/Coaching/SyncedCompletions.cs`.
- `docs/calendar-day-summary.md`, `docs/flexible-training-week.md`, `docs/run-logging.md`, `docs/strava-sync.md`, `CLAUDE.md`.
- `client/e2e/strava-completion.spec.ts` and other Playwright suites.
Do not assume screenshots are committed. The conversation UI mocks are illustrative: implement the behavior and hierarchy above, with app's real design tokens.

## Structured workout + evidence rules
- Inspect current plan prescription model and run-review implementation first. Support immutable/readable stage prescription: stage kind (warmup/work/recovery/cooldown), distance-or-time duration, target pace *range* or specified value, repetitions and recovery placement. Preserve existing plan-generator versions, legacy schedule and Couch-to-5K time-based run/walk prescriptions.
- For the example, **2km + 2x3km + 1.5km = 9.5km, plus 3 minutes recovery jogging**. Do not display it as exactly 10km without explaining rounding/time-derived distance.
- Compare with available detailed time/distance/HR streams using sensible smoothing; never infer precise interval completion from 1km splits alone. Respect missing data and paused periods. When only splits are available label outcome approximate; when stream missing say cannot assess.
- Show at least: recorded vs planned distance/time, stage match confidence, pace adherence with tolerance, recoveries and cooldown completion where observable, and supportive evidence-bound observations. Use personalized HR context if available; never label a HR as dangerous solely from a single absolute number.
- Distinguish `Activity recorded`, `Partial workout`, `Completed as prescribed` and `Unable to assess structure`. Do not change check-in answers to imply quality. Runner-entered Done/Skipped/Cut short wins; ambiguous runs do not auto-match; no double-counting.
- If relevant, ask runner “Why did you stop/change this workout?” optional fatigue / pain / time / intentional adjustment; this is voluntary *runner input*, not machine inference. Never require it to view analysis.

## NON-NEGOTIABLE Strava policy and privacy
`docs/strava-sync.md` explains existing 7-day retention/cache, limited derived data retention, deletion/revocation, no latlng streams, opt-in HR, no Strava data to AI and non-persistent automatic completion. **Keep these rules intact** unless separately and explicitly reviewed against current Strava terms. Make feedback deterministic/local-to-app, not generative AI fed Strava data. Do not permanently store Strava streams, derived metrics or coaching assessments. Do not send any athlete's private Strava data to external AI or third-party service. Preserve no-store/cachedUntil logic; deletion/disconnect/expiry invalidates analysis. Preserve sources and owned uploads as existing architecture permits. Rate limit calls and reuse existing stream acquisition.
- Authenticate and authorize all activity endpoints. Return missing/expired states with helpful fallbacks and never leak other athletes' data.

## Implementation slices (small independently reviewable commits, same feature branch if sensible)
A. Audit and plan existing code, save notes in this doc. Confirm overlap with draft PR #179 (Couch to 5K): do not merge/rebase onto it or modify its unfinished contracts.
B. Responsive hybrid schedule: seven-date mobile strip with selected-day preview + concise coming-up list, desktop vertical master-detail; date selection, preview-to-detail navigation, routes, history/back and keyboard focus; preserve calendar and other day actions.
C. Day detail structured prescription, log/status, Strava match presentation, link to run review.
D. Runs listing + detail UI cleanup, tabs, responsive layout and chart/splits accordions; all actions preserved.
E. Reuse/extend deterministic review and provenance-safe stage comparison on currently available data. Confidence/missing-data states, accessibility and explanatory text. Do not fake metrics.
F. Tests, docs, screenshots in actual browsers, final review.

## Acceptance tests
- Mobile 320px up through common iPhones, tablet and 1440px desktop: no horizontal overflow, clipping, bottom navigation overlap or giant whitespace; safe area respected.
- On mobile click/tap/keyboard selection of any date updates the preview without automatically opening detail; clicking/tapping/keyboard activating the selected-day preview opens full day detail. On desktop selecting a row updates the detail panel; explicit Open full details action navigates. Back works to same week/month and focus restores; deep linking/back/refresh behave.
- Rest/strength/multiple-session/Couch-to-5K days render correctly; planned 10km vs actual 5.05km is clearly partial and recorded, not claimed completed-as-prescribed.
- Loading, missing, expired, deleted, revoked, unauthorized Strava data, no connection, no HR consent, FIT/TCX/GPX/manual and ambiguous matched runs present honest fallbacks.
- Accurate stage comparisons with synthetic streams across pace changes, GPS noise/pauses, missing/recovery stages, time-only stages and partial runs; no fabricated stage scores from splits.
- No duplicate ticks, lost check-ins, regression to calendar/weekly recaps or PR #179 behavior.
- Color contrast, screen reader labels/statuses, reduced motion and keyboard access.
- Run client lint, typecheck, unit/integration tests, Playwright visual/E2E tests at 375/768/1440 and backend test suite; attach **actual test logs and before/after screenshots** to implementation PR. Do not claim visual tests passed without browser execution.
- Respect current CI and deployment: **DO NOT MERGE** implementation automatically; submit for review with unresolved blockers.

## Codex execution instructions
Read this spec and repository guidance first. Work on a fresh implementation branch based on updated `main`, not this docs-only branch unless the spec is merged. Reference this PR/spec in your implementation PR. Check current open PRs for conflicts. Implement slices A–F, commit changes, run relevant checks, fix failures, document limitations, and open a separate **draft implementation PR** for manual review. Preserve approved UI direction without asking for another design decision. Do not merge or deploy. If blocked by permissions, tools, rate limits or missing screenshot assets, record the blocker accurately in the PR instead of claiming completion.
