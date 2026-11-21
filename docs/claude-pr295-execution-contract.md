# PR #295 — Authoritative Claude Code implementation contract

**Decision date:** 21 November 2026. **PR base:** staging. **Working branch:** fix/adaptive-coaching-no-chat. **Owner decision:** keep draft until explicit approval. **Status:** handover, not an implementation-complete claim.

This document replaces every older/inconsistent PR #295 instruction in this repository. PR #294, docs/ai-coach-mcp.md and docs/invisible-adaptive-training.md are background ONLY where consistent with this contract. Read CLAUDE.md, .claude/rules/engineering-principles.md, docs/testing.md, docs/strava-sync.md, docs/flexible-training-week.md, docs/run-logging.md and docs/how-we-ship.md before editing. When source details differ from this brief, reconcile the current code with these requirements; never silently guess about implementation status.

## FINAL UX ACCEPTANCE GATE — CLARITY OVER FEATURES

**The owner explicitly requires that Taperday remain clean, easy and effortless. Feature-complete but cluttered is a FAIL.** Preserve existing colours, running cartoon, loading animations, dark/light, bottom navigation and all form factors. No additional AI chat, new tabs, excessive Home cards or new mandatory dialogs.

**Normal journey:** auto-matched run visible without touch → View run analysis remains prominent → optionally rate effort with **2 taps** (1–10 choice then Save as planned) inline, no manual upload or hidden extra field → compact "Rated X/10 · As planned · Edit" replaces controls. Only reveal "Cut short / Easy instead / Skipped", pain, measurements or note if requested. No assumed Strava measurements in stored check-ins.

**Adaptive UI:** NoChange is silent; safe small future adjustment gets a quiet summary+Undo; substantial proposal gets **one** clear before/after card with Review change / Keep plan. Never stack advice, nag after decline, jump page/focus on save or block analysis when rating skipped. Touch/keyboard/screen readers must all work at 320/390px and desktop in light/dark.

**Required UX01–UX10 tests:** Home hierarchy, no-touch Strava auto-complete, exactly two rating taps, analysis-first detail, skip/no nag, concise editable saved state, restrained single adaptation card, complete navigation/focus/scroll, light/dark responsive accessibility, and lightweight failure/offline recovery. Record PASS/FAIL/NOT VERIFIED with genuine screenshots. See the precise matrix in [PR #295's owner UX comment](https://github.com/Menzi-Thami/start-line/pull/295#issuecomment-7059233299). If clutter, extra taps, lost focus, poor contrast or broken navigation remain, **fix before closing staging QA**. Staging merge is authorised after checks; production release is not.

## LATEST OWNER AUTHORISATION — MERGE TO STAGING AND EXECUTE FULL QA (21 NOVEMBER 2026)

**THIS OVERRIDES EVERY EARLIER "DO NOT MERGE", "LEAVE DRAFT", AND "STOP FOR OWNER APPROVAL" IN THIS FILE, THE PR DESCRIPTION, AND PRIOR COMMENTS — BUT ONLY FOR MERGE INTO STAGING.** The owner explicitly authorised Claude to **finish implementation, merge PR #295 into `staging` when the checks are green, deploy staging using the existing pipeline, run rigorous QA across the ENTIRE Taperday application and all navigation, fix defects and retest.** Do not require the owner's separate approval for the staging merge or staging QA. **PRODUCTION (`main`, `3 - Release to production`, production config, prod DB, live services) IS NOT authorised.** No merges to `main` or prod deployment without a new explicit owner request.

### Mandatory merge and QA sequence

1. **Work on PR #295 only until code is finished:** implement all requirements below; port relevant PR #296 fixes without merging PR #296 wholesale. Retire old conversational AI, preserve deterministic adjustments, build the seamless runner-reported RPE flow and real adaptive proposal logic, add complete automated tests.
2. **Pass gates before merge:** run all repository-prescribed checks (`scripts/check.sh`, .NET build/tests with isolated local disposable SQL, client lint/typecheck/Vitest, Playwright, secret scan) and fix failures. Confirm GitHub **1 - Checks** and **1 - Secret scan** pass on the exact final PR head SHA. No bypass, no skipping failures, no fake green.
3. **Merge completed PR #295 into `staging` using the standard GitHub merge path** once gates are green. The owner has explicitly authorised this staging merge. Do not merge #296 just because it also passes; its applicable fixes should be integrated/tested in #295. Record the merge commit SHA.
4. **Verify `2 - Deploy staging` finishes successfully for that exact merge SHA**, then QA the deployed staging URL documented in `docs/how-we-ship.md`. Use approved synthetic staging test users; do not touch production data, real Strava credentials, user secrets, or production push/email/SQL.
5. **Full application exploratory + automated regression, not a "happy path" smoke test:** walk each navigation item and every major cross-page journey as a *real user*, on at least **320px phone, 390px phone and desktop**, both dark and light, keyboard/reduced-motion; check **signed-out, fresh signed-in, returning athlete, disconnected Strava, active plan, no plan, expired/archived/finished plan, post-race/recovery plan, novice Couch-to-5K, marathon/ultra, run-walk** states. Include:
   - Landing → sign-in/email-code affordances → callback/session persistence → onboarding → Strava connect/disconnect affordances (provider mocks; staging has no live Strava settings) → Home.
   - Home cards and top/bottom navigation → Plan → calendar/week/day detail → move/drag workout → new planned date → rating → Run analysis → Progress/story → Account/settings → back navigation, deep links, browser refresh/back, and correct selected-tab state.
   - Plan builder: race search/top races, manual race, start date, available days/strength, build animation and plan creation; ensure no hidden Continue button or incorrect first workout date; 5K beginner and ultra/race-week plan cases.
   - Strava simulated webhook, catch-up, late/duplicate run, short/long/treadmill/timed workout, multiple runs same day, match conflict, no accidental permanent metrics; no manual upload required to show current completion.
   - RPE rating 1–10 two-tap, self-authored save/edit/delete, skipped/cut-short/easy instead, pain, offline queued save, second-device conflict, source expiry/revoke, truthful Progress/recap, no double counting, no full-screen nag.
   - Adaptation after RPE and changed schedule, preview/approve/decline/undo, consistent Home/Calendar/ICS/Progress/weekly recap, no lost race/taper/run-walk history and no jump-to-top after save/undo.
   - Race completion → race recognition/recovery journey → "Train for another race" visible on Home where appropriate; no endless recovery loop or wrong destination. Verify earlier known post-race Home/regeneration navigation gaps.
   - Theme toggle on PWA and browser, responsive desktop whitespace, readable light-mode contrast, running cartoon intro/loading visibility, bottom navigation, accessibility semantics/labels/focus/zoom.
   - **Unhappy paths:** expired/invalid sign-in code, auth 401/403 and logout, unavailable API/slow loading/retry, partial plan data, invalid and unavailable race, bad network/offline/online resume, stale 409 plan adjustments, duplicate click/save, empty states, provider disconnect, cached activity expiry, webhook replay, storage full/denied, malformed inputs, timezone/date boundary, refresh during a pending save, quick navigation during fetch, deleted plans/account isolation. No crashes, blank infinite spinners, stuck splash, incorrect totals, lost edits or cross-user data.
   - Test any remaining primary menus/links/pages, including labels and navigation routes **not explicitly enumerated**; catalogue them in the final navigation matrix so there are no untested navigational surfaces.
6. **Fix defects, don't merely file them:** for each failing journey, make a minimal tested fix on an appropriate new branch/PR targeting staging after #295 merged, pass gates, merge to staging (authorised for QA fixes), await deploy and rerun the failed path plus the neighbouring/related flows. Do not silently change unrelated product scope or merge to main. If external provider validation cannot be performed on staging, label it **NOT VERIFIED**, test deterministic mock contracts instead, and explain precisely why.
7. **Evidence required:** actual staging screenshots for **dark/light 320px and desktop**, screenshots/video for rating and adaptation, a table of navigation destinations tested, **positive, negative, error, recovery and state-transition scenarios**, R01–R24 and Q296-01–Q296-05 PASS/FAIL/NOT VERIFIED, exact GitHub CI/deploy run links + SHAs, defects found/resolved/retested, remaining risk and live-provider limitations, final staging URL and commit. QA is not complete after one successful login/plan/build demonstration.

**Do NOT claim "tested staging" based only on code review or CI.** Distinguish isolated local tests, browser fixture E2E, deployed staging UI exploration, and real external provider delivery. If browser automation or test access is blocked, say exactly what was not run and do not label it passed.

**Important precedence:** Staging merge/QA is NOW authorised and expected; past text saying draft-only/no-merge is SUPERSEDED for staging. Production remains explicitly held.

## PR #296 review — reconcile this QA work before implementation (21 November 2026)

**Related PR:** https://github.com/Menzi-Thami/start-line/pull/296 — `fix/coach-staging-qa` → `staging`. **Current status:** OPEN, NOT MERGED; GitHub checks and secret scan are green at `eb062af8956e009573b60075c8b8da5c2092327a`. It has **not** changed staging. Its staging QA was performed with rules-only/no AI key; reported results are useful as regression cases but do not approve the old chatbot. **Do not merge PR #296 into staging, PR #295, or main wholesale.** The two PRs both change `PlanView.tsx`, `PlanTabs.test.tsx`, and coach-facing files, so naive merging will conflict or reintroduce chat.

**What to do with each of PR #296's three fixes:**

| Fix and actual changed paths | Disposition for PR #295 | Required QA |
|---|---|---|
| **Apply/Undo steals focus and scrolls to top:** `client/src/features/plan/PlanView.tsx` changes the focus `useEffect` dependency from `plan` to the existing stable `planKey`; `client/src/features/plan/PlanTabs.test.tsx` adds a rerender/focus regression. | **MUST PORT into PR #295** on top of the already removed AiCoachPanel. The fix applies to any in-place rating, training-change, undo, replan or weekly adaptation—not just AI. Make sure `planKey` actually distinguishes changing plans but not in-place session mutation. Do not overwrite PR #295's existing no-chat test. | Title gets focus when a *different plan* opens; focus remains on the clicked control/status after a rating, apply/undo or in-place plan refresh, including mobile. This is necessary to make the "two-tap rating" seamless. |
| **Safe quarter-km value displayed rounded up:** `client/src/features/plan/ai-coach-model.ts` adds `exactDistance`, and `AiCoachPanel.tsx` uses it. Example 14.25 km wrongly labelled "14.3 km", making a safe-limit suggestion inaccurate. | **PRESERVE THE PRECISION REGRESSION, NOT THE CHAT UI.** If the deterministic plan adjustment preview/auto-recovery card renders proposed values, use a neutral shared `exactDistance` formatter (not `AiCoachPanel`) so quarter-kilometre limits remain exact. Keep unit conversions and accessible before/after labels. If that preview does not display such values, keep a small general formatter regression test and state why. Do not import or restore `AiCoachPanel` to access the helper. | 14.25 km limit displays "14.25 km" and never as an actionable "14.3 km"; user's selected limit is passed exactly, tested in km and miles. |
| **"Make Sunday 20 km" wrongly selects tomorrow's rest day:** `src/StartLine.Application/Features/AiCoach/{CoachIntent.cs,AskCoach.cs}` + `RulesIntentReaderTests.cs` change named weekday parsing to choose a date that actually has a session. | **DO NOT PORT INTO RUNNER UI** because `ai/ask`, `RulesIntentReader` and free-text AI coach are to be retired by PR #295. The actual **underlying product intent** is important: moves/adjustments must target a real session by stable date/session key, not guess from a natural-language weekday or default to a rest day. Only retain `RulesIntentReader` if a separate, **still supported non-chat caller** demonstrably requires it; prove such usage before preserving parser code. Otherwise let Claude remove it with the rest of chat features. | Moving/adjusting Sunday long run after a week-before plan start correctly selects the existing session or rejects invalid target. Today/tomorrow still follow runner-local calendar date; no accidental move of a rest or race day. Test through structured calendar/adjustment UI, not an "Ask the coach" textbox. |

**Additional QA observations from PR #296:** Its notes report rules-only staging testing of 35-minute Tuesday session adjustment, a 12→20 km Sunday long-run refusal with safe limit 14.25 km, a pace preview around 7:40/km, and Apply/Undo returning to original total. **Retain these as deterministic preview/restore acceptance tests** against `SessionAdjuster`, `LifeHappens` and final revised UI; **do not preserve conversational chat merely to pass those existing tests**. The old `AiCoachPanel.test.tsx` and `client/e2e/ai-coach.spec.ts` should be replaced with deterministic preview/undo/no-chat regression coverage.

**Cherry-pick policy:** PR #296 currently contains 9 changed files. **Do not merge or cherry-pick its whole commit**, which also changes `AiCoachPanel`, `AskCoach`, `CoachIntent` and retired AI documentation. Port the focus regression into PR #295 explicitly (manual file edit or narrow hunks), carry forward safe-distance fidelity into the retained deterministic UI, test both, and link PR #296 in the PR #295 completion report. If PR #296 becomes redundant after those changes, **leave it open and tell the owner**; do not close/merge it without the owner's instruction.

**Updated mandatory acceptance IDs:**
- **Q296-01**: Opening a different plan focuses its heading; same-plan check-in, rating save, plan adjustment, undo and weekly re-evaluation preserve focus/scroll on the control/result.
- **Q296-02**: Session adjustment at 14.25 km stays exactly 14.25 km in preview, saved change and UI labels; never rounded to a misleading 14.3 km.
- **Q296-03**: Structured calendar interactions never pick a rest day when a runner meant a Sunday long run, including a plan that begins in the following week.
- **Q296-04**: Old chat endpoints/components/parser do not reappear after reconciling the fixes. No paid model requests or free-text coach button in either theme.
- **Q296-05**: Baseline unchanged staging remains deploy-safe; both PR heads are understood, and consolidated PR #295 CI plus the complete R01–R24 suite pass.

## 0. Non-negotiable outcome

**Taperday should feel like this:** Connect Strava once. Record the run on a watch or phone. Taperday automatically recognises the session and shows current progress. A runner may then **voluntarily** rate *their own* completed workout in about two deliberate taps (pick effort, Save as planned). That rating, completion declaration and optional pain/alternative-session answer are Taperday-owned lasting coaching data. The app evaluates appropriate future training using existing deterministic coaching and plan-safety rules. No AI chat, no repetitive form, no daily upload, no request for Garmin/Polar/Apple or other new APIs.

**Two different truths:** A Strava-matched run is a *transient automatic display completion*, not a permanent user-declared check-in. The explicit runner-authored tick and effort response is a *durable self-report*, not a permanent copy of Strava distance, time, pace or heart rate. Store only what the runner independently selected/typed. Keep these sources separated through sync, offline storage, API, progress totals, coaching and account export.

**Rights boundary:** This PR assumes Strava refused any special permission to use its API-derived performance measurements for durable future-plan decisions. Do NOT circumvent restrictions by hiding calculations, lengthening the cache, deriving a permanent score, prepopulating a supposedly manual form, scraping, or sending Strava data to any LLM/MCP. The existing 10-athlete Strava connection is still the primary automatic CURRENT activity feed. No other third-party API is available. Do not add a native app, ask for credentials, research replacement providers or force users to upload the same run to gain today's completion.

**Change-control:** NO merge to staging/main, no staging/prod deploy, no setting changes or feature enabling, no secrets, no migration against staging/prod. Keep PR #295 DRAFT until owner approves. Do not auto-merge on passing CI.

## 1. Checked staging baseline (code and GitHub Actions; not a live browser acceptance test)

- staging SHA inspected: 6b1ccb8c42147459a3a39c91ff1fa2feaf99486f. GitHub Actions "2 - Deploy staging" and "1 - Checks" both concluded SUCCESS for that SHA on 20 Nov 2026. The documented staging address is https://icy-grass-0c32e680f-staging.eastus2.1.azurestaticapps.net. Interactive end-to-end behaviour on that deployed site is **NOT** verified here; staging has no real Strava/provider credentials according to docs/how-we-ship.md.
- PR #294 has already MERGED to staging. In staging/client/src/app/App.tsx, an aiCoach prop is passed when VITE_AI_COACH_ENABLED=true; staging/client/src/features/plan/PlanView.tsx can render AiCoachPanel. The old panel includes an "Ask the coach" textbox and a "Change a run" mode. Its existence is NOT owner approval to keep any chat.
- staging/src/StartLine.API/Controllers/AiCoachController.cs exposes GET /api/v1/me/ai/status, PUT /api/v1/me/ai/consent and POST /api/v1/me/plans/{id}/ai/ask, plus deterministic POST session-adjustment/preview and /apply. They are guarded by AiCoach:Enabled, default false. Backend remains in staging even after frontend is hidden.
- staging/client/src/features/coaching/CheckInCard.tsx ALREADY has 1–10 effort controls, status options, pain options and a "Done, as planned" action. **Critical UX gap:** the effort controls are hidden behind a "How it felt, pain and other details" disclosure, after run source, actual type, distance and duration fields. In the primary flow, this is too much friction.
- staging/src/StartLine.Domain/Coaching/SessionCheckIn.cs already stores Status, Effort 1–10, Pain, PainArea, optional independently entered DistanceKm/Duration, Date/SessionType, Version and PrescribedKm (NOT actual measured km). Staging/src/StartLine.Application/Features/CheckIns/CheckIns.cs persists it and validates independent metrics.
- staging/client/src/features/coaching/useCheckIns.ts already handles authenticated, per-plan saved entries, offline outbox, retries and cross-device version conflict. Reuse it.
- staging/src/StartLine.Domain/Coaching/WeeklyCoach.cs and src/StartLine.Application/Features/Coaching/Coaching.cs already use self-reported effort/pain/status to hold, ease, cut back or suggest training progression. Existing ExpectedEffort.For values: easy 2–4, recovery 2–3, long run 3–5, tempo 6–7 and intervals 7–8. Existing rules require sufficient evidence and protect taper.
- staging/src/StartLine.Domain/Coaching/SyncedCompletions.cs and GET /api/v1/me/plans/{id}/strava-completions derive current matching ON READ. They do not persist a check-in. Staging/client/src/features/plan/DaySummary.tsx already renders StravaCompletion and CheckInCard, and offers run analysis before details on dedicated day page. Use this existing path rather than another tab.
- PR #295 already removes AiCoachPanel prop and visible plan rendering in its branch and adds a basic no-chat regression test. **That is only a partial corrective slice**, not complete AI backend retirement or the new rating/adaptation UX.

### Concrete code maps

Front end:
- client/src/app/App.tsx — plan props, sync, check-in hooks and invalidation.
- client/src/features/coaching/CheckInCard.tsx — IMPLEMENT compact post-run rating; keep existing full detail form as advanced fallback.
- client/src/features/coaching/check-in-copy.ts — reuse 1–10 effort descriptions, expected effort, statuses and pain vocabulary. Do not invent a conflicting 3-choice mapping.
- client/src/features/coaching/useCheckIns.ts and check-in-outbox.ts — durable runner-authored save and offline recovery.
- client/src/features/coaching/StravaCompletion.tsx and useSyncedCompletions.ts — current transient completion.
- client/src/features/plan/DaySummary.tsx, PlanView.tsx, DayPreview.tsx — show rating at the right moment; keep analysis-first details and navigation.
- client/src/features/coaching/PlanAdjustment.tsx and client/src/features/plan/MoveRunDialog.tsx — existing change review and move patterns.
Back end:
- src/StartLine.Domain/Coaching/{SessionCheckIn.cs,CoachEvidence.cs,WeeklyCoach.cs,SyncedCompletions.cs} — permitted evidence and coaching rules.
- src/StartLine.Application/Features/{CheckIns/CheckIns.cs,Coaching/Coaching.cs,Coaching/RemainingWeek.cs,Coaching/LifeHappens.cs,AiCoach/SessionAdjustments.cs,AiCoach/TrainingEvidence.cs} — preserve behaviour, separate reusable rules from chat.
- src/StartLine.Domain/Plans/{LifeHappens.cs,RemainingWeek.cs,SessionAdjustment.cs,SavedPlan.cs,TrainingPlanGenerator.cs} — preserve safeguards and stable generators.
- src/StartLine.API/Controllers/{MyPlansController.cs,MyCheckInsController.cs,AiCoachController.cs} — existing API endpoints and auth boundaries.

## 2. EXACT runner experience — implement this, not a new design direction

### State A: Strava run matched, no saved check-in

- Home/Plan/Calendar still show "Completed via Strava" without any click or stored check-in. The runner can still open run analysis immediately, and it remains the first prominent action on the dedicated day view.
- Directly beneath the synced/completed workout context (or adjacent to the run analysis summary), show one compact prompt: **"How hard did it feel?"** and **ten numbered RPE options 1–10** with accessible word descriptions. Use five evenly sized choices per row on ~320px phones, or a horizontally scrollable, keyboard-usable set if existing responsive design warrants it. Selected number has a clear focus/selected state, not colour alone.
- Under the scale, show "Expected for [workout type]: [range]/10" using existing EFFORT_WORDS and EXPECTED_EFFORT (or the same server rule). **No preselected RPE.**
- Default displayed status is "**As planned**" as an EXPLICIT declaration the user confirms when saving, not an inference from Strava. The primary button, disabled until the user chooses RPE, is "**Save as planned**". The two deliberate actions are: choose one RPE number, then tap Save as planned. Provide secondary "**Did something different?**" to select "Cut short", "Easy instead", or "Skipped". The latter needs no RPE; CutShort and SwappedForEasy require it, consistent with existing domain validation.
- Optional "**Pain or more details**" reveals No pain (default unless independently selected), Niggle, Changed how I ran, body location where relevant, optional runner-authored distance/duration and note. The default compact interaction has **no source dropdown, no distance/time/pace input, no file-upload step and no expanded disclosure**.
- The Save request MUST use existing runner-scoped check-in API, never directly mark a Strava activity "permanent". When submitted in this compact context: ActivityId=null, DistanceKm=null, Duration=null, Note=null unless independently entered, Effort=<user selected 1–10>, Status=<user explicitly confirmed value>, Pain=<user input or None>. Never copy, infer, autopopulate or convert cached Strava measurements into stored answers.
- A saved "As planned" with no actual distance can use the existing **estimated prescribed mileage** convention for training adherence, but the UI must never label that estimate "GPS measured", "actual 8 km", or "uploaded 8 km". The explicit runner statement "I completed the workout as planned" is training-completion evidence; not exact performance evidence. If they choose "Cut short", don't pretend they completed full planned kilometres. The runner may independently fill an actual distance for a truly measured long-term record.
- After save, instantly replace the prompt with "**Rated 4/10 · As planned**" (using their actual answer), an accessible "**Edit feedback**" action and nonintrusive status "Saved" or "Saved on this device, syncing". No separate success dialog, no route change and no blocking spinner on run analysis. Refresh relevant self-report-aware Progress/weekly coach state. No double counted run.
- The card must be dismissible without losing Strava's automatic completion. Do NOT persist a declined rating as fake training data. Do not push daily reminders that nag for RPE. Once saved, don't present a fresh empty prompt for the same check-in. Existing saved feedback can be edited/removed, with the same optimistic concurrency and account isolation.
- If no Strava is connected or no confident match exists, a runner can still tick/rate a manually confirmed planned run using the same compact component and existing logging flow. If two activities are ambiguous, do not invent a match; a user can rate the plan session based on their own recollection.

### State B: runner answered / edit / offline

- The source of truth for long-term coaching is the runner's explicit response, not whether the Strava cache still exists. Ratings survive Strava disconnect and expiry; no imported metric survives in the saved answer. Existing offline outbox may queue answers when offline; show a truthful pending state until acknowledged. A second-device edit must never be silently overwritten by a stale queued update. Same session/day is updated in place, never duplicated.
- A saved check-in may override the transient completion indicator. Preserve separate tracking of *what was prescribed*, *what Strava currently displays*, and *what the runner says they did*. Keep Strength and Race non-checkable as the existing domain requires. After an explicit Skipped with a synced activity, show an unintrusive conflict explanation, not an automatic correction.
- Race result/post-race journeys are outside this feature. Do not modify archived or completed plans, past training prescriptions, run-analysis page hierarchy or the running cartoon animation.

## 3. Staging AI code — exact retain / retire / relocate decision

**RETAIN (deterministic, non-AI):**
- Domain SessionAdjuster and its time/distance/pace safety constraints and tests.
- Application SessionAdjustments preview/apply/fingerprint, plan version checks and RestoreSessions functionality; move those routes to a normal runner-scoped controller / independent AdaptiveTraining feature gate if the old AiCoach:Enabled coupling prevents them working without chat.
- Existing LifeHappens move/swap, RemainingWeek, WeeklyCoach, WeeklyReview, Readiness, PlanBuilder, generator constraints and data-provenance-filtered check-in evidence. Reuse these instead of starting another coaching algorithm. Rename the AiCoach namespace for reusable deterministic services if helpful, but ensure full code/test/client migration.

**RETIRE / KEEP DISABLED (conversational AI):**
- Remove the plan's AiCoachPanel rendering (already done in PR branch). Remove unused client chat UI and api.me.askAiCoach/status/consent calls, and no chatbot toggle, text input or model-choice settings anywhere.
- Retire/remove runner-facing GET /ai/status, PUT /ai/consent and POST /plans/{id}/ai/ask as supported user actions. Do not merely hide them with CSS if a backend route can still call a provider. Remove/disable the old AskCoach dispatcher and paid OpenAiCoachModel registrations if unused. Preserve existing data/history; do not drop SQL tables merely to clean code.
- Keep AiCoach:Enabled, AiCoach:McpEnabled, keys and VITE_AI_COACH_ENABLED OFF. No model invocation in sync, rating, plan load, or adaptation. Do not expose read-only MCP endpoints in the runner experience.
- **Regression expectation**: the previous browser test client/e2e/ai-coach.spec.ts and backend tests/StartLine.Integration.Tests/AiCoachTests.cs contain chat assertions that should be replaced with negative no-chat/security assertions plus focused deterministic session-adjustment tests. Do not simply delete test coverage to make CI pass. If existing UI/endpoint is safely retired but DB schema remains, document why.

## 4. Adaptive decisions — use the runner's RPE, not watch HR

**Input (persistent):** current saved plan+generator version, planned session type/date/distance, runner's explicit Done/CutShort/SwappedForEasy/Skipped, RPE 1–10 if supplied, optional pain/body area and readiness, independent actual measurements ONLY when separately supplied, previous accepted coaching decisions and runner-created schedule changes. Never include Strava-derived values as persisted evidence or in its fingerprint. If no RPE, do not fabricate one. No HR is needed.

**Rules:** evaluate the runner's feedback relative to the workout's expected effort, never raw RPE in isolation:
- Easy expected RPE 2–4; tempo 6–7; intervals 7–8; long run 3–5 (same as existing server and client). A tempo at 7 is normal; an easy run at 7 is more concerning.
- Existing WeeklyCoach requires at least 50% known workouts to judge the week. Two runs with RPE at least 2 above expected upper bound is a strain signal. Pain that changed running takes precedence over positive training signals. Repeated missed/shortened runner-confirmed sessions trigger conservative hold/easing, never make-up kilometres.
- Full-volume and positive response must be grounded in actual independently reported kilometres **or explicitly as-planned self-confirmation**, labelled as estimated adherence rather than GPS-measured volume. For a runner with only a transient Strava completion (no own answer), don't store a durable Done or use its metrics to increase volume. Don't infer "skipped" from no webhook.
- Only the existing guarded WeeklyCoach/WeeklyReview thresholds can step up training. A single easy-feeling run never advances paces. Protect existing 3-strong-week checks and readiness/verified evidence gates. No faster precise race goal or fitness estimate from subjective RPE alone; require an independently entered benchmark/time trial/eligible performance input. No simultaneous volume + pace + intensity escalation. No aggressive changes in taper, race week, during illness/injury or with high pain.
- After a self-report save/delete/edit, automatically evaluate whether a meaningful proposal exists; don't wait for the runner to navigate to the Sunday weekly review to learn about an acute recovery issue. No full-week recalculation that silently rewrites the entire training calendar on each app read. No LLM.
- **Classification:** NoChange (silent); WarningOnly (e.g. just moved long run into recovery conflict); SafeAutomaticCorrection (ONLY proven conservative future easy/rest change, bounded and undoable); NeedsApproval (any substantial volume, pace, intensity, interval/tempo, long-run or multi-week change, with before/after and Keep plan/Review change/Undo). If automatic safety cannot be demonstrated, choose approval.
- Preserve runner's moved dates and explicit choices; never change a past or completed workout, race day, archived plan, cutback/taper or structured run/walk silently. Do not duplicate sessions or change strength in unexpected ways.
- Use existing source-scoped, stale-token preview/apply and plan version/concurrency mechanisms from Coaching/LifeHappens/RemainingWeek/SessionAdjustments. Every suggestion tied to a runner, plan version, eligible evidence fingerprint and runner-local date. If stale after check-in/move/midnight or second device update, reject 409 and recompute. Accept/decline/undo are idempotent and durable; declining same fingerprint does not nag again.
- Where a new endpoint is required, prefer narrow read-only GET /api/v1/me/plans/{id}/adaptation to retrieve pending proposal summary, with POST /.../apply, /.../decline and /.../undo only if no existing safe endpoint already serves it. Define typed before/after DTO including date/type/distance/duration/steps/pace zones, reason codes and approval status. Never trust client-sent revised sessions; re-evaluate on write. No endpoint should require an AI key.

## 5. Required implementation slices (complete code + tests, not just documentation)

### A. Compact rating flow — highest priority
- Introduce a reusable inline PostRunRating view or "compact" mode within CheckInCard, prefer smallest change to avoid duplicate state logic. Put it after run analysis/status in DaySummary (the main dedicated day experience) and make it reachable from the Home recent completed workout; use existing navigation rather than a new route. Keep normal manual check-in fallback and full details.
- Use existing 1–10 scale and stable descriptive labels, responsive mobile layout, meaningful button copy, optional more-details controls. No auto-persist on selection before explicit save.
- Use existing useCheckIns, API, authentication and offline outbox; verify no Strava fields in the durable payload or client offline queue. Existing check-in editor updates same record, not a separate rating table.
- Delete unnecessary copy telling a synced runner they must log manually. Preserve "Completed via Strava" label and its transient data; no count twice.

### B. Self-report-driven coaching — highest priority
- Trigger a bounded evaluation after acknowledged/queued check-in changes and on next safe plan read/foreground if hosting slept, with idempotence.
- Reuse WeeklyCoach, WeeklyReview, CoachEvidence, PlanCoach and PlanAdjustment rather than invent a second periodisation engine. Add only missing coordination/event handler and metadata for warning/proposal state if tests establish the need.
- Show at most one contextual recommendation, not a coach chat, when enough eligible data supports it. Keep normal week untouched if not enough evidence; don't show "No change" toast. Ensure Home, Plan, Calendar/ICS, Progress, run detail and recap agree after accepted adjustments.

### C. Calendar move recovery — included, not competing
- Use the existing LifeHappens and MoveRunDialog. After a confirmed moved long run near tempo/intervals, show safe contextual recovery warning/proposal while preserving the runner's chosen target date. A simple easy-to-free-day move has no additional prompt. Never silently move a run twice.

### D. Chat cleanup & deterministic session adjustment — included
- Keep initial removal of AiCoachPanel and finish safe API/component cleanup described above; preserve independent deterministic preview/apply. No AI enabled just because staging has the code. Update old AI tests to cover current no-chat requirements.

### E. QA, screenshots, handoff — required
- Tests, actual screenshot evidence, exact CI commands and PR notes. Use only synthetic data, FakeStravaApi, FakeTimeProvider and disposable local SQL/LocalDB. Never test against real runner data, staging/prod SQL or live Strava credentials. Follow docs/testing.md.
- Run dotnet tool restore, scripts/check.sh and all relevant React Vitest/TS/lint/build and Playwright browser projects. Zero warnings, no skipped failing tests or hidden exceptions. Note any environments that cannot be executed locally; green GitHub CI alone does not prove a real staged OAuth journey.
- Do not change original Taperday palette, animations, bottom navigation, dark/light themes, PWA behaviour, race builder or post-race recovery. Cover 320px/390px phone, tablet/desktop, reduced-motion, keyboard, high contrast and light mode.

## 6. Test matrix — every row requires PASS / FAIL / NOT VERIFIED in PR

| ID | Synthetic end-to-end case | Expected |
|---|---|---|
| R01 | Strava run arrives and user never taps a control | Home/Calendar/Plan show auto-completion; no persisted check-in or new AI call |
| R02 | Strava run arrives, user selects 3/10 then Save as planned | Exactly one durable runner-authored Done/Effort=3, null ActivityId and no Strava-sourced distance/time |
| R03 | Runner edits 3/10 to 8/10 | Same check-in updated, no duplication, coach evaluates new rating |
| R04 | Synced 5 km vs planned 8 km, runner picks Cut short and RPE 8 | Stored CutShort/8, no actual 5 km copied, honest transient 5/8 comparison |
| R05 | Runner chooses Done without RPE via existing quick tick | Saved Done only, RPE remains null; no invented effort |
| R06 | Strava cache expires / connection revoked after own rating | Transient Strava data disappears; user-authored check-in/RPE survives |
| R07 | Two genuine easy runs rated 7–8 out of 10 | Conservative hold/ease proposal through WeeklyCoach where thresholds met |
| R08 | Three genuinely self-confirmed as-planned weeks with appropriate readiness and low effort | Only rules-supported gradual progression for review, never exact new race pace from RPE alone |
| R09 | Runner indicates pain changed running, body area optional | Safety/recovery priority, no harder plan recommended |
| R10 | User skips rating, dismisses rating UI, reloads | Still sees Strava-completed activity; no repetitive full-screen prompt or blocked analysis |
| R11 | Runner rates while offline, then syncs on same/second device | Pending shown; idempotent save; stale edit conflicts do not overwrite newer answer |
| R12 | Runner reports Skipped despite Strava match | Runner declaration wins, conflict clearly identified, no false auto-correction |
| R13 | Two runs or two sessions on same local day | No invented match; rating remains independently recordable if user chooses the right plan session |
| R14 | Runner moves workout to another day then rates | Correct date/session association; one record; old moved date not duplicated |
| R15 | One fast or one difficult run, not enough other evidence | No drastic automatic volume/pace change |
| R16 | One missed easy day with delayed Strava upload | No automatic missed-workout assumption or make-up kilometres |
| R17 | Long run moved next to tempo/interval session | Keeps runner's moved date; safe review/warning; no silent second move |
| R18 | Accept/decline/change/undo future adaptation across two devices | Before/after consistent Home/Plan/Calendar/ICS; stale proposal 409; no repeated nag |
| R19 | 320/390px phone, tablet/desktop, light/dark/reduced motion | RPE choices accessible, visible without complex form, no overflow, no chat |
| R20 | Logged-in runner A and runner B, archived/current/anonymous plans | Auth isolation, no leakage, no changes to history or anonymous builder |
| R21 | Existing staging chat feature env accidentally toggled on | No runner-facing Ask/consent, no live model/MCP invocation |
| R22 | Tests with current Strava-only activity and no user input | No permanent pace/fitness/volume decision; no prohibited derivative or data laundering |
| R23 | Runner checks Done as planned without measured distance | Long-term display labels planned kilometres as estimate, never GPS actual |
| R24 | Race week, cutback, return-from-injury, beginner timed run/walk, ultra | All generator safety and completion semantics preserved |

Use these existing test entry points: tests/StartLine.Domain.Tests/Coaching/{WeeklyCoachTests.cs,SyncedCompletionsTests.cs}, tests/StartLine.Integration.Tests/{CheckInTests.cs,CoachTests.cs,StravaCompletionTests.cs,AdaptiveTrainingTests.cs,AiCoachTests.cs,LifeHappensTests.cs}, client/src/features/coaching/{CheckInCard.test.tsx,useCheckIns.test.tsx,RunVisibility.test.tsx}, client/e2e/{strava-completion.spec.ts,run-history.spec.ts,offline-check-ins.spec.ts,life-happens.spec.ts,ai-coach.spec.ts}. Add client/e2e/post-run-rating.spec.ts with fake API where needed; adapt/remove chat assertions rather than skipping them.

## 7. No reinterpretation, no hidden rollout

- Do NOT tell the runner they must talk to AI. Do NOT make a 10-field logging form mandatory. Do NOT make rating mandatory, but make a voluntary rating the easiest way to create lasting coaching evidence.
- Do NOT assume watch HR is accurate enough to personalise training. Do NOT require it.
- Do NOT misrepresent a recorded Strava session as a self-confirmed prescribed tempo/interval session. Do NOT store derived Strava distance/pace in self-reported check-ins.
- Do NOT silently auto-increase speed/distance after RPE=2 once. Do NOT change historic workouts, archived plans or v1/v2/v3 generator snapshots.
- Do NOT create a new database for ratings, external API adapters, native app, new theme or paid model.
- Do NOT merge to staging, main or production or change feature flags without explicit owner approval. This remains a DRAFT PR.

### What to post back to PR #295 upon completion

1. Final commit SHA + changed files; no unreviewed external code.
2. Detailed flow of synced completion → selected RPE → check-in payload and storage → coaching evidence → proposed/apply/decline/undo.
3. Tests/commands with exact pass/fail/skip counts. Each R01–R24 labelled PASS/FAIL/NOT VERIFIED with test links/line numbers.
4. Actual phone and desktop screenshots in dark and light themes, including selected effort and edited rating. No invented screenshot URLs.
5. Evidence of no model calls and no Strava API-derived permanent coaching; privacy, cache expiry and account deletion review.
6. Relevant migrations or explicit "no migration"; rollback feature flag plan, source provenance, mobile usability limitations.
7. Remaining issues and readiness for **OWNER REVIEW**. **Stop at draft.** Do not deploy.

## 8. Exact Claude Code instruction (paste this prompt)

> Work only in draft PR #295 on branch fix/adaptive-coaching-no-chat targeting staging. First read docs/claude-pr295-execution-contract.md from top to bottom, then CLAUDE.md and docs/testing.md. The user wants invisible, adaptive running plans built from runners' **own saved tick + 1–10 RPE + pain/readiness**, not watch HR, not an AI chatbot. Keep the already working Strava sync as an automatic transient completion feed; never require upload or tick merely to display a run. Inspect PR #294's AI code already merged into staging: RETAIN its deterministic SessionAdjuster/preview/apply and existing WeeklyCoach/LifeHappens, but REMOVE the old Ask the coach UI, live ask/consent backend and model calls safely. Make a two-tap, inline "How hard did it feel?" RPE flow on the completed workout with accessible 1–10 choices and "Save as planned"; place imported-run source/distance/time and extra fields behind the normal run analysis/optional details, never copy Strava measurements into saved check-in payloads. Reuse existing SessionCheckIn/useCheckIns offline saves, trigger safe coaching proposals after independently runner-authored feedback, preserve schedule/plan/race/taper history and do not nag. Implement full domain/API/React/Playwright tests R01–R24, test on synthetic isolated SQL, add dark/light phone/desktop screenshots and report results in this same PR. **Do not merge, deploy, enable AI/provider keys or change production. Keep the PR draft for owner approval.**
