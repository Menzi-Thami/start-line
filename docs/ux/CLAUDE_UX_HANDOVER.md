# Taperday — Claude Code UX handover and visual acceptance contract

> **Status:** Design/implementation brief, NOT an implemented redesign. **Base:** `staging`. **Audience:** Claude Code. **No production changes.** User explicitly wants original Taperday look, colours, typography, running-cartoon illustrations, transitions and animation film preserved. **Restore/retain the familiar bottom navigation.** Do not merge this documentation PR as if it were the feature.

## 0. Why this exists / user's feedback
The user liked the **bottom buttons** used to move between sections. PR #201 preserved the brand but delivered modest refinements rather than the full screen-by-screen UX critique. The requested missing experience includes dedicated Home, Plan, Runs, Progress and Account journeys; meaningful workout detail and completion; legible, spacious desktop layouts; responsive phone/tablet support. Do not interpret “refine UX” as permission to rebrand, replace animations, or remove working functionality.

**Source of truth:** actual existing components and user-approved Taperday brand in repository, not generic fitness-app screenshots. Preserve prior bug fixes in PRs #195 (selected training start), #196 (strength days, fixed Continue, Comrades legibility, full builder movie), #197 (mobile calendar), #198 (Strava notification), #201 (goal-first selection and account shortcuts). Audit current staging implementation before coding; several components already exist.

## 1. Visual evidence / screenshots
These are **real Playwright screenshot artifact archives from PR #201**, not mockups. Download, extract, inspect and include selected annotated before/after PNGs in the eventual implementation PR. They are artifacts from workflow [CI run 42113416401](https://github.com/Menzi-Thami/start-line/actions/runs/42113416401), head `e823bc1113ca8639f360efd113152d0cf1bb02b7`, and may expire.

| Actual screenshot archive | Evidence | Link |
| --- | --- | --- |
| Responsive plan/progress | Playwright screenshots across dark/light, 320, 390, 768, 1440, 2560 px | [run-responsive-visual-qa (artifact 13455880809)](https://github.com/Menzi-Thami/start-line/actions/runs/42113416401/artifacts/13455880809) |
| Race-week | Race-week screenshots | [race-week-visual-qa (artifact 13455800906)](https://github.com/Menzi-Thami/start-line/actions/runs/42113416401/artifacts/13455800906) |
| Account responsive | Account screenshots | [account-responsive-visual-qa (artifact 13454134669)](https://github.com/Menzi-Thami/start-line/actions/runs/42113416401/artifacts/13454134669) |

**Screenshot gap:** These are CI artifacts linked here, **not inline image files committed in this docs PR**. They do not prove the live deployed staging site visually matches or that every screen was captured. Claude must capture actual baseline and after screenshots for Home, Race chooser, Builder, Plan, Day detail, Runs, Run detail, Progress, Account, notifications, empty/error/loading states in BOTH themes and across viewports; place optimized PNGs in implementation PR description or repo `docs/ux/screenshots/` with descriptive filenames. Never label concept inspiration as an actual screenshot.

Staging URL (previous deployment): https://icy-grass-0c32e680f-staging.eastus2.1.azurestaticapps.net
Staging deploy + smoke evidence: https://github.com/Menzi-Thami/start-line/actions/runs/42124841099
These prove deploy smoke success, **not full UX acceptance**. User subsequently confirmed races load, after briefly reporting otherwise; include regression coverage.

## 2. Non-negotiable design rules
1. **No rebrand.** Use existing design tokens, lime accent, dark/light theme semantics, original typography, bib/race visual treatment, existing iconography, animated running cartoon, full plan-building running movie, reduced-motion support. Do not swap to white generic dashboards, change colour system, replace runner with stock imagery, or remove animations.
2. **Navigation:** restore/retain the user's familiar persistent bottom buttons on mobile, safe-area aware, thumb-friendly 44px+ targets, selected state, labels, keyboard focus, no obstruction of date sheets or fixed Continue. Preserve fast access to **Home, Plan, Runs, Account** and a discoverable **Progress** destination (inside Plan and/or explicit nav only if justified after auditing the old bar). **Do not blindly replace the existing navigation model**: inspect git history/current source and show before/after to user. On desktop, provide an equally accessible consistent navigation shell rather than a stretched phone UI. Preserve back/deep-link behavior and current view on refresh where appropriate.
3. **Animations are brand assets:** preserve runner cartoons, existing motion tokens and original five-scene ~6s plan-generation film, only on new plan creation; no pause/next-tip controls; reduced-motion users skip waits. Motion must explain transitions, loading, completion, progress; avoid gratuitous delays.
4. All layouts responsive 320, 390, 768, 1024, 1440, 2560px; test portrait and wide, light/dark, keyboard and screen readers, iOS Safari and desktop Chromium. No horizontal overflow or sticky controls covering content.
5. Existing behaviour/data preserved: Strava OAuth/webhooks/cached runs, run auto-tick even when shorter/longer with supportive language, weekly recap, plan check-ins, calendars, strength, races, PWA and notifications. Do not weaken security or erase data.

## 3. Screen-by-screen acceptance specification
### A. App shell and bottom navigation — P0
- Stable app-level bottom navigation on phone with original style; labels/icons, selected state, accessible semantics, persistent across Home/Plan/Runs/Account and direct entry to Progress.
- No hidden destinations, dead-end flows, forced excessive scrolling, overlay collisions, or reset to onboarding for an existing signed-in runner.
- Desktop: constrained readable content width, intentional multi-column grids/sidebar as appropriate; no large dead zones, maintain navigation visibility and brand motion.
- Verify route transitions, swipe/tab interactions, deep links, auth states, back navigation and PWA safe areas.

### B. Home dashboard — P0
- Clear “today / next workout” primary action; race countdown; current-week progress and distance; Strava sync state; meaningful recent run, completed/empty/rest day states; original animated runner used for completion or motivation.
- One tap to workout details, week plan, run history and progress. Loading skeletons, retry/error and offline messaging must not conceal actions.
- Signed-out visitor gets appropriate plan-builder path, not a broken signed-in dashboard.

### C. Race catalogue + goal-first builder — P0
- Races load reliably, error/retry/empty states visible, no indefinite spinner. Custom distance/another race visible before catalogue without losing animated race bibs. Preserve all major races, date constraints and race selection.
- Continue visible after choosing a major race, including small phones and when scrolling. Custom race date picker shows all days, disabled dates remain legible, sheet above fixed CTA.
- Step-by-step goal time, running days, long-run day, strength days, training start date, fitness baseline, review; accurate summaries and editable steps; validation tied to correct step.
- Selecting **9 Nov 2026** for a distant race starts sessions that date, not January. Foundation weeks run and strength on chosen days; correct rest days, no duplicate or missing calendar dates. Saved legacy plans not silently rewritten.
- Build plays the **entire original running movie** while API computes, then transitions; do not show pause/next tip. Handle API errors/retry without losing entered answers.

### D. Plan overview + calendar — P0
- Dedicated overview with goal, race date, training phase, week number, next session, weekly distance, completion. Tabs/sections for This week, Calendar, Progress; existing strength experience accessible.
- 7-day week layout, workout types, run/strength/rest status, current day, completed/partial/missed states, week jump and Back to this week, first/race week. Calendar must display ALL dates including month end.
- On desktop show useful split view (calendar/week + selected workout details) rather than blank width. On phone cards and navigation remain legible without horizontal overflow.
- Each day opens dedicated workout detail with warm-up, workout segments, pace/effort/distance, notes, completion action and edit/replan where available. Preserve workouts and race-week preparation.

### E. Workout completion — P0
- Clear completed state and animation, actual distance vs planned distance, supportive messages for too short/too long, effort/check-in, optional note and manual completion; no punishment for deviations.
- Strava-matched run auto-ticks corresponding planned run, including cached activities; avoid double counting, repeated toasts, wrong-day matches, or replacing a completed check-in.
- Surface in-app “Run received from Strava” with view-run link, dismissal, proper accessibility; distinguish live integration test from mocked Playwright.

### F. Runs + individual run analysis — P1
- Dedicated runs journal/list with dates, distances, paces, source (Strava/import/manual), filters/empty/loading states and clear route to run detail.
- Detail screen: Overview, Pacing, Splits and Coach insights **only where supported by real data**; no invented GPS, splits, HR or AI insights. Show graceful unavailable states.
- Navigation back to journal and relevant planned workout; mobile/desktop layouts; preserve existing data model and privacy controls.

### G. Progress — P1
- Dedicated meaningful progress view (not merely intro copy): weekly mileage, consistency, completion trend, progress toward race, recent milestones, charts and optional deeper insights. Provide date ranges and units.
- Data correctness across miles/km, no activities, partial plans, imported runs, overlapping plans. Accessible charts with textual summaries; animation respects reduced motion.

### H. Account — P1
- Profile, Strava connections, notifications/reminders, install/PWA/calendar subscriptions, shoes, privacy/data and sign-out. Keep existing shortcuts but avoid duplicate or confusing forms.
- Signed-in Continue to Taperday goes to current plan or home as appropriate; no unnecessary test button. Do not alter Entra sign-in/email template without separate authorization.
- Responsive settings with clear labels, state feedback, and safe destructive action confirmations.

### I. Motion, theme, accessibility and responsive — P0 cross-cutting
- Preserve brand animations and their purpose; use existing tokens for reveal, transitions and reduced motion.
- Contrast check on **both** themes (notably Comrades race bib), focus rings, text scaling, semantic controls, announcements, 44px touch targets, safe areas.
- Screenshots at 320/390/768/1024/1440/2560px; verify light/dark on Home, Builder, Plan, Calendar, Runs, Progress, Account. No empty desktop canvas, clipped nav or overlay.

## 4. Work order for Claude Code
**Phase 0 — Audit and evidence:** inspect staging source and git history for original bottom nav, screen map and components; extract screenshot artifacts above; run staging locally or browser; create route/component inventory and a gap matrix: Existing / Needs refinement / Missing / Broken. Compare to this brief; do not delete functional features. Screenshot baseline in light/dark/mobile/desktop.

**Phase 1 — Shell and journeys:** restore preferred bottom nav and responsive desktop shell; Home, Plan and day detail; race builder and completion flow. Fix any discovered regressions first.

**Phase 2 — Dedicated views:** Runs journal and supported run detail, Progress, Account refinements. Reuse current features and APIs, avoid unnecessary backend rewrites.

**Phase 3 — Polish:** transitions, runner animations, loading/empty/error states, contrast and a11y, iOS PWA, desktop density.

**Phase 4 — Proof:** unit + integration + Playwright + manual visual walkthrough, screenshot comparisons and user sign-off. Keep work in separate small staging-targeted PRs or a clearly staged feature branch; **no main/prod merges or deploys**. Don't auto-merge this handover PR.

## 5. Required test matrix and release gates
- User journeys: signed-out new runner -> choose major/custom race -> enter goals/dates/strength -> review -> build film -> plan -> week/calendar -> day detail -> complete -> Progress -> Runs -> Account; returning signed-in runner; offline/failed race API; race list retry.
- Regression: 9 Nov start / distant race, 14-day custom race rule, full calendar month including 30 Nov, fixed Continue, Comrades light mode, foundation strength days, Strava short/long/cached completion, in-app notification, no duplicate runs, PWA install, share links.
- CI: secret scan, frontend lint/typecheck/unit/build/audit, backend build/tests/migrations, Playwright desktop/mobile. Tests must run against **exact current SHA**.
- Browser acceptance: 320/390/768/1024/1440/2560, light/dark, reduced-motion, touch + keyboard, iOS Safari manual, desktop Chrome. Capture BEFORE and AFTER screenshots and attach to implementation PR; screenshots are evidence, not proof of backend correctness.
- Staging only: confirm base hasn't diverged, all checks green, deploy to staging, smoke test, then manual user review. Production untouched. Never claim acceptance merely because deploy smoke passed.

## 6. Definition of done
- User recognizes original Taperday brand and **the bottom navigation they liked**.
- Every promised dedicated screen and end-to-end journey is implemented or explicitly marked deferred with user agreement.
- All previous bug fixes and integrations preserved; no regressions in date, strength, race catalogue or Strava.
- Screenshots prove real mobile/tablet/desktop light/dark outcomes; no inaccessible controls or large wasted desktop space.
- Tests pass, staging deployment + smoke pass, and **user visually accepts** before considering production.

## 7. Claude Code starter instruction (copy verbatim)
> Read `docs/ux/CLAUDE_UX_HANDOVER.md` completely. Audit current staging code, git history and linked real Playwright screenshot artifacts first. Produce a screen-by-screen gap matrix, then implement the full Taperday UX acceptance contract in staged PRs targeting **staging only**. Restore/retain the familiar bottom navigation, original colours, typography, runner cartoons and full build-plan movie. Do not rebrand, do not delete existing functionality, do not touch main/production. Capture baseline and after screenshots for each screen across phone/tablet/desktop and both themes; run the full CI and end-to-end user journeys, and report what remains unverified. Seek user sign-off before any production action.
