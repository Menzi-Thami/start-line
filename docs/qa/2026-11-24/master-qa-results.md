# Taperday whole-app QA results — fill after actual execution

**Prepared:** 24 November 2026. **Source of truth:** [master QA contract](master-regression-acceptance.md). **All statuses start as NOT RUN; no test has been claimed passed by the creation of this file.**

**Tested code SHA:** `8918f89` (code and tests). Later commits on this branch add this ledger, the screen inventory and one unit test; the CI run for the final head is linked in the PR conversation.
**Base:** `staging` at `5d7a966` (PR #314 merged). Deployed staging was not exercised by this PR.
**Environment:** GitHub Actions (disposable SQL Server container, local API, production client build, Playwright Chromium + Firefox/WebKit/Android profiles). Locally: targeted unit tests only.
**Runner fixtures and device profiles (synthetic):** test-auth runners with random subjects; repository JSON fixtures; Playwright emulated devices. No real runner data.
**CI + secret scan for `8918f89`:** Checks https://github.com/Menzi-Thami/start-line/actions/runs/45342196328 · Copy check https://github.com/Menzi-Thami/start-line/actions/runs/45342196319 · Secret scan https://github.com/Menzi-Thami/start-line/actions/runs/45342196375
**Physical iPhone owner-assisted validation:** NOT RUN
**Live Entra validation (PR #315):** NOT RUN in this QA PR
**Loading/performance visual validation (PR #316):** NOT RUN in this QA PR

## Evidence taxonomy

- **Static:** source/copy audit; not a rendered UI pass.
- **Unit:** isolated unit/component fixtures; not actual provider/device.
- **API:** disposable SQL integration authorization/persistence test.
- **Browser:** Playwright simulated account/provider/API with actual browser engines.
- **Staging:** running deployed staging site and its configured staging services.
- **Provider:** real External ID/Strava/email/push using isolated opt-in test identities.
- **Physical:** actual iPhone installed PWA or other real device (not WebKit emulation).

## Scenario register

For each item, record actual status and evidence level plus a reproducible outcome. A green CI suite can support relevant Browser/API rows, but it cannot make the entire manual COPY/VIS/physical matrix PASS.

| ID | Scope shorthand | Status | Evidence level / fixture | Proof / tested SHA / notes |
|---|---|---|---|---|
| COPY-01 | Inventory **all rendered static strings** in React JSX, source constants, translated/templated text, ove | PASS | Static | 4,144 copy strings extracted from client/src and src (JSX text, copy attributes, sentences, C# strings incl. email HTML and push text) by tools/copy-check; every line proofread. `8918f89` |
| COPY-02 | Run a repository spellchecker (add a **pinned, reproducible CI job** if none exists) | PASS | Static + CI | Copy check workflow (cspell 10.4.0 en-GB + reviewed words.txt, house-style rules) runs on every PR and push; 9 self-tests prove it catches US spellings, doubled words, placeholders, "1 runs", straight apostrophes and a planted typo. Green in CI on `8918f89`. |
| COPY-03 | Manually review actual **rendered** copy at phone and desktop sizes, not only string literals | NOT RUN | — | Rendered copy at phone/desktop widths not inspected. Needs a browser pass on staging. |
| COPY-04 | Search for typos, inconsistent capitalization, weird spacing, accidental double punctuation, duplicated  | PASS | Static + CI | Automated rules: 0 problems on `8918f89`. Fixed: 13 straight apostrophes on screens, "authorize" ×2 (53fad58). |
| COPY-05 | Check singular/plural for 0, 1 and >1 | PASS | Unit | Shared count() helper; fixed "1 days to {race}" (Today), hero countdown, Journey story/share text, trophy card "1 RACE FINISHES", exercise and week counts. Tests: lib/plural.test.ts, Home.test "1 day to Parkrun PB", TrainingStory.test "1 confirmed training run over 1 week". Remaining P3: "The 1 run from Strava" wording. |
| COPY-06 | Check names with apostrophes/accents/emoji/long strings, race names with slash/hyphen, URLs, empty names | NOT RUN | — | Names with apostrophes/emoji/long strings not exercised in a browser. |
| COPY-07 | Test 5K/10K/half/marathon/ultra formatting | NOT RUN | — | Static review only: pace is always /km, effort always /10, 5K/10K race labels vs "5 km" measured distance are consistent. Not rendered. |
| COPY-08 | Test all error messages | NOT RUN | — | Error copy proofread statically (see copy register); 401/403/409/429/500/timeout states not driven. |
| COPY-09 | Check confirm/cancel labels correspond to their effects | FAIL | Static | D-12 "Undo" removes a saved race result; D-13 "Start recovery plan" only opens the page; D-14 "Continue to my plan" lands a new runner on an empty builder. |
| COPY-10 | Proofread all email templates **in received messages** for subject, preheader, greeting, copy, link labe | BLOCKED | — | Received-message review needs an opted-in test inbox and owner go-ahead; no email sent. Templates proofread statically: fixed "a 18 km long run" (push); email greeting punctuation and "5am" left as P3. |
| COPY-11 | Proofread PWA install prompts, offline notices, sign-in/continue securely, race search, training plan da | NOT RUN | — | Proofread statically; fixed home screen capitalisation, "My runs" → "Runs", Shoes path. Not rendered. |
| COPY-12 | Double-check **small-screen overflow** | NOT RUN | — | No screenshots inspected at small widths. |
| COPY-13 | Verify accessible names, alt text, aria labels, tab announcements and status readouts are correct and no | NOT RUN | — | Fixed aria "Close the finish line", "Stop easy running", "1 day to go". No screen-reader pass. |
| COPY-14 | Maintain a **copy-review register** | PASS | Static | Copy register below. |
| COPY-15 | Add representative assertions for critical labels/CTA terms in component or browser tests | PASS | Unit + CI | Assertions added for plural copy and updated for every changed label (unit and e2e). Full suites on `8918f89`: see CI. |
| NAV-01 | Installed PWA / Safari / desktop cold opening | NOT RUN | — | — |
| NAV-02 | Signed-out journey opens clear sign-in without exposing private content, including deep links, plan buil | NOT RUN | Static only | Source: SessionGate mounts App only with a session and account; privacy and unsubscribe stay public. Not driven in a browser here. |
| NAV-03 | Main nav **Home, Plan, Runs, Journey, Account** (Plan hidden only when appropriate) works on phone botto | FAIL | Static | D-10: Plan tab does nothing on Couch to 5K without a race plan (app/App.tsx:538). Rest of the bar inventoried in screen-inventory.md. |
| NAV-04 | Tap every page's primary/secondary buttons, list cards, tabs, navigation links, disclosures, dialogs, em | FAIL | Static | D-10 to D-17 (mismatched destinations, dead control). Full CTA inventory in screen-inventory.md. |
| NAV-05 | Deep-link to a plan, run, race, day, share link, calendar and email/unsubscribe URL | NOT RUN | Static only | Deep links inventoried (screen-inventory.md); `?view=plan` pushes fall back to build and reach the plan through the landing effect. |
| NAV-06 | Rapidly switch tabs while async responses are pending | NOT RUN | — | — |
| NAV-07 | Browser Back/Forward, iOS swipe back, reload after modal, screen orientation change, and leaving/returni | NOT RUN | — | — |
| NAV-08 | No duplicate sign-in buttons, awkward signed-in-as banners, redundant account prompts, multi-step flows  | NOT RUN | — | — |
| NAV-09 | Focus moves meaningfully for a *new* screen but does not jump to top after save, inline rating, undo or  | NOT RUN | — | — |
| NAV-10 | Every link opens the expected correct environment/host | NOT RUN | — | — |
| AUTH-01 | Fresh email one-time passcode signup, sign-in, return to originating destination and onboarding | BLOCKED | — | Owned by PR #315; needs live Entra and a test identity. |
| AUTH-02 | Returning session (Safari, desktop, installed iPhone PWA), idle for hours, expired 24-hour SPA token, si | BLOCKED | — | PR #315; needs a physical iPhone PWA (owner). |
| AUTH-03 | Redirect result with account but no API access token | BLOCKED | — | PR #315. |
| AUTH-04 | Wrong/expired passcode, offline sign-in, missing config, tenant mismatch, invalid scope/audience, 401/40 | BLOCKED | — | PR #315. |
| AUTH-05 | Sign out of one account, sign in as another | NOT RUN | — | — |
| AUTH-06 | Different Google/email identity same address does not silently merge runner data | BLOCKED | — | Needs live tenant configuration. |
| AUTH-07 | Guest/shared/public privacy/unsubscribe access is intentional and isolated | PASS | Unit (architecture) | AccessTests: only Calendar, Plans, Predictions, Races, StravaWebhook, Ticks and Unsubscribe controllers allow anonymous callers; every other controller needs the runner policy; no anonymous action inside them. 11/11 locally on `8918f89`. |
| AUTH-08 | Privacy consent version, optional heart-rate consent, export/delete, email preferences, error/retry and  | NOT RUN | — | — |
| BUILD-01 | Account signup → first training goal | NOT RUN | — | — |
| BUILD-02 | Search South African 5K, 10K, 15K, half marathon, marathon and ultras | NOT RUN | — | — |
| BUILD-03 | Race shortcuts, popular races, custom distance/date/name, invalid/malformed date, invalid negative/zero  | NOT RUN | — | — |
| BUILD-04 | Date selected (including Nov 9 start) is honored as the *actual* first training week | NOT RUN | — | — |
| BUILD-05 | Available running days, long-run day, optional strength days, work constraints and goal finish time prod | NOT RUN | — | — |
| BUILD-06 | Continue/Build Plan always reachable above keyboard and bottom safe area on iOS/Android in long race pic | NOT RUN | — | — |
| BUILD-07 | Run-walk, new runner, fast experienced runner, C25K, sub-2 half marathon, marathon and Comrades/ultra pl | NOT RUN | — | — |
| BUILD-08 | The original five-scene running cartoon begins immediately on **Build Plan** | NOT RUN | — | — |
| BUILD-09 | Existing runner new-plan/replan flows preserve previous saved race history and avoid overwriting account | NOT RUN | — | — |
| BUILD-10 | Shared plan URLs import/preview consistently without cross-user data access | NOT RUN | — | — |
| PLAN-01 | Home has one clear next workout or relevant post-race action | NOT RUN | — | — |
| PLAN-02 | Current-week list, All weeks, Calendar, Strength, Progress tabs (as present) show correct content | NOT RUN | — | — |
| PLAN-03 | Every day opens the correct details | NOT RUN | — | — |
| PLAN-04 | Move a run using the expected simple flow or drag-and-drop where provided | NOT RUN | — | — |
| PLAN-05 | Strength has its **separate Plan tab** (from PR #314), correct sets/reps/exercises and completion state | NOT RUN | — | — |
| PLAN-06 | Done/skipped/cut-short/not-done and Strava auto-match statuses represented clearly with accessible label | NOT RUN | — | — |
| PLAN-07 | Training load, totals, paces, target race date, distances and units agree across Home, Plan, Calendar, R | NOT RUN | — | — |
| PLAN-08 | Date edge cases | NOT RUN | — | — |
| PLAN-09 | Progress visualizations don't overflow or lie when zero runs, missing HR, sparse workouts, huge historie | NOT RUN | — | — |
| PLAN-10 | Plan edit/rebuild does not rewrite past results, erase check-ins, move historical dates, duplicate worko | NOT RUN | — | — |
| RUN-01 | Manual run logging | NOT RUN | — | — |
| RUN-02 | Validations prevent impossible/malformed distance, time, pace, negative numbers and accidental duplicate | NOT RUN | — | — |
| RUN-03 | Imported FIT/GPX/TCX, Strava backfill and sync are distinct sources | NOT RUN | — | — |
| RUN-04 | Sync same-day planned run exactly once | NOT RUN | — | — |
| RUN-05 | Multiple activities, ambiguous match, duplicate webhook, expired cached source, deleted/deauthorized Str | NOT RUN | — | — |
| RUN-06 | Post-run click opens **run analysis first**, with relevant metrics, splits, pace profile, intervals, pla | NOT RUN | — | — |
| RUN-07 | Ratings are the agreed quick **1–10 effort + Save as planned** experience | NOT RUN | — | — |
| RUN-08 | Rating save/update/undo, different device, offline queue, race-day RPE, cut-short and skipped states syn | NOT RUN | — | — |
| RUN-09 | A safe adaptation never erases completed sessions or overrides owner intent | NOT RUN | — | — |
| RUN-10 | Shoe tracker records mileage accurately and does not count an import twice | NOT RUN | — | — |
| RUN-11 | Run totals and streaks | NOT RUN | — | — |
| RUN-12 | Error during run detail, import, sync, chart render, Save/Delete or rate | NOT RUN | — | — |
| JOURNEY-01 | Detect race already imported from Strava and propose the result once | NOT RUN | — | — |
| JOURNEY-02 | Race result confirm/edit/undo, DNF, no recording/manual fallback, historic races, same-date conflicts | NOT RUN | — | — |
| JOURNEY-03 | Completed plan → finishing moment/summary → recovery options | NOT RUN | — | — |
| JOURNEY-04 | Train for another race is discoverable from **Home**, including when Easy running is active and after re | NOT RUN | — | — |
| JOURNEY-05 | Journey cabinet history, medals/trophies, archived chapters, achievement withdrawal, race search and dat | NOT RUN | — | — |
| JOURNEY-06 | First-time runner with no finish and athlete with many archived races have clean empty/dense states | NOT RUN | — | — |
| SHARE-01 | Run sticker displays only **actual** available pace/distance/time/date, all text visible over photo/vide | NOT RUN | — | — |
| SHARE-02 | Portrait, landscape, transparent and overlay variants produce legible image exports | NOT RUN | — | — |
| SHARE-03 | Size, filename, transparency and clickable shared links are correct for Instagram/WhatsApp target | BLOCKED | — | Real Instagram/WhatsApp on a device, owner-assisted. |
| EMAIL-01 | Signup/sign-in email, weekly Monday recap, inactive/no-runs message, release announcement, unsubscribe/p | NOT RUN | — | — |
| EMAIL-02 | Test recipient and live campaign isolation | PASS | Static | No email or push sent during this QA; nothing configured to send. |
| PUSH-01 | Notification permission denied/granted, scheduled reminders, no duplicate, local vs server scheduling, t | NOT RUN | — | — |
| ACCOUNT-01 | Profile/settings, photo upload large image or unsupported type, units, timezone, goal and privacy prefer | NOT RUN | — | — |
| ACCOUNT-02 | Strava connect/disconnect/reconnect and OAuth callback preserve account identity | NOT RUN | — | — |
| INSTALL-01 | Safari Add to Home Screen, Android install, cached PWA update, offline open, theme toggle and home-indic | BLOCKED | — | Physical device, owner-assisted. |
| TOOLS-01 | Pace/distance/time calculators, mileage conversion, race prediction, exported calendar, beginner shortcu | NOT RUN | — | — |
| EXTERNAL-01 | 404/unknown route, expired share, wrong external URL, broken image, stale asset, cancelled share, third- | NOT RUN | — | — |
| LOAD-01 | Cold launch/warm launch, first sign-in, saved-plan open, Runs list and run analysis | NOT RUN | — | — |
| LOAD-02 | The running cartoon animation is purposeful and compact on normal page waits, full only when appropriate | NOT RUN | — | — |
| LOAD-03 | Fast cached success should open immediately | NOT RUN | — | — |
| LOAD-04 | 401/403/409/429/500, DNS/offline, dropped connection, aborted fetch, stale async response, browser backg | NOT RUN | — | — |
| LOAD-05 | Error never appears as “no runs/no races/no plans” unless a successful empty response actually arrived | NOT RUN | — | — |
| LOAD-06 | On cancellation or retry, timers/listeners and old fetches stop, state is not overwritten, existing draf | NOT RUN | — | — |
| LOAD-07 | Measure reproducible boot, app shell, API readiness, initial content, plan fetch, run detail, sync and r | NOT RUN | — | No timings measured; PR #316 owns loading performance. No numbers are claimed. |
| LOAD-08 | Check reduced motion, memory/CPU usage when backgrounded, low-powered phone, enlarged text, orientation  | NOT RUN | — | — |
| VIS-01 | Compare **320, 375, 390/393, 430, 768, 1024, 1440, 1920 and 2560 CSS px** with short/tall viewport and b | NOT RUN | — | — |
| VIS-02 | No horizontal overflow, hidden bottom CTA, overlapping buttons, huge dead desktop whitespace, flicker, t | NOT RUN | — | — |
| VIS-03 | Contrast is legible on light/dark, including volt/lime text on white, Comrades/race titles, errors, disa | NOT RUN | — | — |
| VIS-04 | Every interactive control meets intended ~44px touch area, sane keyboard tab order, visible focus, label | NOT RUN | — | — |
| VIS-05 | Verify loading/brand cartoon, buttons, icons, PWA startup, font load, transitions and sticky navigation  | NOT RUN | — | — |
| VIS-06 | Screenshot representative screens and error/empty/loading states, **not just Home** | NOT RUN | — | — |
| VIS-07 | Test screen-reader basics manually where possible (VoiceOver iOS, NVDA desktop) | BLOCKED | — | VoiceOver/NVDA need a person at the device. |
| VIS-08 | Browser engine matrix | NOT RUN | — | — |
| SEC-01 | Every /me, plan, run, check-in, rate, image, Strava, privacy, export/delete endpoint enforces caller own | PASS | API (CI, disposable SQL) | DataIsolationTests: every /me endpoint returns 401 to an anonymous caller; another runner gets 404 for a plan id and its progress, insights, strava-completions, coach routes. Per-resource IDOR for runs, check-ins and shoes relies on existing suites. `8918f89` |
| SEC-02 | Correct CSP, cookie/token handling, no auth secrets in service-worker cache or logs | NOT RUN | — | — |
| SEC-03 | Bad upload content type/size, malicious filenames, oversized FIT session, malformed GPX/TCX, request bod | NOT RUN | — | — |
| SEC-04 | Rate-limit/sync queue/webhook replay, concurrent updates, duplicate job, idempotent save, race catalogue | NOT RUN | — | — |
| SEC-05 | SQL migration is additive/rollback-safe, no accidental data deletion, no production DB in test suite, no | PASS | Static | No migration in this PR; tests use the disposable-SQL guard (TestDatabaseSafety); no email, push or Strava calls made. |
| SEC-06 | App still works with existing saved plan formats, legacy local storage, old service-worker versions, cac | NOT RUN | — | — |

## Navigation inventory

The full static inventory of views, tabs, dialogs, CTAs, empty/error/loading states, deep links and post-race options is in [screen-inventory.md](screen-inventory.md), read from source at `8918f89`. It is **static**: no row there is a rendered PASS.

| Screen / entry point | State + role | Expected destination and back path | Width / theme / device | Result | Evidence |
|---|---|---|---|---|---|
| Bottom bar / rail: Home, Runs, Journey, Account | signed-in runner | that view; selected marker from `barCurrent` | — | NOT RUN (rendered) | static: `app/TabBar.tsx`, `app/App.tsx:533-561`; existing e2e `focused-training.spec.ts` in CI |
| Bar: Plan on Couch to 5K, no race plan | beginner runner | opens something | — | FAIL | static `app/App.tsx:538` returns `undefined` (D-10) |
| Plan tabs: This week / Calendar / Strength / Progress | active plan | each tab; Strength separate (PR #314) | — | NOT RUN (rendered) | static `features/plan/PlanView.tsx:100-105`; existing e2e in CI |
| Recovery "Review my race" | no saved race | Races & trophies (as the copy says) | — | FAIL | opens Training chapters (D-11) |
| Home "Start recovery plan" / JourneyPanel "Start recovery plan" | finished race | starts recovery | — | FAIL (label) | only navigates; JourneyPanel drops race id (D-13) |
| StravaWelcome "Continue to my plan" | new runner, no plan | their plan | — | FAIL (label) | lands on empty builder (D-14) |
| Runs › PhoneRunGuide "Open my training plan" | own plan | where "Log a run" is | — | FAIL (copy) | opens week view; Log a run is in day detail (D-15) |
| `?view=beginner` / `?view=onboarding` during account load | returning runner | loading state | — | FAIL | empty main (D-16), reported to PR #316 |
| Signed-out branches inside App (SignUpPitch, PlanLocked "Create a free account", "Sign in to save…") | signed out | — | — | not reachable in production | `SessionGate` mounts App only with an account; informational, reported to PR #315 |

## Copy/spelling review register

Static review of source strings. Fixed lines are in `53fad58` and `8918f89`; none has a browser screenshot yet.

| Surface | Before | After or "retain" | Why | Screenshot | Status |
|---|---|---|---|---|---|
| Today, race week | `{n} days to {race}` (gave "1 days") | `count(n, 'day')` | plural | — | Fixed, unit test |
| Home hero countdown (aria) | `${days} days to go` | `count(days, 'day')` | plural | — | Fixed |
| Journey story summary / share text | "{n} confirmed runs · {n} weeks", "…training runs over {n} weeks" | count() | plural | — | Fixed, unit test |
| Trophy cabinet share card | "{n} RACE FINISHES" | FINISH/FINISHES | plural | — | Fixed |
| Strength, day detail, plan header, volume chart, weekly review | "{n} exercises", "{n} weeks", "{n} substitutions", "{n} runs" | count() | plural | — | Fixed |
| Plan adjustment (API) | "A hill repeats doesn't fit into 6 km…" (×4) | "This hill repeats session doesn't fit…" | article/agreement with plural titles | — | Fixed |
| Monday push (API) | "a 18 km long run" | a/an from the number | article | — | Fixed, unit test |
| Goal outlook (API) | "a ultra usually needs" | "an ultra" | article | — | Fixed |
| Strava section | "Uploaded .fit files are yours and stay until you delete them." | "Runs you upload are yours…" | contradicted privacy notice (files are not kept) | — | Fixed |
| Strava welcome | "upload a run from My runs" | "from Runs" | screen name | — | Fixed |
| Easy running card | "Stop maintenance", "Maintenance couldn’t start." | "Stop easy running", "Easy running couldn’t start." | internal name | — | Fixed |
| Check-in card | "follow its seven-day cache"; "The activity association prevents…" | "are only kept for seven days"; "This run is linked, so it isn’t counted twice…" | jargon | — | Fixed |
| Training story note | "Cached copies aren’t counted…" | "They aren’t counted…" | jargon | — | Fixed |
| Calendar key | "Unmarked Outside plan." | "Unmarked: outside plan." | punctuation | — | Fixed |
| Shoe picker | "Account › Shoes" | "Account › Profile › More" | wrong path | — | Fixed |
| Finish-line film close (aria) | "Close the Finish Line" | "Close the finish line" | matches visible label | — | Fixed |
| Reminders | "your Home Screen" | "home screen" (iOS menu name kept) | consistency | — | Fixed |
| 13 screen strings | straight `'` | `’` | house style on screens | — | Fixed |
| Running-app guides | "authorize the connection" ×2 | "authorise"; Huawei's own menu label "Data Sharing and Authorization" kept | British spelling; third-party label | — | Fixed |
| API plan text, emails | straight `'` | retain | v1 plan text is hashed (GeneratorV1SnapshotTests); emails carry plain text | — | Retained |
| "THE MILES STAY WITH YOU.", "EARNED IN MILES.", "Your miles. Your story." | — | retain (brand call) | metric app; owner to decide | — | Owner decision |
| Terminology: log / confirm / check in / tick / mark done; replan vs Rebuild from today ("Undo replan", "illness replan", "Replan from here"); "sync" ×34; "prescription"; "Warm up" vs "warm-up"; "7 days" vs "seven days"; "Hi {name}." vs "Hi {name}," in emails | — | not changed | one vocabulary needs an owner decision, not piecemeal edits | — | Owner decision (D-18) |
| Other P3 polish (WeeklyRecaps word order, "5am", "may cost", "The 1 run", "Enable notifications" vs "Turn on reminders", "That did not work") | — | not changed yet | low risk; batch after D-18 | — | Open P3 |

## Defect ledger and retest

| Defect ID | Severity | Steps | Expected | Actual | Root cause | Fix commit / linked PR | Retest evidence |
|---|---|---|---|---|---|---|---|
| D-01 | P2 | Active plan, today = race date − 1, open Home | "1 day to {race}" | "1 days to {race}" | hard-coded plural (`TodayFocus.tsx`) | `8918f89` | Home.test "says 1 day…" (unit) |
| D-02 | P2 | Change my plan › Short on time on a hill-repeats day | grammatical sentence | "A hill repeats doesn't fit into…" | "A {title}" with plural titles (`SessionAdjustment.cs`) | `8918f89` | domain tests 110/110 (no text assertion) |
| D-03 | P2 | Monday push for a week with an 18 km long run | "an 18 km long run" | "a 18 km long run" | fixed article (`Reminders.cs`) | `8918f89` | ReminderTests theory (unit) |
| D-04 | P2 | Ultra plan with thin build | "an ultra" | "a ultra" | fixed article (`TrainingPlanGenerator.Outlook.cs`) | `8918f89` | domain tests pass; no text assertion |
| D-05 | P2 | Share trophy cabinet with one finish | "1 RACE FINISH" | "1 RACE FINISHES" | hard-coded plural | `8918f89` | static |
| D-06 | P2 | Account › Connections | matches privacy notice | said uploaded .fit files are kept | stale copy | `8918f89` | static |
| D-07 | P3 | various counts at 1 | singular | plural | no shared helper | `8918f89` | lib/plural.test, TrainingStory.test |
| D-08 | P3 | screens with contractions | `’` | `'` on 13 lines; "authorize" | mixed sources | `53fad58` | copy check in CI |
| D-09 | P3 | Easy running, check-in, story, Strava welcome, shoe picker | runner words, right screen names | "maintenance", "cache", "activity association", "My runs", "Account › Shoes" | internal names in copy | `8918f89` | unit tests updated |
| D-10 | P2 | Couch to 5K runner with no race plan taps Plan | something happens | nothing | `app/App.tsx:538` returns `undefined` | open — `App.tsx` is in PR #316's diff; flagged there | — |
| D-11 | P2 | Recovery page, no saved race, tap "Review my race" | Races & trophies | Training chapters | `openChapter()` targets training section | open — wiring in `App.tsx` (PR #316 diff) | — |
| D-12 | P3 | Saved race result › Undo | label says what happens | "Undo" begins removing the result | label | open | — |
| D-13 | P3 | Home or plan "Start recovery plan" | starts recovery | only opens the page; plan version drops race id | label + `App.tsx:1213` | open (PR #316 diff) | — |
| D-14 | P3 | New runner, StravaWelcome "Continue to my plan" | their plan | empty builder | label | open | — |
| D-15 | P3 | Runs › phone guide | button goes where the copy points | week view; "Log a run" is in day detail | copy/destination mismatch | open | — |
| D-16 | P3 | `?view=beginner` or `?view=onboarding` while account loads | loading state | empty main | not in SignInWait list | reported to PR #316 | — |
| D-17 | P3 | Brand-new runner, no plan, Home | first-run wording | post-training "Ready when you are." / "Choose my next challenge" | JourneyHomeCard fallback | open | — |
| D-18 | P3 | whole app | one vocabulary | five verbs for recording a run; replan vs rebuild; "sync" | grown over time | owner decision | — |

No P0 found. No P1 found in what was examined; that is not a claim that none exist in areas marked NOT RUN or BLOCKED.

## Timing / loading audit

Not measured in this PR; PR #316 owns it. No figures are claimed.

| Journey | Device/network | Before (measured) | After (measured) | Requests/duplicates | UI notes |
|---|---|---|---|---|---|
| First launch + login redirect | — | NOT MEASURED | NOT MEASURED | — | — |
| Open saved plan / Home | — | NOT MEASURED | NOT MEASURED | — | — |
| Runs list → analysis | — | NOT MEASURED | NOT MEASURED | — | — |
| Build Plan → movie → training | — | NOT MEASURED | NOT MEASURED | — | — |

## Cross-PR integration intelligence

- PR #315 — no auth defect found from source. Informational: App's signed-out branches are unreachable in production behind SessionGate. AUTH-01–04 stay BLOCKED on its live Entra and physical iPhone acceptance.
- PR #316 — D-16 (empty main during account load), D-10/D-11/D-13 sit in `App.tsx`, which #316 also changes; flagged there to avoid conflicting edits. "Checking your session…" (`App.tsx:1104`) needs `auth.loading` inside App, which SessionGate should prevent: likely unreachable in production; #316 to confirm on a deployed build. SignInWait's Pause/Resume warm-up was not observed in real use, so no finding either way.
- PR #314 — Strength is still a separate Plan tab and the auth-first gate is unchanged; no file from #314's gate (`app/AppAuth.tsx`) was edited here.

## Release decision

**Verdict: NO-GO.**

Register (104 IDs): **10 PASS · 3 FAIL · 9 BLOCKED · 82 NOT RUN**. A PASS here means observed evidence at the level stated; many NOT RUN areas are touched by existing Playwright suites that passed in CI, but none was re-scoped and inspected against its row, so they are not counted.

CI on `8918f89`: backend (incl. DataIsolationTests on disposable SQL), frontend, Playwright 1–4/4, connections android-chromium, iphone-webkit, desktop-firefox all **passed**; copy check and secret scan passed. connections ipad-webkit timed out in `playwright install` before any test ran and was re-run; its result and the final head run are in the PR conversation. Green CI is necessary, not sufficient.

P0 open: none found.
P1 open: none found in what was examined.
P2 open: D-10, D-11 (navigation, in `App.tsx`).
Copy review complete: **static yes** (all 4,144 strings proofread, pinned check in CI); **rendered no**.
Navigation inventory complete: **static yes**, rendered no.
All primary user states completed: **No** (S0–S15 not driven in a browser by this PR beyond the existing suites).
Live provider / physical PWA checks: **Not run** (owner-assisted, PR #315).
Owner acceptance: **Pending**.

Why NO-GO: two open P2 navigation defects; no rendered/visual review at the required widths; live Entra and physical iPhone acceptance not done. Before production: fix D-10/D-11 (here or in #316), run a staging click-through with screenshots at 375/390/768/1440 in both themes, and complete #315's physical sign-in checks.
