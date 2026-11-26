# Taperday whole-app QA results — implementation and execution ledger

## Current completion baseline — 26 November 2026

Continue from the [current handover in the existing contract](master-regression-acceptance.md#current-completion-handover-26-november-2026).
The scenario register and older execution notes below are historical evidence, not a new live audit. Preserve all
104 IDs and update applicable rows from actual current results; do not turn an entire provider/device row PASS from CI.
The recorded 15 PASS / 0 FAIL / 10 BLOCKED / 79 NOT RUN aggregate has not been re-executed by this documentation update.

| Candidate | Verified completed code/checks on its implementation head | Still outstanding |
|---|---|---|
| [#326](https://github.com/Menzi-Thami/start-line/pull/326), `7a6792cb02d0c1980920ecaafd320852f79d4496` | [All 13 checks passed](https://github.com/Menzi-Thami/start-line/actions/runs/45554933063): frontend 1,134; backend 1,967 including disposable SQL 438; main Playwright 476 and compatibility 685 passed | Merged into staging as `16f013f1c76e67fcd12e2b6a45ebfb9355ed4d0f` on 26 November; deployed integrated journeys, physical-device/provider acceptance and release decision still required |
| [#327](https://github.com/Menzi-Thami/start-line/pull/327), `80b3e578291ec6810aecba8f5aeeee0dc2c6ccb5` | [All 13 checks passed](https://github.com/Menzi-Thami/start-line/actions/runs/45578051231): helper 11; frontend 1,133; backend 1,967 including disposable SQL 438; main Playwright 464 and compatibility 661 passed; 30 new browser checks passed locally | Open draft, updated from staging `9d2059b`; new combined-head CI, actual tenant setup, password signup/reset/Google, existing-email-code upgrade and physical-device acceptance |

These are separate implementation heads verified on 25 November; their GitHub state/refs were refreshed on 26 November.
The auth branch now incorporates #326 and the current staging dependency updates. The standalone counts above do not
establish a pass for its new combined head or a deployed SHA. Each baseline discloses two optional
capture and seven existing engine/CDP test exclusions; the shared Firefox axe limitation is not a raw audit pass.

The owner deferred staging SQL restoration and authorised controlled production testing. Staging was paused by quota
error 42119 until 1 December; recheck before use. This handover did not change billing, tenant settings or customer data,
initiate deployment, or modify staging/main. The auth branch was synchronised with current staging. The #326 merge was
observed separately at 13:11:23 UTC; current staging is `9d2059b`.
A prior environment's missing Entra access does not establish Claude's access; verify it.
The PR handovers link completed #318 policy/role verification, so do not recreate that old exclusion-gap fix without a
current reproduced defect. The old #319 static-copy statement that Forgot password converts an email-code account is
superseded by the current password guide. Readiness AUTH-01/R01 (account upgrade) is distinct from master AUTH-01 below
(fresh email-code signup). Record live password, compatibility and upgrade results separately.

**Handover validation on combined application source `20433d2`:** 26 helper/configuration/release/migration tests passed;
`bash -n scripts/check.sh` passed. All 104 original contract IDs and original result rows were retained; relative links
and anchors in the five handover documents were checked. Current copy check: 4,189 pieces in 287 files, 0 style/spelling
problems. The connection runner lists 712 tests in 19 files, including both password-check and release-readiness suites;
this is an inventory, not a 712-test execution. Full CI at the new combined PR head and live acceptance still need their
own results. No new provider, physical-device or deployment pass is claimed by this handover.

## Historical execution record — 24 November 2026

**Updated:** 24 November 2026. **Source of truth:** [master QA contract](master-regression-acceptance.md). Results are scoped to the stated evidence level; browser fixtures do not prove external providers or physical devices.

**Tested application code SHA:** `c85415e5bdf19a9d3beb26910242075ad7bb6869`, incorporating staging `0fe4c088374104af519792c4565b5c1cff98e5fa`.
**Follow-up:** callback fixture uses an absolute module path; reviewed strict image baselines distinguish Debian/Ubuntu font rasterisation. No screenshot tolerance was relaxed. Final test-harness commit/check URLs are recorded in the PR description.
**Local:** .NET 10.0.302, Node 24.19.0, pinned Playwright 1.65.1; disposable loopback SQL Server, synthetic fixtures only.
**Executed:** full frontend **1,089/1,089**, 147 files; disposable SQL **438/438**; Application **237/237**; Architecture **11/11**; Domain **1,279/1,279** before two added copy tests; focused Domain **49/49** including those regressions. Format verification passed.
**Focused browser:** Chromium primary pages + four Plan tabs at 390 light/dark, new-runner goal, Runs 401/403/409/429/500 → retry; WebKit equivalent 390 light/dark, goal and 401/500 recovery. Delayed OAuth callback, C25K Plan return and recovery → Races & trophies also executed after fixes. See completion evidence below.
**CI at `c85415e`:** frontend/backend/copy/secret scan passed. Browser jobs correctly failed the new fixture and OS baseline mismatches; follow-up fixes are retested, never counted as a green old run. [Checks](https://github.com/Menzi-Thami/start-line/actions/runs/45364946445) · [copy](https://github.com/Menzi-Thami/start-line/actions/runs/45364946448) · [secrets](https://github.com/Menzi-Thami/start-line/actions/runs/45364946572).
**Staging deployed build:** not exercised in this run; no merge/deploy performed. Live Entra, inbox/push/Strava and all physical-device rows remain unverified.

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
| COPY-02 | Run a repository spellchecker (add a **pinned, reproducible CI job** if none exists) | PASS | Static + CI | Pinned cspell/house-style checks: 4,140 copy pieces, 0 spelling/style findings; 9 self-tests. Current CI copy job passed at c85415e. |
| COPY-03 | Manually review actual **rendered** copy at phone and desktop sizes, not only string literals | NOT RUN | — | Rendered copy at phone/desktop widths not inspected. Needs a browser pass on staging. |
| COPY-04 | Search for typos, inconsistent capitalization, weird spacing, accidental double punctuation, duplicated  | PASS | Static + CI | Automated rules: 0 problems on `8918f89`. Fixed: 13 straight apostrophes on screens, "authorize" ×2 (53fad58). |
| COPY-05 | Check singular/plural for 0, 1 and >1 | PASS | Unit | Shared count() helper; fixed "1 days to {race}" (Today), hero countdown, Journey story/share text, trophy card "1 RACE FINISHES", exercise and week counts. Tests: lib/plural.test.ts, Home.test "1 day to Parkrun PB", TrainingStory.test "1 confirmed training run over 1 week". Remaining P3: "The 1 run from Strava" wording. |
| COPY-06 | Check names with apostrophes/accents/emoji/long strings, race names with slash/hyphen, URLs, empty names | NOT RUN | — | Names with apostrophes/emoji/long strings not exercised in a browser. |
| COPY-07 | Test 5K/10K/half/marathon/ultra formatting | NOT RUN | — | Static review only: pace is always /km, effort always /10, 5K/10K race labels vs "5 km" measured distance are consistent. Not rendered. |
| COPY-08 | Test all error messages | NOT RUN | — | Error copy proofread statically (see copy register); 401/403/409/429/500/timeout states not driven. |
| COPY-09 | Check confirm/cancel labels correspond to their effects | NOT RUN | Unit + Browser (partial) | D-12–D-15 fixed in c85415e; result removal/cancel, recovery race ID and new-runner continuation tested. Complete every-CTA inventory remains unexecuted. |
| COPY-10 | Proofread all email templates **in received messages** for subject, preheader, greeting, copy, link labe | BLOCKED | — | Received-message review needs an opted-in test inbox and owner go-ahead; no email sent. Templates proofread statically: fixed "a 18 km long run" (push); email greeting punctuation and "5am" left as P3. |
| COPY-11 | Proofread PWA install prompts, offline notices, sign-in/continue securely, race search, training plan da | NOT RUN | — | Proofread statically; fixed home screen capitalisation, "My runs" → "Runs", Shoes path. Not rendered. |
| COPY-12 | Double-check **small-screen overflow** | NOT RUN | — | No screenshots inspected at small widths. |
| COPY-13 | Verify accessible names, alt text, aria labels, tab announcements and status readouts are correct and no | NOT RUN | — | Fixed aria "Close the finish line", "Stop easy running", "1 day to go". No screen-reader pass. |
| COPY-14 | Maintain a **copy-review register** | PASS | Static | Copy register below. |
| COPY-15 | Add representative assertions for critical labels/CTA terms in component or browser tests | PASS | Unit + CI | Assertions added for plural copy and updated for every changed label (unit and e2e). Full suites on `8918f89`: see CI. |
| NAV-01 | Installed PWA / Safari / desktop cold opening | NOT RUN | — | — |
| NAV-02 | Signed-out journey opens clear sign-in without exposing private content, including deep links, plan buil | NOT RUN | Static only | Source: SessionGate mounts App only with a session and account; privacy and unsubscribe stay public. Not driven in a browser here. |
| NAV-03 | Main nav **Home, Plan, Runs, Journey, Account** (Plan hidden only when appropriate) works on phone botto | PASS | Browser + Unit | Chromium 390 both themes: Home/Plan/Runs/Journey/Account and four Plan tabs. New actual-App C25K Progress → main Plan → This week browser regression passed; physical nav remains a separate gate. |
| NAV-04 | Tap every page's primary/secondary buttons, list cards, tabs, navigation links, disclosures, dialogs, em | NOT RUN | Browser (partial) | Known D-10–D-17 fixed, including C25K and recovery destination click-through. Full inventory of all dialogs/menus and conditional CTAs is not complete. |
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
| PLAN-02 | Current-week list, All weeks, Calendar, Strength, Progress tabs (as present) show correct content | PASS | Browser | Actual App: This week, Calendar, Strength, Progress each selected and captured in both themes at 390; main navigation retained. |
| PLAN-03 | Every day opens the correct details | NOT RUN | — | — |
| PLAN-04 | Move a run using the expected simple flow or drag-and-drop where provided | NOT RUN | — | — |
| PLAN-05 | Strength has its **separate Plan tab** (from PR #314), correct sets/reps/exercises and completion state | PASS | Unit + Browser | Strength stays a separate Plan tab. Full frontend suite passed; tab and strength content captured in both themes. No strength/prescription code changed. |
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
| LOAD-05 | Error never appears as “no runs/no races/no plans” unless a successful empty response actually arrived | PASS | Browser | Runs 401/403/409/429/500 are actionable errors, never empty history; retry restores recordings. WebKit 401/500 repeated. Other API boundaries retain their unit/SQL coverage. |
| LOAD-06 | On cancellation or retry, timers/listeners and old fetches stop, state is not overwritten, existing draf | NOT RUN | — | — |
| LOAD-07 | Measure reproducible boot, app shell, API readiness, initial content, plan fetch, run detail, sync and r | NOT RUN | — | No timings measured; PR #316 owns loading performance. No numbers are claimed. |
| LOAD-08 | Check reduced motion, memory/CPU usage when backgrounded, low-powered phone, enlarged text, orientation  | NOT RUN | — | — |
| VIS-01 | Compare **320, 375, 390/393, 430, 768, 1024, 1440, 1920 and 2560 CSS px** with short/tall viewport and b | NOT RUN | — | — |
| VIS-02 | No horizontal overflow, hidden bottom CTA, overlapping buttons, huge dead desktop whitespace, flicker, t | NOT RUN | — | — |
| VIS-03 | Contrast is legible on light/dark, including volt/lime text on white, Comrades/race titles, errors, disa | NOT RUN | — | — |
| VIS-04 | Every interactive control meets intended ~44px touch area, sane keyboard tab order, visible focus, label | NOT RUN | — | — |
| VIS-05 | Verify loading/brand cartoon, buttons, icons, PWA startup, font load, transitions and sticky navigation  | NOT RUN | — | — |
| VIS-06 | Screenshot representative screens and error/empty/loading states, **not just Home** | PASS | Browser + visual review | Primary Home, all Plan tabs, Runs, Journey, Account captured. Reviewed phone/desktop images and strict goal-card baselines; inspection exposed D-19 and triggered its actual fix. See completion evidence. |
| VIS-07 | Test screen-reader basics manually where possible (VoiceOver iOS, NVDA desktop) | BLOCKED | — | VoiceOver/NVDA need a person at the device. |
| VIS-08 | Browser engine matrix | BLOCKED | Browser + physical gap | Automated Chromium/Firefox/WebKit matrix runs in CI and focused local browser checks. Actual iPhone/iPad/Android/macOS/Windows/installed PWA acceptance not performed. |
| SEC-01 | Every /me, plan, run, check-in, rate, image, Strava, privacy, export/delete endpoint enforces caller own | PASS | API + Architecture | 438 disposable-SQL integration + 11 architecture tests passed. Anonymous /me and foreign-plan access covered by DataIsolationTests; existing run/check-in/shoe ownership suites executed. |
| SEC-02 | Correct CSP, cookie/token handling, no auth secrets in service-worker cache or logs | NOT RUN | — | — |
| SEC-03 | Bad upload content type/size, malicious filenames, oversized FIT session, malformed GPX/TCX, request bod | NOT RUN | — | — |
| SEC-04 | Rate-limit/sync queue/webhook replay, concurrent updates, duplicate job, idempotent save, race catalogue | NOT RUN | — | — |
| SEC-05 | SQL migration is additive/rollback-safe, no accidental data deletion, no production DB in test suite, no | PASS | Static + API | No new application migrations; isolated local SQL guard retained and actually used. No production database/provider mutation or messages sent. |
| SEC-06 | App still works with existing saved plan formats, legacy local storage, old service-worker versions, cac | NOT RUN | — | — |

## Navigation inventory

The full static inventory of views, tabs, dialogs, CTAs, empty/error/loading states, deep links and post-race options is in [screen-inventory.md](screen-inventory.md), read from source at `8918f89`. It is **static**: no row there is a rendered PASS.

| Screen / entry point | State + role | Expected destination and back path | Width / theme / device | Result | Evidence |
|---|---|---|---|---|---|
| Bottom bar / rail: Home, Runs, Journey, Account | signed-in runner | that view; selected marker from `barCurrent` | — | NOT RUN (rendered) | static: `app/TabBar.tsx`, `app/App.tsx:533-561`; existing e2e `focused-training.spec.ts` in CI |
| Bar: Plan on Couch to 5K, no race plan | beginner runner | back to This week | — | NOT RUN (rendered) | D-10 fixed in `9b6c031`, unit test |
| Plan tabs: This week / Calendar / Strength / Progress | active plan | each tab; Strength separate (PR #314) | — | NOT RUN (rendered) | static `features/plan/PlanView.tsx:100-105`; existing e2e in CI |
| Recovery "Review my race" | no saved race | Races & trophies (as the copy says) | — | NOT RUN (rendered) | D-11 fixed in `9b6c031`, unit test |
| Home / Plan "Explore recovery options" | finished race | recovery options for saved race | 390, light/dark, simulated | PASS (scoped) | D-13 fixed; race-id callback and no-start mutation assertions |
| StravaWelcome "Choose my training goal" | connected new runner, no plan | builder | component | PASS (scoped) | D-14 fixed; ready linked plan retains Continue to my plan |
| Runs › PhoneRunGuide "Open my training plan" | own plan | week view, with explicit instruction to open a day | component | PASS (scoped) | D-15 regression checks day instruction and destination callback |
| `?view=beginner` / `?view=onboarding` during account load | returning runner | loading state | browser profiles | PASS (scoped) | D-16 wait visible then correct destination after response |
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
| D-02 | P2 | Change my plan › Short on time on a hill-repeats day | grammatical sentence | "A hill repeats doesn't fit into…" | "A {title}" with plural titles (`SessionAdjustment.cs`) | `8918f89` | SessionAdjusterTests explicit hill-repeat sentence assertion; focused Domain 49/49 |
| D-03 | P2 | Monday push for a week with an 18 km long run | "an 18 km long run" | "a 18 km long run" | fixed article (`Reminders.cs`) | `8918f89` | ReminderTests theory (unit) |
| D-04 | P2 | Ultra plan with thin build | "an ultra" | "a ultra" | fixed article (`TrainingPlanGenerator.Outlook.cs`) | `8918f89` | GoalOutlookTests explicit an-ultra wording assertion; focused Domain 49/49 |
| D-05 | P2 | Share trophy cabinet with one finish | "1 RACE FINISH" | "1 RACE FINISHES" | hard-coded plural | `8918f89` | TrophyCabinet export footer assertion |
| D-06 | P2 | Account › Connections | matches privacy notice | said uploaded .fit files are kept | stale copy | `8918f89` | StravaSection privacy-copy assertion |
| D-07 | P3 | various counts at 1 | singular | plural | no shared helper | `8918f89` | lib/plural.test, TrainingStory.test |
| D-08 | P3 | screens with contractions | `’` | `'` on 13 lines; "authorize" | mixed sources | `53fad58` | copy check in CI |
| D-09 | P3 | Easy running, check-in, story, Strava welcome, shoe picker | runner words, right screen names | "maintenance", "cache", "activity association", "My runs", "Account › Shoes" | internal names in copy | `8918f89` | unit tests updated |
| D-10 | P2 | Couch to 5K runner with no race plan taps Plan | something happens | nothing | `app/App.tsx:538` returns `undefined` | `9b6c031`: back to This week and top of page, as on a race plan (owner chose to fix here) | CouchTo5K.test (unit); App wiring by review; CI e2e |
| D-11 | P2 | Recovery page, no saved race, tap "Review my race" | Races & trophies | Training chapters | `openChapter()` targets training section | `9b6c031`: opens Races & trophies via `openRaces` | RecoveryPlanPage.test (unit) |
| D-12 | P3 | Saved race result › Undo | label says what happens | "Undo" begins removing the result | label | c85415e | Unit + browser regression |
| D-13 | P3 | Home or plan "Start recovery plan" | starts recovery | only opens the page; plan version drops race id | label + `App.tsx:1213` | c85415e | Unit + browser regression |
| D-14 | P3 | New runner, StravaWelcome "Continue to my plan" | their plan | empty builder | label | c85415e | Unit + browser regression |
| D-15 | P3 | Runs › phone guide | button goes where the copy points | week view; "Log a run" is in day detail | copy/destination mismatch | c85415e | Unit + browser regression |
| D-16 | P3 | `?view=beginner` or `?view=onboarding` while account loads | loading state | empty main | not in SignInWait list | c85415e | Actual-App loading deep links (beginner/onboarding) passed |
| D-17 | P3 | Brand-new runner, no plan, Home | first-run wording | post-training "Ready when you are." / "Choose my next challenge" | JourneyHomeCard fallback | c85415e | Unit + browser regression |
| D-18 | P3 | whole app | one vocabulary | five verbs for recording a run; replan vs rebuild; "sync" | grown over time | owner decision | — |

| D-19 | P2 | Home deep link → Plan | loaded plan only | opening/slow account wait remained above ready training | openSaved did not end initial handoff | c85415e: mark explicit navigation landed | Account component test + Chromium/WebKit journey assert no finding-plan |
| D-20 | P2 | delayed Strava callback/cancel after Account mounted | visible truthful outcome and refreshed status | notice lost/hidden; stale initial connection status | prop copied into initial state, disclosure initialised once, status read too early | c85415e: derive notice, open on new outcome, read status after callback | component tests + delayed callback browser PASS Chromium/WebKit (synthetic) |

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

## Earlier release decision (historical, superseded below)

**Verdict: NO-GO.**

Register (104 IDs): **10 PASS · 2 FAIL · 9 BLOCKED · 83 NOT RUN**. A PASS here means observed evidence at the level stated; many NOT RUN areas are touched by existing Playwright suites that passed in CI, but none was re-scoped and inspected against its row, so they are not counted.

CI on `8918f89`: backend (incl. DataIsolationTests on disposable SQL), frontend, Playwright 1–4/4, connections android-chromium, iphone-webkit, desktop-firefox all **passed**; copy check and secret scan passed. connections ipad-webkit timed out in `playwright install` before any test ran and was re-run; its result and the final head run are in the PR conversation. Green CI is necessary, not sufficient.

P0 open: none found.
P1 open: none found in what was examined.
P2 open: none (D-10, D-11 fixed in `9b6c031`; unit-tested, not yet clicked through on staging).
Copy review complete: **static yes** (all 4,144 strings proofread, pinned check in CI); **rendered no**.
Navigation inventory complete: **static yes**, rendered no.
All primary user states completed: **No** (S0–S15 not driven in a browser by this PR beyond the existing suites).
Live provider / physical PWA checks: **Not run** (owner-assisted, PR #315).
Owner acceptance: **Pending**.

Why NO-GO: no rendered/visual review at the required widths; live Entra and physical iPhone acceptance not done; open P3 label mismatches (D-12 to D-17). Before production: run a staging click-through (including D-10/D-11) with screenshots at 375/390/768/1440 in both themes, and complete #315's physical sign-in checks.

## Completion-run evidence and current release decision

**NO-GO for release.** Implemented fixes are pushed; this is not a claim that every manual contract row passed.
Original Taperday colours, runner animation, 17.5-second plan film, typography and Strength separation are preserved.

- D-12: “Remove saved result” opens a clear confirmation; “Keep it” retains the saved result. Regression assertions protect both.
- D-13: “Explore recovery options” describes navigation, and Plan passes the exact saved race ID to recovery. No recovery mutation on that tap.
- D-14: connected new runners choose a training goal; a ready linked plan still offers “Continue to my plan”.
- D-15: manual-run guide explicitly says open a day before using Log a run; destination callback tested.
- D-16: beginner/onboarding account loads render the existing runner wait; both actual-App deep links tested through completion.
- D-17: no-history Home offers “Choose my goal”; exported light/dark card snapshots are strictly compared.
- D-19: removed obsolete account wait above loaded Plan, found by screenshot inspection and protected by component/browser assertions.
- D-20: delayed callback outcome remains visible; Connections opens for a new outcome and status is fetched after connection completion.
- Added direct regressions for earlier D-02/D-04 wording and D-05/D-06 export/privacy copy; no v1 generator outputs changed.

**Screen evidence:** [reviewed phone/desktop samples](completion/). All data is synthetic. Full width/theme captures are
retained as release-regression and connection CI artifacts. The 320px initial inspection found D-19; fresh 390px
Chromium/WebKit captures show the corrected Plan with no account loader. Light and dark preserve the original palette.
The new suite sweeps 320/375/390/393/430/768/1024/1440/1920/2560. The original five-scene plan film is untouched.

**Local limits and retests:** initial runs caught outdated label assertions, a too-early unit query, the callback fixture's
relative script failing after history changed, and strict baseline differences (37 light / 6 dark pixels). The fixture path
was fixed; both OS images were visually compared side-by-side (same 342×240 geometry/copy/layout), and separate reviewed
Debian/Ubuntu baselines retain strict comparison with no tolerance change. No tests were removed or weakened. An obsolete
frontend run was interrupted after known failures were fixed; the subsequent complete 1,089-test run passed.

**Security:** gitleaks 8.30.1 scanned the working tree with redaction: no leaks. Copy check passed. Dependency audit,
Kestrel upload limits, authorization/ownership, schema consistency and full backend tests run in exact-head CI.
No production data, real Strava mutations, email/push delivery, tenant edits, merges or deploys were used.

**Unsharded verification:** CI now offers `workflow_dispatch` → `unsharded=true` on the existing Checks workflow, keeping
all per-scenario timeouts. This executes the complete suite without sharding (larger aggregate budget only). Initial run
45364957227 correctly failed the fixture/baseline issues; the fixed final run and exact head are recorded in the PR description.

**Outstanding:** live Entra and actual physical-device/PWA/native-credential checks (#315); staging execution of both PRs
after approved integration; received email, opt-in push and real native sharing; the remaining NOT RUN rows and full
S0–S15 manual/error/keyboard/screen-reader matrix. D-18 is a deferred vocabulary/product preference; no blanket rewrite
of the original brand or immutable generator text was made. These gaps prevent GO even if automated CI is green.

Current 104-ID register: **15 PASS · 0 FAIL · 10 BLOCKED · 79 NOT RUN**. PASS is limited to its stated evidence level; partial observations are recorded without upgrading the full row.

## Sign-in copy in both modes (PR #319) — static review

Checked every runner-facing string that mentions codes or passwords, with `VITE_AUTH_PASSWORDS` on and off.

| Surface | Code mode (production today) | Password mode (staging) | Result |
|---|---|---|---|
| SignInLanding | no hint (the old "tap Yes to stay signed in" line is gone) | "Signed in with an emailed code before? Choose **Forgot password?** once to set a password, and let your phone save it." | PASS (static, unit test in #319) |
| SignUpPitch | "We email you a code to sign in. No password to remember, no card needed." | "Choose a password and let your phone save it. No card needed." | PASS (static). Note: SignUpPitch sits behind SessionGate, so production runners never see it; the hosted Entra pages carry the real sign-up wording |
| Privacy notice | "Sign-in is handled by Microsoft, so we never see a password." | same, still true | PASS (static) |
| Outage email (`UpdateEmails.cs`, "Not getting your Taperday sign-in code?") | accurate for the code outage it was written for | wrong if re-sent to password-flow runners | Note: one-off broadcast; do not re-send once passwords are on |
| Microsoft-hosted sign-in, sign-up and reset pages | not in this repository | not in this repository | BLOCKED: live tenant, #315 |

## Final head CI

Head `51f919d`: [Checks (PR)](https://github.com/Menzi-Thami/start-line/actions/runs/45367390190) and [Checks (unsharded release regression, workflow_dispatch)](https://github.com/Menzi-Thami/start-line/actions/runs/45367547993) both green on every job; [Copy check](https://github.com/Menzi-Thami/start-line/actions/runs/45367391538) and [Secret scan](https://github.com/Menzi-Thami/start-line/actions/runs/45367390483) green. The PR merges cleanly into staging `0fe4c08`.

**Still NO-GO.** Staging cannot show this PR's changes until it is merged into staging, and the owner has asked for no merge before the gates are met. The rendered checks above are Playwright emulation, not the deployed staging build or a physical iPhone.

## Commit identity rewrite (24 November 2026)

Three commits on this branch were re-authored to the GitHub noreply address at the owner's request. Their content is unchanged: the tree is identical, and earlier commits (up to `e51b0f6`) and staging `0fe4c08` keep their SHAs. SHAs cited above map as follows:

| Before | After |
|---|---|
| `27b2e9e` (merge of staging) | `1063013` |
| `c85415e` | `a633302` |
| `51f919d` | `bc60f8f` |
| `3799f6d` | `b1da36c` |

CI runs linked against the old SHAs tested the same tree. A fresh run on the new head is linked in the PR conversation.
