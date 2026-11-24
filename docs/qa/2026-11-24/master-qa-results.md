# Taperday whole-app QA results — fill after actual execution

**Prepared:** 24 November 2026. **Source of truth:** [master QA contract](master-regression-acceptance.md). **All statuses start as NOT RUN; no test has been claimed passed by the creation of this file.**

**Current PR head SHA:** _Not yet recorded_
**Base / deployed staging SHA:** _Not yet recorded_
**Environment / staging URL:** _Not yet recorded_
**Runner fixtures and device profiles (synthetic):** _Not yet recorded_
**CI + secret scan exact-SHA URLs:** _Not yet recorded_
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
| COPY-01 | Inventory **all rendered static strings** in React JSX, source constants, translated/templated text, ove | NOT RUN | — | — |
| COPY-02 | Run a repository spellchecker (add a **pinned, reproducible CI job** if none exists) | NOT RUN | — | — |
| COPY-03 | Manually review actual **rendered** copy at phone and desktop sizes, not only string literals | NOT RUN | — | — |
| COPY-04 | Search for typos, inconsistent capitalization, weird spacing, accidental double punctuation, duplicated  | NOT RUN | — | — |
| COPY-05 | Check singular/plural for 0, 1 and >1 | NOT RUN | — | — |
| COPY-06 | Check names with apostrophes/accents/emoji/long strings, race names with slash/hyphen, URLs, empty names | NOT RUN | — | — |
| COPY-07 | Test 5K/10K/half/marathon/ultra formatting | NOT RUN | — | — |
| COPY-08 | Test all error messages | NOT RUN | — | — |
| COPY-09 | Check confirm/cancel labels correspond to their effects | NOT RUN | — | — |
| COPY-10 | Proofread all email templates **in received messages** for subject, preheader, greeting, copy, link labe | NOT RUN | — | — |
| COPY-11 | Proofread PWA install prompts, offline notices, sign-in/continue securely, race search, training plan da | NOT RUN | — | — |
| COPY-12 | Double-check **small-screen overflow** | NOT RUN | — | — |
| COPY-13 | Verify accessible names, alt text, aria labels, tab announcements and status readouts are correct and no | NOT RUN | — | — |
| COPY-14 | Maintain a **copy-review register** | NOT RUN | — | — |
| COPY-15 | Add representative assertions for critical labels/CTA terms in component or browser tests | NOT RUN | — | — |
| NAV-01 | Installed PWA / Safari / desktop cold opening | NOT RUN | — | — |
| NAV-02 | Signed-out journey opens clear sign-in without exposing private content, including deep links, plan buil | NOT RUN | — | — |
| NAV-03 | Main nav **Home, Plan, Runs, Journey, Account** (Plan hidden only when appropriate) works on phone botto | NOT RUN | — | — |
| NAV-04 | Tap every page's primary/secondary buttons, list cards, tabs, navigation links, disclosures, dialogs, em | NOT RUN | — | — |
| NAV-05 | Deep-link to a plan, run, race, day, share link, calendar and email/unsubscribe URL | NOT RUN | — | — |
| NAV-06 | Rapidly switch tabs while async responses are pending | NOT RUN | — | — |
| NAV-07 | Browser Back/Forward, iOS swipe back, reload after modal, screen orientation change, and leaving/returni | NOT RUN | — | — |
| NAV-08 | No duplicate sign-in buttons, awkward signed-in-as banners, redundant account prompts, multi-step flows  | NOT RUN | — | — |
| NAV-09 | Focus moves meaningfully for a *new* screen but does not jump to top after save, inline rating, undo or  | NOT RUN | — | — |
| NAV-10 | Every link opens the expected correct environment/host | NOT RUN | — | — |
| AUTH-01 | Fresh email one-time passcode signup, sign-in, return to originating destination and onboarding | NOT RUN | — | — |
| AUTH-02 | Returning session (Safari, desktop, installed iPhone PWA), idle for hours, expired 24-hour SPA token, si | NOT RUN | — | — |
| AUTH-03 | Redirect result with account but no API access token | NOT RUN | — | — |
| AUTH-04 | Wrong/expired passcode, offline sign-in, missing config, tenant mismatch, invalid scope/audience, 401/40 | NOT RUN | — | — |
| AUTH-05 | Sign out of one account, sign in as another | NOT RUN | — | — |
| AUTH-06 | Different Google/email identity same address does not silently merge runner data | NOT RUN | — | — |
| AUTH-07 | Guest/shared/public privacy/unsubscribe access is intentional and isolated | NOT RUN | — | — |
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
| SHARE-03 | Size, filename, transparency and clickable shared links are correct for Instagram/WhatsApp target | NOT RUN | — | — |
| EMAIL-01 | Signup/sign-in email, weekly Monday recap, inactive/no-runs message, release announcement, unsubscribe/p | NOT RUN | — | — |
| EMAIL-02 | Test recipient and live campaign isolation | NOT RUN | — | — |
| PUSH-01 | Notification permission denied/granted, scheduled reminders, no duplicate, local vs server scheduling, t | NOT RUN | — | — |
| ACCOUNT-01 | Profile/settings, photo upload large image or unsupported type, units, timezone, goal and privacy prefer | NOT RUN | — | — |
| ACCOUNT-02 | Strava connect/disconnect/reconnect and OAuth callback preserve account identity | NOT RUN | — | — |
| INSTALL-01 | Safari Add to Home Screen, Android install, cached PWA update, offline open, theme toggle and home-indic | NOT RUN | — | — |
| TOOLS-01 | Pace/distance/time calculators, mileage conversion, race prediction, exported calendar, beginner shortcu | NOT RUN | — | — |
| EXTERNAL-01 | 404/unknown route, expired share, wrong external URL, broken image, stale asset, cancelled share, third- | NOT RUN | — | — |
| LOAD-01 | Cold launch/warm launch, first sign-in, saved-plan open, Runs list and run analysis | NOT RUN | — | — |
| LOAD-02 | The running cartoon animation is purposeful and compact on normal page waits, full only when appropriate | NOT RUN | — | — |
| LOAD-03 | Fast cached success should open immediately | NOT RUN | — | — |
| LOAD-04 | 401/403/409/429/500, DNS/offline, dropped connection, aborted fetch, stale async response, browser backg | NOT RUN | — | — |
| LOAD-05 | Error never appears as “no runs/no races/no plans” unless a successful empty response actually arrived | NOT RUN | — | — |
| LOAD-06 | On cancellation or retry, timers/listeners and old fetches stop, state is not overwritten, existing draf | NOT RUN | — | — |
| LOAD-07 | Measure reproducible boot, app shell, API readiness, initial content, plan fetch, run detail, sync and r | NOT RUN | — | — |
| LOAD-08 | Check reduced motion, memory/CPU usage when backgrounded, low-powered phone, enlarged text, orientation  | NOT RUN | — | — |
| VIS-01 | Compare **320, 375, 390/393, 430, 768, 1024, 1440, 1920 and 2560 CSS px** with short/tall viewport and b | NOT RUN | — | — |
| VIS-02 | No horizontal overflow, hidden bottom CTA, overlapping buttons, huge dead desktop whitespace, flicker, t | NOT RUN | — | — |
| VIS-03 | Contrast is legible on light/dark, including volt/lime text on white, Comrades/race titles, errors, disa | NOT RUN | — | — |
| VIS-04 | Every interactive control meets intended ~44px touch area, sane keyboard tab order, visible focus, label | NOT RUN | — | — |
| VIS-05 | Verify loading/brand cartoon, buttons, icons, PWA startup, font load, transitions and sticky navigation  | NOT RUN | — | — |
| VIS-06 | Screenshot representative screens and error/empty/loading states, **not just Home** | NOT RUN | — | — |
| VIS-07 | Test screen-reader basics manually where possible (VoiceOver iOS, NVDA desktop) | NOT RUN | — | — |
| VIS-08 | Browser engine matrix | NOT RUN | — | — |
| SEC-01 | Every /me, plan, run, check-in, rate, image, Strava, privacy, export/delete endpoint enforces caller own | NOT RUN | — | — |
| SEC-02 | Correct CSP, cookie/token handling, no auth secrets in service-worker cache or logs | NOT RUN | — | — |
| SEC-03 | Bad upload content type/size, malicious filenames, oversized FIT session, malformed GPX/TCX, request bod | NOT RUN | — | — |
| SEC-04 | Rate-limit/sync queue/webhook replay, concurrent updates, duplicate job, idempotent save, race catalogue | NOT RUN | — | — |
| SEC-05 | SQL migration is additive/rollback-safe, no accidental data deletion, no production DB in test suite, no | NOT RUN | — | — |
| SEC-06 | App still works with existing saved plan formats, legacy local storage, old service-worker versions, cac | NOT RUN | — | — |

## Exhaustive navigation inventory (must be discovered from the actual app)

| Screen / entry point / modal | State + user role | Expected destination and back path | Width / theme / device | Result | Evidence |
|---|---|---|---|---|---|
| **Example only:** Home → Plan → Strength → back Home | Signed-in synthetic active-plan runner | Correct Strength tab and Home preserved | 390 dark / emulated browser | NOT RUN | — |

Claude must add every direct route, menu, disclosure, screen-specific CTA, modal, error/empty/loading state, public link, email action and deep link discovered in the source and rendered app. No fixed list may be treated as complete.

## Copy/spelling review register

| Surface / exact visible message | Before | Revised text or “retain” | Why | Browser screenshot | Status |
|---|---|---|---|---|---|
| **Example only:** run loading label | — | — | — | — | NOT RUN |

## Defect ledger and retest

| Defect ID | Severity | Steps | Expected | Actual | Root cause | Fix commit / linked PR | Retest evidence |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — |

## Timing / loading audit

| Journey | Device/network | Before (measured) | After (measured) | Requests/duplicates | UI notes |
|---|---|---|---|---|---|
| First launch + login redirect | — | NOT MEASURED | NOT MEASURED | — | — |
| Open saved plan / Home | — | NOT MEASURED | NOT MEASURED | — | — |
| Runs list → analysis | — | NOT MEASURED | NOT MEASURED | — | — |
| Build Plan → movie → training | — | NOT MEASURED | NOT MEASURED | — | — |

## Cross-PR integration intelligence

- PR #315 — Entra External ID redirect/token and physical iPhone PWA acceptance. Pending claims must not be marked real-provider PASS by mocks.
- PR #316 — brand runner loading/performance visual audit. Coordinate duplicate file edits; evaluate their final merged state together, not screenshots from an earlier commit.
- PR #314 — already merged into staging: authentication-first private UI and the separate Strength Plan tab. Protect these regressions.

## Release decision

**Verdict: NO-GO until actual execution and blockers are cleared.**
P0 open: _Unknown; testing not performed._
P1 open: _Unknown; testing not performed._
Copy review complete: **No**
Navigation inventory complete: **No**
All primary user states completed: **No**
Actual full CI on this exact SHA: **Not recorded**
Live provider/physical PWA checks: **Not recorded**
Owner acceptance: **Pending**

### Claude final reporting contract

Provide a concise tested-SHA summary and link this ledger in the PR conversation after QA. Include the real pass/fail/block counts, no inferred successes, clearly flagged physical/provider limitations and an explicit GO/NO-GO. Never edit “NOT RUN” to “PASS” based on reviewing a component or seeing a related unrelated green workflow.
