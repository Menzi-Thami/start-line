# Taperday cross-screen UX audit and responsive redesign backlog
Date: 2026-11-04
Scope: source-code inspection of `main` (React/TypeScript, style sheets, existing E2E tests), and owner-provided screenshots/design discussion. Live https://taperday.run was **not accessible** from the available web fetch; no current cross-browser visual screenshots or runtime measurements have been completed. Distinguish **Verified in source** from **Design proposal / browser validation required**. This is a design handoff, not an implemented refactor.

## Approved product-wide principles
- Maintain Night Run design identity; refine rather than rebrand. Strong typography, near-black and sage/lime accents, consistent surfaces, restrained animation and thoughtful empty/loading/error states.
- Answer one question per screen: Home = what matters today; This week = when/how do I train; Calendar = on what date; Day detail = exactly what do I do; Runs = what happened; Run analysis = how did execution compare; Progress = am I improving; Account = my preferences/sources.
- One canonical workout-day detail accessible from week, calendar, Home, and running history; no separate conflicting presentation; preserve return location (week/month, scroll, focus).
- **Activity recorded != session done != prescribed workout executed correctly.** Day and aggregate statuses must use same semantics, with text + icon + visual accent, not color alone.
- Progressive disclosure: hero fact, next action and useful insight visible first; advanced detail below. Avoid nested accordion-in-accordion and duplicative summaries.
- Responsive *composition*, not merely wrapping. Mobile stacked and concise; tablet split where space permits; desktop takes advantage of width and comfortable line lengths. Account for 320px devices, 200% zoom, notches/home indicator, large text, landscape, keyboard and touch.
- Preserve current backend architecture / provenance and Strava constraints documented in `docs/strava-sync.md` (not a UI limitation; do not ignore compliance during implementation).

## Newly approved: calendar completion semantics / visual statuses
Use a canonical status-mapping helper and shared badge/token across WeekGlance, PlanCalendar, Day detail, Home Today, Runs and Progress. Display **green/sage filled check** for a runner-affirmed completed training session; **amber partial/minus** for an explicitly cut-short session or verified incomplete execution (never falsely imply no exercise); **neutral/sage hollow dot** scheduled; **distinct ring** today/selected; **muted rest icon** rest; **recorded-activity icon/label** when a run exists but the session isn't confirmed. A Strava-derived provisional completion must be marked **Recorded via Strava / provisional** under existing rules, not permanently stored. When completed attendance and execution diverge, show two axes: e.g. "Run recorded · Workout partially followed"; avoid exclusive mutually incompatible labels and colors. Missed/Skipped get separate, respectfully neutral treatment; don't mark historical days missed only because no synced data. Multiple workouts in a day display mixed status and explain it in preview. Every state conveys accessible descriptive label.

Calendar month grid: one compact indicator/date, color + icon; selected-date preview under month; tap preview to full Day detail. Match mobile week-strip visual semantics. Preserve keyboard date movement and existing history/outside-plan functionality. Test color contrast, colors under grayscale, screen readers and color-blind simulations.

## Newly approved: Progress visual grammar
- **Weekly running distance**: interactive bars; support planned-vs-recorded differentiation, clear unit and meaningful zero/missing states.
- **Pace over time**: line or dot chart for comparable pace measures (same distance/effort/route or normalized workload; do NOT imply that all-run average pace improvement always indicates fitness improvement). Make lower-is-faster axis clear; avoid reversed axes hiding data.
- **Workout execution**: pace-over-distance/time trace against target band for individual structured runs when detailed streams permit; fallback to split table/limited inference.
- **Consistency**: heatmap/calendar with meaningful statuses and explicit legend, if historical data quality allows; otherwise weekly completed/recorded chart.
- **Plan adherence**: goal-versus-actual indicators with reasonable tolerance, distinguish effort attendance from following prescribed structure.
- Charts need time-range controls (4/8/12 weeks appropriate), point-by-point tap/keyboard tooltips and an accessible underlying table/summary. Never fabricate data, PBs or trends; never present illustration numbers as real.
- Don't make everything a bar chart; fewer relevant charts outperform many decorative ones.

## Code-based screen audit (prioritized)

### P0 — Plan week, month and detail navigation
**Verified source**:
- `client/src/features/plan/WeekGlance.tsx` renders seven-day `ol.week-strip.week-agenda` with full session titles and +/- toggles; `PlanView.tsx` `selectedDay` and `daySummary('week')` render expanded content. `PlanCalendar.tsx` selects date with `aria-expanded`; `DaySummary.tsx` includes nested `session-more` details.
- `client/src/styles/polish.css` defines `.day-summary` max-width 34rem and max-height min(24rem,60dvh) with overflow auto — real constraint on long details.
**Design**: mobile 7-date selector + selected-day preview + 2–3 upcoming rows; desktop seven-day master list + selected-day details. Actual day detail route replaces in-schedule expanded panel; calendar month opens same route. Preserve logging, additional runs, strength, rest, coaching and conflicts; remove false plus/minus affordance. See `docs/workout-intelligence-ui-handoff.md`.
**Acceptance**: 320/375/390/430/768/1024/1280/1440px; week changes; month navigation; no clipped controls or deep scroll traps; back/focus/deep link restored; no check-in loss.

### P0 — Runs list and Activity detail
**Verified source**:
- `client/src/features/activities/MyRuns.tsx` combines file upload, RunDataPanel, filters, and a run feed. A run row currently displays title, source and metadata with a chevron.
- `ActivityPage.tsx` has a verdict panel, primary stats, a secondary stats `details`, separate `details` for Splits & pacing and Heart rate & effort, best efforts, plus removal.
- `client/src/styles/ux-run-journal-refresh.css` has responsive grids already.
**Design**: recent-run compact card hierarchy (distance, date, type, meaningful status), simplified source indication, grouped filters, action to view review; Activity detail 4 accessible tabs Overview/Pacing/Coach/Splits or equivalent sections with strong progressive hierarchy. Do not bury all insights behind multiple nested accordions; keep delete/import/help secondary but discoverable. Preserve existing deletion semantics, source attribution, consent, no-data fallbacks.
**Acceptance**: real split data/consent, run-without-plan, run-without-stream, user-provided screenshots against genuine app screenshots; no invented 5:49 pace or HR.

### P0 — Status system consistency
**Verified source**: `WeekGlance.tsx` uses `is-done`, `is-missed`, `has-activity`; `PlanCalendar.tsx` currently uses ring and underline and explicitly says so in legend; `Home.tsx` uses `chip-good` for Done and synced-run handling; `ActivityPage.tsx` separate verdict.
**Design**: one canonical semantic status model and reusable indicator, same text/icon/colors across all surfaces. Resolve conflicts without changing runner-entered answers; distinguish completed presence from target adherence.
**Acceptance**: missed/partial/provisional/complete/rest/multiple sessions all receive correct text+icon+color, with consistent screen-reader behavior.

### P1 — Home: action-oriented dashboard
**Verified source**: `client/src/features/runner-home/Home.tsx` implements Today, This week, race countdown, weekly review, recent activity, Running insights, trends, progress, weekly history, PBs and tools, several as `details`; `client/src/styles/skin.css` and `polish.css` both include home layout sizing overrides across breakpoints.
**Design**: first viewport one personalized hero with Today's next action, companion concise week metrics and race countdown. Relegate trends/PBs to deeper Progress, preserve shortcuts. Recent synced run gets discreet pending action if logging needs attention. Avoid same running metrics repeated in Home, Plan and Progress with different interpretation. Desktop hero + contextual side summary, not a long single column; do not add a second conflicting day detail.
**Acceptance**: no plan / first week / race week / returning runner / cache expired / backend error / narrow phone / 1440+ desktop.

### P1 — Progress and training insight hierarchy
**Verified source**: `PlanView.tsx` contains `PlanProgress`, Running insights, Training paces, Weekly distance (`VolumeChart.tsx`), What you ran (`WeekTotals.tsx`); `VolumeChart.tsx` already supports select/week detail, planned and ran overlays and accessible hidden table.
**Design**: at-a-glance three meaningful KPIs, one prominent chart with segmented metric selector (weekly km vs comparable pace trend), consistency history and milestone cards. Reuse existing VolumeChart behaviors instead of replacing accessible chart with static SVG. Explain recorded vs estimated vs missing historical values. Use date filter and drill into week/day/run.
**Acceptance**: no history, short history, long history, mixed source and late imports; keyboard chart navigation; no fake stats.

### P1 — Plan builder onboarding and review
**Verified source**: `client/src/features/builder/BuilderForm.tsx` has multiple wizard steps, progress bar, choice/race rack, inline validation, strength options and review; `PlanTheatre.tsx` exists.
**Design**: strengthen hierarchy around one question/step; clear labels and current selected state; persistent Back/Continue position on mobile (safe area), contextual hint collapsed if verbose; preview built outcome before final action; allow edits with minimal scroll. Keep clear visible validation and reduced-motion transitions.
**Acceptance**: first-time/no race, novice couch-to-5K, advanced ultra, weak/no network, return to previous step, text scale 200%, rotation and keyboard.

### P1 — Strength and session tracking
**Verified source**: `client/src/features/strength/StrengthTab.tsx` uses disclosure per strength session and `ExerciseList`; `DaySummary.tsx` also exposes strength-specific details.
**Design**: dedicated day details with workout type header, exercise cards, sets/reps, progress count and next set control; compact weekly preview rather than opening nested strength disclosure from inside day disclosure. Distinguish strength completed from run recorded. Preserve tracking and editing.
**Acceptance**: 0, 1 and several exercises, long exercise names, mid-session interruption, recovery day and simultaneous run + strength day.

### P2 — Account, connections and settings
**Verified source**: `AccountPage.tsx` uses `details.settings-group` for Profile & picture, Connections & run sources, Shoes, App & calendars, Notifications and Data & privacy, plus explicit deletion confirmation.
**Design**: top-level profile and connected-source summary, grouped tappable settings sections and clear connection state/actions; maintain non-destructive ordering, deletion confirmation and accessible privacy disclosures. Desktop two-column profile/settings area only if it helps readability; avoid many huge open accordions.
**Acceptance**: connected/disconnected/pending-reconnect provider, disabled push, long account address, avatar failure and delete flow.

### P2 — Global navigation, CSS and motion
**Verified source**:
- `App.tsx` manages view/openRun state and renders a conditional phone `TabBar`, plus desktop masthead navigation.
- `PlanView.tsx` implements tab scroll/edge fade and keyboard, while `App.tsx` applies view transition.
- `client/src/styles/app.css` is ~5,850 lines, with additional `skin.css`, `polish.css`, `training-clarity.css`, `ux-run-journal-refresh.css` and other layers; `skin.css` and `polish.css` both define desktop/mobile Home selectors at distinct breakpoint ranges. Not proof of bugs, but CSS cascade/regression risk.
**Design**: consolidate component-level tokens and remove conflicting/obsolete overrides only after CSS regression verification; define content-width/container/grid templates for compact/tablet/desktop; consistent card density, action positioning, badges, focus rings, min touch size, motion duration (180–250ms), scroll restore and tab behavior. Defer heavy splash effects; honor reduced-motion and PWA safe areas. Use existing design docs rather than a wholesale rebuild.
**Acceptance**: 320/375/390/430/768/1024/1280/1440/1920 and 200% zoom; iOS Safari/PWA, Android Chrome, desktop Chrome/Firefox/Safari if available; screenshot diffs + Playwright tab, routing, focus tests; note unsupported browsers explicitly.

## UI delivery sequencing
**Wave 1:** shared status tokens, plan week hybrid, calendar selection + day route, accessibility/keyboard; capture screenshots.
**Wave 2:** Runs list + run detail tabs, structured workout feedback with evidence; preserve existing import and check-ins.
**Wave 3:** Progress dashboard chart grammar, drilldowns and meaningful comparison; Home simplification and cross-linking.
**Wave 4:** Builder, Strength, Account, global CSS cleanup and cross-screen polish.
Each wave can be separate draft PR if it reduces conflicts and review cost. Keep `#179` untouched until separately ready. Rebase/recheck off current main, run CI per wave. Do not auto-merge/deploy.

## Validation and audit limits
- This review is source-grounded but **not a validated browser screenshot audit**. The live domain was inaccessible to available web fetch, so runtime clipping/contrast/pixel accuracy are unverified.
- Codex/developer MUST run actual app with representative sample states, collect before/after 320/375/768/1440 and 1920 snapshots, test hover/focus/scroll/interactions; compare against approved conversational mockups / wireframes and supply real images.
- Make no unsupported claim that a change is visually verified, that a feature is absent, or that metrics are available from Strava when source/permission does not supply them.
- Existing Strava policy may constrain storage and comparison; it is acknowledged without treating policy as the primary product design discussion.
