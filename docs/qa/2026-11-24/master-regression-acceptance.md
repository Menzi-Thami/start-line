# Taperday master QA and regression contract

**Owner requirement — 24 November 2026:** Do not ship misspellings, awkward wording, broken journeys, visual glitches or confusing user experiences. A green build is necessary but **not sufficient** to release. This document is an executable whole-product QA contract, not a claim of completed verification.

**Scope:** React/Vite PWA, .NET API and database, Microsoft Entra External ID, Strava, plans, calendar, strength, coaching/check-ins, adaptive training, race journeys, activities, share stickers, notification/email workflows, every visible UI surface, staging and production release gates.

**Branch:** qa/comprehensive-release-regression-gate → staging. **This is a draft review and implementation PR.** Do not merge it or trigger production without explicit owner authorization.

## 0. How Claude must work: actual QA, fixes and evidence

1. Read CLAUDE.md, .claude/rules/engineering-principles.md, docs/testing.md, docs/how-we-ship.md, docs/device-validation.md, docs/integration-validation.md and this entire checklist; discover the current behavior from source and running builds, never trust stale screenshots or old PR descriptions.
2. Build an exhaustive **screen and navigation inventory** from the live app routes, menus, tabs, disclosures, dialogs, CTA buttons, deep links, error/empty states, install/login variants, API callbacks and email templates. Include hidden/conditional entry points. Each reachable surface must have a test ID and recorded result; the inventory below is a *minimum*, not permission to skip newly discovered screens.
3. Run the existing tests against an isolated disposable SQL database and mocked providers; use no production runner data. Reproduce user-facing bugs against a real browser and staging when available; distinguish **static review**, **unit**, **API integration**, **Playwright simulated browser**, **deployed staging**, **real Entra/provider**, and **physical iPhone PWA** evidence.
4. **Actually perform the journeys** by clicking through primary/secondary navigation. Screenshot each important state and independently proofread all visible UI strings. Find root causes, fix with regression tests, rerun affected journeys and the complete suite, then record failures and fixes. Not just “tests pass”.
5. Track every issue with: severity P0/P1/P2/P3, scenario ID, steps, expected/actual, environment, screen width, theme, console/network observation, screenshot/trace (with identities removed), root cause, fix commit and retest evidence. Use **PASS / FAIL / BLOCKED / NOT RUN**; only PASS with observed evidence.
6. Before marking review-ready, provide a **go/no-go release report** with exact head SHA, test command/results, CI URLs, screenshots, copy review, known limitations, outstanding owner-assisted checks, regression risks and recommendation. A reviewer must be able to reproduce every claimed result.
7. Coordinate without conflicts: **PR #315** owns Entra auth mechanics and physical iPhone login acceptance; **PR #316** owns loading animations/performance. This PR owns cross-cutting acceptance, systematic regression and copy quality. If defect lies in those branches, put precise findings on that PR; avoid rewriting the same component in competing branches. Re-test their final merged staging state.

## 1. Absolute release blockers

A production release is **NO-GO** if any of these hold:

- **P0 security/privacy/data loss:** a signed-out or wrong user sees private data; a runner's edits disappear or are attributed to another user; secrets pass into logs/screenshots; a destructive unapproved migration; payment/notification/email actions sent to unintended recipients.
- **P1 broken core journey:** login/signup impossible for a configured tenant, plan cannot be built/saved/opened, Home cannot navigate to plan, runs cannot be recorded/viewed, calendar cannot show saved workouts, strength data lost, post-race journey loops, or any required primary CTA is inaccessible.
- **P1 confusing broken experience:** blank/stuck splash, indefinite loading, dead button, uncaught exception, error masquerading as an empty list, wrong destination, double submission, false “Saved”/“Connected” success, impossible date, user data mixed across screens, unexpected modal, missing bottom navigation.
- **P1 content/visual:** an obvious user-visible typo, misspelt primary CTA or email subject, placeholder/debug/developer copy, broken English that changes meaning, unreadable text/contrast, cut-off action, overlapping text, horizontally overflowing layout, inconsistent theme or broken cartoon across primary surfaces.
- CI/frontend/backend/Playwright or secret scan fails for the **exact final commit**. A skipped or cancelled job is not a pass; passing on a previous SHA is not enough. The staging deploy/smoke check and push CI must pass for the exact staging merge commit before production.
- Core user types and phone/desktop widths have not been tested. A synthetic iPhone profile **does not count** as physical-device Entra/PWA/Instagram sharing acceptance.
- Any unverified external-provider change touching authentication or account data without explicit owner acceptance.

Severity: **P0** security or permanent data loss; **P1** blocked core functionality or embarrassing release-quality experience; **P2** important but recoverable issue; **P3** cosmetic improvement. Fix P0/P1 before merge/release. Escalate P2 with evidence; do not quietly downgrade an error to make a release look green.

## 2. Copy, spelling, grammar and editorial QA — mandatory human review AND automation

**Language:** coherent South African/British English for Taperday's interface unless a sourced race name or third-party brand uses another spelling. Prefer **kilometres, metres, programme, cancelled, colour, favourite, centre** over mixed dialects. Use the correct SI and running units, punctuation and plural forms. Preserve real race/product names (e.g., Strava, Garmin, Microsoft Entra, Taperday, Two Oceans, Comrades, FIT, GPX, TCX); don't “correct” athlete-entered text. Choose one standard across UI/email/docs for **5K, 10K, half marathon, marathon, ultra**, **km**, **min/km**, **RPE**, and race time.

**Tone:** warm, direct, runner-friendly and concise; zero patronising praise, weird metaphors, vague promises, insensitive injury/effort messages, fake AI confidence or technical jargon where plain language works. The runner always knows *what happened*, *what is next*, and *what tapping a button does*. Never say an action succeeded before confirmed server save. No random marketing tips replacing useful data.

- [ ] COPY-01 Inventory **all rendered static strings** in React JSX, source constants, translated/templated text, overlays/dialogs, toast/alerts, onboarding, validation, server error mapping, empty states, running analyses, plan advice, notification content and all email templates/subjects/preview snippets. Include labels only visible on error, offline or mobile.
- [ ] COPY-02 Run a repository spellchecker (add a **pinned, reproducible CI job** if none exists); maintain a reviewed custom dictionary for South African race names, legitimate running terms and product names. Fail on new unknown user-facing words; suppress only with explained, narrowly scoped allowlist entries.
- [ ] COPY-03 Manually review actual **rendered** copy at phone and desktop sizes, not only string literals: interpolation and plurals, missing runner names, user-provided names, dates, units, race distances and dynamic results often create awkward copy not seen by a static scanner.
- [ ] COPY-04 Search for typos, inconsistent capitalization, weird spacing, accidental double punctuation, duplicated words, broken apostrophes, raw object names (undefined/null/NaN), [object Object], leftover TODO/placeholder/lorem, debug labels, unescaped HTML/entities, clipping or truncation of essential instructions.
- [ ] COPY-05 Check singular/plural for 0, 1 and >1: “1 run”, “2 runs”, “0 runs”, “1 km”/distance formatting, “1 day” vs “days”, “week 1 of 1”; no “1 runs”.
- [ ] COPY-06 Check names with apostrophes/accents/emoji/long strings, race names with slash/hyphen, URLs, empty names, and unusual but valid characters. No XSS or broken layout; do not strip correct names.
- [ ] COPY-07 Test 5K/10K/half/marathon/ultra formatting; pace per km vs per mile; RPE 1–10 phrasing; unknown HR/pacing explicitly unknown; no misleading imported measurement as a completed workout.
- [ ] COPY-08 Test all error messages: provider delay, wrong email code, expired token, offline, 401/403, 409, 429, 500, timeout, failed save, duplicate upload, source expiry. Every message describes a real condition and useful action; no internal stack traces, token contents or generic “Something went wrong” without a recovery route when one exists.
- [ ] COPY-09 Check confirm/cancel labels correspond to their effects; destructive dialogs say what is lost; no accidental “Yes/No” ambiguity. Text on every CTA must match the destination.
- [ ] COPY-10 Proofread all email templates **in received messages** for subject, preheader, greeting, copy, link labels, mobile rendering, unsubscribe, privacy/footer and time-zone wording. Do not send to real audiences as QA.
- [ ] COPY-11 Proofread PWA install prompts, offline notices, sign-in/continue securely, race search, training plan date explanations, Strength/Run terminology, saved/unsaved states, recovery safety copy and announcement messages.
- [ ] COPY-12 Double-check **small-screen overflow**: copy is not the same as correctness if a sentence is unreadable, a link hides below the home indicator, or a button only shows half its label.
- [ ] COPY-13 Verify accessible names, alt text, aria labels, tab announcements and status readouts are correct and not repetitive, and match visible labels.
- [ ] COPY-14 Maintain a **copy-review register**: surface, before, after, spelling/style rationale and verified screenshot, including any intentionally retained wording. Do not mass-rewrite the brand voice.
- [ ] COPY-15 Add representative assertions for critical labels/CTA terms in component or browser tests. A spellchecker is only one layer; it must not blindly autocorrect code identifiers, user data or names.

## 3. Test-user state matrix — do not test only one fake “signed-in runner”

Run all relevant journeys across: S0 signed out/fresh device; S1 first signup/no plan/no Strava; S2 returning user with active plan and no runs; S3 active plan with manual runs; S4 active Strava synced; S5 disconnected/expired Strava; S6 multiple runs same day incl. strength/rest day; S7 completed race/unconfirmed result; S8 confirmed result/recovery in progress; S9 recovery ended/easy running; S10 beginner Couch-to-5K; S11 marathon/ultra/run-walk; S12 account with offline queued check-ins; S13 an older saved archived plan; S14 expired Entra token; S15 different account on same phone.

Across each material state: cold launch, warm launch, browser refresh, navigation away/back, light and dark, offline/slow/failing requests, last known good data, short/long content. Include a **fresh account with no seeded plan** so defaults are not assumed from developer fixtures.

## 4. Full navigation and first-impression regression

- [ ] NAV-01 Installed PWA / Safari / desktop cold opening: immediately visible real branding, no blank white page, broken splash, old service worker, empty-root flash or hidden main content.
- [ ] NAV-02 Signed-out journey opens clear sign-in without exposing private content, including deep links, plan builder, Home, Runs, Journey and Account; public privacy/unsubscribe remain reachable.
- [ ] NAV-03 Main nav **Home, Plan, Runs, Journey, Account** (Plan hidden only when appropriate) works on phone bottom bar and desktop rail; selected marker correct after navigation, refresh and Back.
- [ ] NAV-04 Tap every page's primary/secondary buttons, list cards, tabs, navigation links, disclosures, dialogs, empty-state CTAs, back/close, external links and icon buttons. No dead/duplicate controls or wrong routes.
- [ ] NAV-05 Deep-link to a plan, run, race, day, share link, calendar and email/unsubscribe URL. With/without sign-in and stale targets, show correct route/recovery instead of fallback surprises.
- [ ] NAV-06 Rapidly switch tabs while async responses are pending; no stuck spinner, stale data, unexpected screen reset or jumping scroll.
- [ ] NAV-07 Browser Back/Forward, iOS swipe back, reload after modal, screen orientation change, and leaving/returning from Strava/MS login all preserve expected user context.
- [ ] NAV-08 No duplicate sign-in buttons, awkward signed-in-as banners, redundant account prompts, multi-step flows that repeat earlier answers or mysteriously reset a form.
- [ ] NAV-09 Focus moves meaningfully for a *new* screen but does not jump to top after save, inline rating, undo or local refresh; browser history works.
- [ ] NAV-10 Every link opens the expected correct environment/host; no staging-to-production or localhost URLs shipped in user content.

## 5. Sign-in, account and privacy (coordinate PR #315)

- [ ] AUTH-01 Fresh email one-time passcode signup, sign-in, return to originating destination and onboarding; no missing emails without visible recovery.
- [ ] AUTH-02 Returning session (Safari, desktop, installed iPhone PWA), idle for hours, expired 24-hour SPA token, silent renewal, interactive Continue securely, cancel.
- [ ] AUTH-03 Redirect result with account but no API access token; no private data until API token verified; no duplicate redirects or endless “Checking your session”.
- [ ] AUTH-04 Wrong/expired passcode, offline sign-in, missing config, tenant mismatch, invalid scope/audience, 401/403 and server outage: fail closed, safe recovery.
- [ ] AUTH-05 Sign out of one account, sign in as another: local snapshots, saved plan, offline drafts and profile photos never leak; sign-out confirmation handles unsynced drafts.
- [ ] AUTH-06 Different Google/email identity same address does not silently merge runner data; Google CTA hidden until configured on the actual tenant.
- [ ] AUTH-07 Guest/shared/public privacy/unsubscribe access is intentional and isolated; backend runner-owned endpoints reject unauthenticated or foreign requests.
- [ ] AUTH-08 Privacy consent version, optional heart-rate consent, export/delete, email preferences, error/retry and logout all persist correctly and meet notice wording.

## 6. First-run onboarding, race discovery and plan builder

- [ ] BUILD-01 Account signup → first training goal; race or custom goal selection never stranded in a loop; Strava connection prompt optional/clearly explained and skippable.
- [ ] BUILD-02 Search South African 5K, 10K, 15K, half marathon, marathon and ultras; check city, date, distance, duplicates, sorting, accents, ambiguous names, past/closed race, missing results, manual-add fallback.
- [ ] BUILD-03 Race shortcuts, popular races, custom distance/date/name, invalid/malformed date, invalid negative/zero distance, out-of-range time, race too soon, duplicate clicks, changing answers and back.
- [ ] BUILD-04 Date selected (including Nov 9 start) is honored as the *actual* first training week; calendar matches the plan, rest vs off-plan dates not invented.
- [ ] BUILD-05 Available running days, long-run day, optional strength days, work constraints and goal finish time produce correct valid days in the resulting plan; invalid combinations explained.
- [ ] BUILD-06 Continue/Build Plan always reachable above keyboard and bottom safe area on iOS/Android in long race pickers and date popovers; validation label anchored to field.
- [ ] BUILD-07 Run-walk, new runner, fast experienced runner, C25K, sub-2 half marathon, marathon and Comrades/ultra plans produce sensible structure: easy/recovery/tempo/interval/long run, taper and race day.
- [ ] BUILD-08 The original five-scene running cartoon begins immediately on **Build Plan**; API call happens concurrently. Film does not invent progress; reduced-motion honors setting; a real failure surfaces actionably, no double loader.
- [ ] BUILD-09 Existing runner new-plan/replan flows preserve previous saved race history and avoid overwriting account/plan ownership; editing past dates doesn't silently rebuild.
- [ ] BUILD-10 Shared plan URLs import/preview consistently without cross-user data access; invalid/obsolete link gives useful message.

## 7. Home, calendar, Plan, Strength and progress

- [ ] PLAN-01 Home has one clear next workout or relevant post-race action; current plan/race countdown/weekly progress consistent with actual saved state.
- [ ] PLAN-02 Current-week list, All weeks, Calendar, Strength, Progress tabs (as present) show correct content; tab order and current selection remain consistent.
- [ ] PLAN-03 Every day opens the correct details; workouts, strength, rest and truly off-plan days distinguished; past, present, future and moved sessions all correct.
- [ ] PLAN-04 Move a run using the expected simple flow or drag-and-drop where provided: one clear confirmation, correct new date, retains recording/rating, keyboard/touch equivalent and undo.
- [ ] PLAN-05 Strength has its **separate Plan tab** (from PR #314), correct sets/reps/exercises and completion state; does not cramp run prescription/analysis or count strength as running distance.
- [ ] PLAN-06 Done/skipped/cut-short/not-done and Strava auto-match statuses represented clearly with accessible labels, and never mark a workout complete on flimsy evidence.
- [ ] PLAN-07 Training load, totals, paces, target race date, distances and units agree across Home, Plan, Calendar, Runs, weekly recap and exported calendar.
- [ ] PLAN-08 Date edge cases: month/year rollover, February 29, leap year, local time/date across time zones, Sunday/Monday boundaries, race on a public holiday if relevant, canceled/revised training.
- [ ] PLAN-09 Progress visualizations don't overflow or lie when zero runs, missing HR, sparse workouts, huge histories, unusual paces/units, or large text.
- [ ] PLAN-10 Plan edit/rebuild does not rewrite past results, erase check-ins, move historical dates, duplicate workouts or silently change strength schedule.

## 8. Runs, imported activity, analysis, ratings and adaptive training

- [ ] RUN-01 Manual run logging: tick-only, time-only, distance + duration, additional run, planned session, rest day, strength day and multiple same-date runs; save, edit, delete, reload, offline draft, retry.
- [ ] RUN-02 Validations prevent impossible/malformed distance, time, pace, negative numbers and accidental duplicate submits; invalid form remains visible and field-specific.
- [ ] RUN-03 Imported FIT/GPX/TCX, Strava backfill and sync are distinct sources; no imported measurement silently becomes permanent user-reported data; file routes not retained if product policy forbids.
- [ ] RUN-04 Sync same-day planned run exactly once; short/long run or nonmatching workout gets honest explanation rather than incorrect “complete”.
- [ ] RUN-05 Multiple activities, ambiguous match, duplicate webhook, expired cached source, deleted/deauthorized Strava, treadmill/indoor run, malformed or zero GPS: sensible source handling.
- [ ] RUN-06 Post-run click opens **run analysis first**, with relevant metrics, splits, pace profile, intervals, plan execution and photo/sticker options; hide/truncate overlong intro cards.
- [ ] RUN-07 Ratings are the agreed quick **1–10 effort + Save as planned** experience; optional pain/note/different workout only when requested, no forced forms or nag.
- [ ] RUN-08 Rating save/update/undo, different device, offline queue, race-day RPE, cut-short and skipped states sync without duplication. Adaptive preview/applied decision is truthful.
- [ ] RUN-09 A safe adaptation never erases completed sessions or overrides owner intent; significant changes require preview/approve/decline/undo, and propagate to Home/Calendar/Progress.
- [ ] RUN-10 Shoe tracker records mileage accurately and does not count an import twice; add/edit/remove shoes, source disconnect and profile changes work.
- [ ] RUN-11 Run totals and streaks: zero/missing distance, rest-day logs, multi-run dates, two activity sources, cached source expiry, historical imported runs. No bogus averages or misleading units.
- [ ] RUN-12 Error during run detail, import, sync, chart render, Save/Delete or rate: show useful retry, preserve user input, never show fake success or empty data after failure.

## 9. Finish line, Journey, recovery and achievements

- [ ] JOURNEY-01 Detect race already imported from Strava and propose the result once; verify elapsed/moving time distinction and distance tolerance; require confirmation when ambiguous.
- [ ] JOURNEY-02 Race result confirm/edit/undo, DNF, no recording/manual fallback, historic races, same-date conflicts; do not create duplicate race chapters.
- [ ] JOURNEY-03 Completed plan → finishing moment/summary → recovery options. Recovery calendar has actual training and sensible rest; never fill dates after plan end with invented rest days.
- [ ] JOURNEY-04 Train for another race is discoverable from **Home**, including when Easy running is active and after recovery ends; CTA actually opens new-race builder, not recovery loop.
- [ ] JOURNEY-05 Journey cabinet history, medals/trophies, archived chapters, achievement withdrawal, race search and date/distance are accurate and preserve owned records.
- [ ] JOURNEY-06 First-time runner with no finish and athlete with many archived races have clean empty/dense states; no unrelated international events pretending to be local South African results.

## 10. Sharing, email, notifications, account tools and install

- [ ] SHARE-01 Run sticker displays only **actual** available pace/distance/time/date, all text visible over photo/video backgrounds; original theme retained. Strava source identified correctly.
- [ ] SHARE-02 Portrait, landscape, transparent and overlay variants produce legible image exports; native share sheet, copy, PNG fallback, tap link destination, no personal info or route leakage.
- [ ] SHARE-03 Size, filename, transparency and clickable shared links are correct for Instagram/WhatsApp target; test real devices before claiming native behavior works.
- [ ] EMAIL-01 Signup/sign-in email, weekly Monday recap, inactive/no-runs message, release announcement, unsubscribe/preference email and links: accurate copy, appropriate audience, no duplicate sends, timezone SAST where advertised, mobile rendering.
- [ ] EMAIL-02 Test recipient and live campaign isolation: no real-user blast or unauthorised send during QA; preview-only delivered to consented test inbox when integration is explicitly configured.
- [ ] PUSH-01 Notification permission denied/granted, scheduled reminders, no duplicate, local vs server scheduling, tap opens correct owned content, opt-out prevents delivery.
- [ ] ACCOUNT-01 Profile/settings, photo upload large image or unsupported type, units, timezone, goal and privacy preferences save/reload without losing navigation or changing plan unexpectedly.
- [ ] ACCOUNT-02 Strava connect/disconnect/reconnect and OAuth callback preserve account identity; never display Connected before provider confirmation.
- [ ] INSTALL-01 Safari Add to Home Screen, Android install, cached PWA update, offline open, theme toggle and home-indicator safe area. Verify old SW doesn't strand app or serve account data to another runner.
- [ ] TOOLS-01 Pace/distance/time calculators, mileage conversion, race prediction, exported calendar, beginner shortcuts and saved bookmarks accept invalid/valid values and show correct units/output.
- [ ] EXTERNAL-01 404/unknown route, expired share, wrong external URL, broken image, stale asset, cancelled share, third-party outage: clear recoverable state and stable navigation.

## 11. Loading/performance and error recovery (coordinate PR #316)

- [ ] LOAD-01 Cold launch/warm launch, first sign-in, saved-plan open, Runs list and run analysis; no naked spinner, empty skeleton forever, blank white background or obsolete splash.
- [ ] LOAD-02 The running cartoon animation is purposeful and compact on normal page waits, full only when appropriate; starts promptly when real work begins; no artificial wait or extra “pause/next tip” clutter.
- [ ] LOAD-03 Fast cached success should open immediately; slow 3s/12s/network timeout show real status and retry/back; no fake percentage, false “almost done”, or success before API response.
- [ ] LOAD-04 401/403/409/429/500, DNS/offline, dropped connection, aborted fetch, stale async response, browser background/foreground, rapid tab switching all finish with correct state.
- [ ] LOAD-05 Error never appears as “no runs/no races/no plans” unless a successful empty response actually arrived.
- [ ] LOAD-06 On cancellation or retry, timers/listeners and old fetches stop, state is not overwritten, existing drafts and owned cached data preserved.
- [ ] LOAD-07 Measure reproducible boot, app shell, API readiness, initial content, plan fetch, run detail, sync and route navigation before/after improvements. Report actual timings/requests and device profiles; never manufacture performance numbers.
- [ ] LOAD-08 Check reduced motion, memory/CPU usage when backgrounded, low-powered phone, enlarged text, orientation and slow network; ensure animation improves perceived wait without worsening actual latency.

## 12. Responsive, visual, accessibility and content hierarchy

- [ ] VIS-01 Compare **320, 375, 390/393, 430, 768, 1024, 1440, 1920 and 2560 CSS px** with short/tall viewport and both light/dark. Key screens at real iOS/Android text scaling too.
- [ ] VIS-02 No horizontal overflow, hidden bottom CTA, overlapping buttons, huge dead desktop whitespace, flicker, text clipping, meaningless scroll, offscreen dialog or stuck modal.
- [ ] VIS-03 Contrast is legible on light/dark, including volt/lime text on white, Comrades/race titles, errors, disabled controls, placeholders and charts. Check WCAG 2.2 AA where applicable.
- [ ] VIS-04 Every interactive control meets intended ~44px touch area, sane keyboard tab order, visible focus, labelled form field/feedback, accessible expandable disclosure, readable accessible status and keyboard drag fallback.
- [ ] VIS-05 Verify loading/brand cartoon, buttons, icons, PWA startup, font load, transitions and sticky navigation on browser/standalone without stutter; prefers-reduced-motion stops nonessential motion.
- [ ] VIS-06 Screenshot representative screens and error/empty/loading states, **not just Home**. Visually inspect before/after changes rather than accepting automated screenshot generation as a pass.
- [ ] VIS-07 Test screen-reader basics manually where possible (VoiceOver iOS, NVDA desktop): no duplicate announcements, status understandable, chart table fallback, error focus actionable.
- [ ] VIS-08 Browser engine matrix: desktop Chromium and Firefox, WebKit iPhone/iPad emulations, Android Chromium, physical iPhone Safari + installed PWA owner-assisted. Label physical-vs-emulated accurately.

## 13. Security, API/data integrity and compatibility

- [ ] SEC-01 Every /me, plan, run, check-in, rate, image, Strava, privacy, export/delete endpoint enforces caller ownership; insecure direct-object-reference and anonymous POST tests with isolated identities.
- [ ] SEC-02 Correct CSP, cookie/token handling, no auth secrets in service-worker cache or logs; session expired state does not leak cached private content.
- [ ] SEC-03 Bad upload content type/size, malicious filenames, oversized FIT session, malformed GPX/TCX, request body limit and content sniffer cannot break app or persist unsafe data.
- [ ] SEC-04 Rate-limit/sync queue/webhook replay, concurrent updates, duplicate job, idempotent save, race catalogue worker retries and rejected writes recover honestly.
- [ ] SEC-05 SQL migration is additive/rollback-safe, no accidental data deletion, no production DB in test suite, no external sender/Strava calls against a real runner.
- [ ] SEC-06 App still works with existing saved plan formats, legacy local storage, old service-worker versions, cached web assets and backwards-compatible API schema.

## 14. Automated pipeline and artifact requirements

Run the repository's prescribed checks from docs/testing.md on an isolated SQL database; for focused client checks use the actual scripts in client/package.json:

- npm ci; npm run lint; npm run typecheck; npm test; npm run build; npm run test:coverage (report coverage and gaps honestly).
- npm run e2e and npm run e2e:connections / e2e:mobile for the configured browser profiles. Run at least one **full unsharded** suite locally/CI with non-default UX state fixtures.
- .NET solution build/format/test, EF migrations model consistency, API authorization/ownership/integration tests and disposable local SQL.
- Security audit (gitleaks/secret scan), high-severity dependency audit and meaningful accessibility scans.
- Add durable **copy spellcheck** to CI, with reviewed dictionary; add **user-journey navigation inventory** and visual screenshot artifacts. No introducing expensive/flaky external services without reason.
- Use snapshot fixtures representative of real screens, not only mocks that return happy-path content. Test long copy, zero, empty, error, retry and stale/cache data.
- **Do not rewrite or skip tests to force green.** If an older assertion is invalid because UX intentionally changed, explain new behavior and replace with a stronger end-to-end assertion. Fix real regressions, including dark/light and responsive.
- Record GitHub check and secret scan URLs for final head SHA, exact staging deploy and push CI URLs, screenshot paths, list of failures and resolved commits. An old green check on a different SHA is NOT acceptance.

## 15. Minimum scenario-pair combinations (regression depth)

Do not stop at one test per feature; exercise these combined sequences:

1. Fresh signup → race search → builder → plan → Strength → Home → switch theme → reinstall PWA → re-open same plan.
2. Returning runner → email code/expired auth → offline after login → cached plan → reconnect → rate run → save exactly once.
3. Planned Easy run → move to tomorrow → Strava activity arrives → match correctly → run analysis → log effort → calendar/week totals; no double-count.
4. Strength-only day → log exercise sets → manual additional run → save/reload → running total includes run only → strength remains visible.
5. Marathon race day → Strava import → ambiguous elapsed/moving time → confirm → race recap → recovery → Train for another race → actual builder.
6. Custom South African race not in catalogue → manual fallback → correct training start → dark/light phone CTA → regenerate → calendar date correctness.
7. Two different users on same iPhone → sign out with unsynced data confirmation → sign in new account → no previous account details → sign back in to original.
8. Upload FIT/GPX/TCX → duplicate upload → expired source → saved manual check-in retained → history and totals correct.
9. Error 500 during plan load → useful error while preserving last known good content → retry → restored plan → back/navigation unaffected.
10. Delayed account load with cold API → runner animation → timeout → retry/back → no blank screen or leaked auth data.
11. Release update with old SW cache → install PWA → open → new shell after update → no broken mixed versions.
12. Weekly recap rendered to opted-in test inbox → inspect link recipients, CTA, week totals, schedule and unsubscribe with actual browser.

## 16. Evidence template and exit criteria

Create **docs/qa/2026-11-24/master-qa-results.md** on this PR branch with the following, filling facts as testing is performed. Do not invent passes or claim unrun tests passed.

| Column | Required |
|---|---|
| ID | QA scenario ID (COPY-01, NAV-03, RUN-07, etc.) |
| State / platform | S0–S15, OS/browser, installed PWA vs browser, CSS width, light/dark |
| Evidence level | static / unit / integration / emulated browser / staging / real provider / physical device |
| Result | PASS / FAIL / BLOCKED / NOT RUN |
| Observed behavior | Brief factual outcome, including copy as actually rendered |
| Proof | Screenshots/traces/test log and tested head SHA |
| Issue | Reproduction + severity + root cause + fix commit + retest |
| Owner | Claude automated or owner-assisted external test |

Minimum sign-off: every primary screen and reachable navigation destination inventoried; every major user state crossed with positive/negative/error/recovery; all literal and dynamic visible copy reviewed; all release blockers cleared; full CI and secret scan green for exact final SHA; staging deployment and push CI green; physical iPhone and live Entra status truthfully marked; final release recommendation **GO** or **NO-GO** with explicit residual risks.

**No production merge, production workflow dispatch, production seed/reset, live-user notification, real Strava mutation or tenant policy change is authorized by this QA PR.**
