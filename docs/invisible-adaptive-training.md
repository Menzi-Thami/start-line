# Taperday: Invisible Adaptive Training — corrected product brief and implementation handover

> **AUTHORITATIVE HANDOVER:** For PR #295, read [docs/claude-pr295-execution-contract.md](claude-pr295-execution-contract.md) **first and follow it when any details below conflict**. This older planning document is retained for background, not as permission to merge/deploy, add new providers, or use Strava data in lasting coaching.

**Owner decision (20 Nov 2026):** The user does **not** want runners interacting with an AI, typing prompts, choosing AI modes, or seeing an "Ask the coach" panel. The product should feel like an adaptive running plan similar in *experience* to Runna: recorded running and rescheduling influence **future** training, with concise, ordinary plan-update notices. This supersedes PR #294's conversational-coach product direction.

**Important change-control instruction:** PR #294 was merged to staging despite the owner not wanting an automatic merge. **Do not merge this corrective PR to staging, main, or prod without explicit owner approval.** Keep production untouched. The branch and PR exist for review, implementation and tests.

## Primary integration: STRAVA (owner clarification — 20 Nov 2026)

**Strava remains Taperday's PRIMARY data point and integration**, including runners using Garmin, Apple Watch or phones that sync activities into Strava. **Do not reposition this project around manually uploaded FIT files or a speculative replacement integration.** Keep the current Strava connection, import, auto-completion, source attribution, retry/catch-up and real-time display as the backbone of the everyday experience.

The system must distinguish two capabilities so it stays both useful and truthful:

- **Primary automatic activity source (already working in the codebase): STRAVA.** When Strava delivers an activity, Taperday finds the matching scheduled workout when unambiguous and immediately shows the runner the event and completion/progress in today's Home, Plan, Calendar, Progress and weekly recap, without asking them to enter or upload it. Sync status, reconnection and a small number of ambiguous matches are exceptions. Do not delay this UX until a new provider is integrated. Recovery and spacing updates triggered purely by **Taperday's own schedule move** can still occur without reading Strava metrics as training evidence.
- **Long-lived performance-based adaptation (contractual gap):** Changing and persisting future mileage, pace zones or progression **based on Strava API activity measurements** is not an approved current capability. The 2026 Strava API policy §§5.3, 5.4, 5.5, 5.16 and 6.2 restrict using Strava data for AI, analytics, derived persistent indexes, third-party MCP, and retention beyond 7 days. Runners connecting to Strava does **not** waive those restrictions; neither a hidden in-house LLM nor a deterministic algorithm is a loophole. Before committing to this data-driven feature, obtain a **written permitted-use determination** from Strava for privately displayed, deterministic, same-athlete training-plan adjustments, including permitted retention, derived plan data, and charges. In the absence of approval, use Taperday-owned schedule state, runner-entered check-ins/availability and independently sourced eligible evidence, or explicitly defer the lasting Strava-derived adaptation. Do not assert permission based on Runna's commercial arrangements with Strava.

**Priority order:**
1. Finish the zero-touch **Strava-first** runner experience (reliability, automatic matching, status, timely UI, notification hygiene, late sync, dedupe and logging the absence of data correctly).
2. Implement **event-driven schedule adaptations** that can safely operate on Taperday-owned plan events (runner moves a session, changes schedule, reports readiness, misses a planned day) with no extra manual upload.
3. Determine the **approved path for Strava-connected evidence to support lasting coaching**, requesting written policy clarification/permission. Only then enable persisted decisions derived from Strava runs if authorised. A parallel independent provider route is **contingency/future expansion**, not the main product strategy.
4. Maintain manual entry and FIT/GPX/TCX as exceptions, **never as the onboarding or weekly default**.

**Strava clarification to request (do not send without owner consent):**
> We operate Taperday, a small running-plan PWA. Each runner connects their own Strava account. We want to automatically match and display their completed sessions, and eventually adjust *only that runner's* future training plan using deterministic rules based on recent Strava activities, without sending Strava data to an AI/LLM/MCP or disclosing it to any other user. We recognise the 7-day cache and restrictions on derived data and analytics under the 2026 API Policy. May we compute such private same-athlete training adjustments? If so, may the resulting future plan adjustments and short-lived calculations be persisted, for how long, and is a separate approval/partner arrangement required? We request confirmation in writing before enabling this functionality.

**Practical implementation implication:** model the data type as `StravaSyncedActivity` for currently available, transient runner-facing display/matching only. Do not accidentally store it as `IndependentPerformanceEvidence` or feed it to a long-term `CoachWeek` decision. Write tests showing that a Strava run can auto-complete the UI and a moved workout can trigger a recovery warning, **without** accidentally creating a permanent derived performance record.

Official policy: https://www.strava.com/legal/api_policy (effective 1 June 2026).

## Product principle: zero-admin running (new owner feedback, 20 Nov 2026)

**Core promise:** **Connect Strava once → record runs as usual → Taperday handles sync, matching and progress → the plan reacts as far as permitted.** *Manual uploads and manual check-ins are exception/recovery paths, not the primary experience or the assumed source of all training data.* A runner should be able to complete most weeks without touching the app after connecting their provider, except to read their plan or approve a material change. The product should never punish runners for using a watch.

**Top-priority acceptance KPI:** of runs recorded by runners with a healthy connected integration, target >95% appearing in Taperday without manual action, with a distinct measure of provider latency and match accuracy. This is a **target**, not an existing measured achievement. Track "run recorded → imported → matched to planned workout → reflected in current progress" latency and the percentage requiring user intervention. Persist no prohibited Strava metrics while collecting telemetry.

### Automation tiers (user involvement only on exceptions)

| Trigger | Default experience | User action |
|---|---|---|
| Runner first signs up | Offer Connect Strava at a sensible onboarding point, explain benefits, allow Skip; complete OAuth once | One-time consent |
| Watch/phone records run, connects through supported service | Webhook/sync job imports it, retry/catch-up handles late uploads and outages, re-fetch relevant views | None |
| Exactly one eligible run matches one planned run that day | Automatically display completion, comparison and source on Home/Plan/Calendar/Progress; never ask "Did you run?" if confident | None |
| Two runs in a day, a missed-day mismatch, competing plans, an import issue | Do **not** guess or double-count; surface a quiet one-tap match/resolve action only when necessary | One tap only if ambiguous |
| Workout is shorter or longer than prescribed | Show that the runner showed up, distinguish participation from completing exact intervals/intensity; do not nag to type known distance | None |
| Runner moves/swaps a workout | Apply the selected move, immediately evaluate safe neighboring workouts; if a material compromise is required, show one contextual explanation | No extra steps for a safe move |
| Independently eligible training evidence changes | Event-driven re-evaluation of volume, intensity, fatigue and pace; apply only provably safe mechanical corrections, otherwise offer one concise review | Only when material |
| Sync provider outage/token revoked/API limit | Durable retries and backoff, catch up automatically, show unobtrusive status; request reconnection only when truly required | Usually none |
| Runner has no supported integration or the recording failed | Existing quick manual completion or .FIT/.GPX/.TCX import remains available and accessible | Fallback |
| New training week, no new activity | Evaluate on first next relevant API read / durable scheduled opportunity, with no dependence on always-on F1 | None |

### What Taperday already has — preserve, don't rebuild

Repository `docs/strava-sync.md` documents durable `SyncJobs` with webhook enqueue, worker retries/backoff, deduplication, six-week catch-up, a 10-minute scan throttle, visibility/foreground catch-up, status and reconnect, and source-aware import; **do not introduce a second sync pipeline**. `SyncedCompletions.Of` and `GET /api/v1/me/plans/{id}/strava-completions` already show eligible synced runs as completed **on read**, with no permanent check-in write; Home, calendar, progress, and weekly recap reflect this transient completion. It also handles shorter/longer runs, treadmill duration and conflict cases. Improve the flow and QA edge cases rather than remove these features or require runners to tap **Keep this tick** for normal current-week use.

**Honesty about the existing gap:** although synced Strava runs appear completed automatically, the persisted weekly coach (`CoachWeek`) intentionally **does not** use Strava-derived measurements. This means seamless *visual tracking* works today, while fully automatic **durable adaptive training** from watch runs requires a compliant independent source. **Do not claim that merely connecting Strava will already personalize lasting paces and mileage.**

### How to close the gap without putting work on the runner

1. **Maximise existing automated Strava experience:** make connection prominent (but skippable), confirm success, improve high-confidence auto-matching, preserve sync latency/backoff and catch-up reliability; update Home/Plan without refresh; remove redundant "tick the run" prompts where auto-completion is already confident. The runner must never have to upload the exact run solely to see today's progress.
2. **Contingency only, not the main data source — build a compliant first-party automatic activity feed for persistent adaptation if required:** investigate direct approved provider APIs (Garmin **if partnership access approved**, Polar AccessLink, COROS where accessible, Apple ecosystem **through a supported native bridge if necessary**, not an imaginary browser-only HealthKit API). Prioritise providers by realistic access, developer obligations, costs, geography and watch coverage. Implement source provenance, explicit user consent, signed event validation, token refresh, backfill, dedup, deletion, retry, and retention rules. Import eligible data into the existing `ActivityRecorder` instead of duplicating it. This is **future integration work**; none is claimed implemented.
3. **Do not falsely treat Strava as that durable adaptation source.** Its API policy bars third-party AI/MCP exposure and restricts cache/derived retention. Existing visual session completion can use the permitted transient cache as documented. Confirm exact derived-data rights with Strava/legal review before any different use. Never create a permanent check-in, training fitness estimate, coaching adaptation or separate "copy" of a Strava activity without a permitted independent basis. A manual **user-declared** completion can still count, but should not be an everyday requirement. Never fabricate a user declaration.
4. **Use zero-LLM deterministic coaching initially:** run/event handling, date spacing, rest and volume protections don't require a paid model. Only eligible independent data feeds progression changes. This lets Taperday behave intelligently now while first-party integrations are added.
5. **Treat raw file uploads as the safety net:** maintain drag/drop or share-file upload, fast parsing, clear duplicate detection and background processing, but never design primary screens/marketing around manual uploads.
6. **Measure and close actual friction:** automated completion coverage, days until next user-required manual action, reconnection rate, unresolved activity conflicts, time to synced completion, and percentage of adaptations accepted/undone. Include feature-flagged telemetry without sensitive routes or raw third-party data.

### No-friction QA cases required

- Connect Strava once, record a Garmin-origin run, close the PWA: on next open, sync catches up without upload/check-in, matching the same local-date planned run on Home, day detail, Calendar, Progress and recap.
- Late upload, missed webhook, provider rate limit, app idle/F1 sleeping, overnight timezone transition, partial sync failure: existing durable job/backoff plus foreground scan recover without the user tapping **Check for runs**; no duplicate activity or ghost completion.
- Run is 4.5 km against a 6 km plan: automatically show "run recorded" and shortfall, not an unearned claim that prescribed intervals were met.
- Two runs in one local day / run on a moved workout date: match only when unambiguous; never wrongly check a different session. If ambiguous, one-tap resolve rather than a full manual form.
- Import a separate eligible direct-provider activity: auto-create source-attributed independent run evidence, de-duplicate any existing Strava display copy, trigger safe adaptation evaluation once.
- Revoke connection / delete run / expire the Strava cache: transient displayed Strava figures disappear appropriately, without leaving stale stored coaching decisions derived from them.
- Users with no connected provider: their plan still works, manual logging remains fast and optional, and the app doesn't harass them to connect every visit.
- Prove that none of these background/foreground events triggers an LLM request, a chat UI, a billable assistant call, or an aggressive plan edit.

**Do not** build a separate native app as a precondition of these initial improvements: Taperday remains a responsive PWA. An eventual HealthKit/native bridge or first-party provider partnership is a **later separately approved integration** if it proves essential.

## Current corrective PR status

- Branch: `fix/adaptive-coaching-no-chat` created from staging after PR #294.
- This first correction removes `AiCoachPanel` from `PlanView`, removes its wiring from `App.tsx`, and removes its dedicated UI props. It does **not yet** deliver the automatic event-driven adaptation engine.
- Existing features such as drag-and-drop run movement, check-ins, manual run entry, weekly review, current runner-scoped API endpoints and read-only MCP implementation remain in the codebase for reuse or later removal.
- Backend conversational `/ai/ask` still exists in staging code but the feature is off by default. **Do not enable `AiCoach__Enabled`, a provider key, `AiCoach__McpEnabled` or the old UI flag for users.** In the final product, retire/disable the conversational and external-client API surface and replace with internal adaptation evaluation endpoints; do not rely on hiding buttons alone as the final access control.
- This is a deliberately incomplete *corrective implementation + build handover*, **not** a claim that dynamic training is finished.

## Experience: no chatbot, no AI branding

The runner's ordinary journey:

1. A runner simply records their workout as usual on their watch/phone. Taperday's existing connected sync imports and displays eligible runs automatically. Independently eligible provider recordings (when added), manual check-ins and independent uploads can also become durable training evidence. Runners may mark a run missed or drag/swap a workout in Calendar.
2. Taperday immediately **re-evaluates the affected remaining week** and the relevant part of the future plan using the **existing deterministic training rules**, without a new question from the runner. A small bounded compute path should run on the normal API request; do not depend on an always-on background worker (Azure App Service F1 sleeps).
3. **No change needed:** do not show a popup or a "nothing changed" toast. No noisy notifications.
4. **Safe mechanical calendar adjustment:** automatically realign affected *future* rest/easy days to prevent hard days stacking, keeping the runner's manually chosen moved workout on its new date; notify only if an actual prescription changed. Preserve the user's move as the source of truth unless unsafe, in which case **offer alternatives without silently moving their chosen session again**.
5. **Material change:** where training load, pace zones, intensity, multi-week progression or a key long run would change, show one compact compare-and-approve recommendation such as: "**Training adjusted for your week** — Thursday tempo becomes 5 km easy because your long run moved to Wednesday. [Review change] [Keep plan]." Do not call this "AI"; no textbox or AI consent toggle in the runner's plan.
6. On approval the *same* previewed adjustment is applied. On decline, preserve the plan unless a medical safety issue requires a warning; the engine must not repeatedly nag about the same declined decision. A clear Undo/Restore must remain available.
7. Changes appear in Plan, Home, workout detail, Calendar, calendar feeds, Progress and weekly recap consistently on reload and on another device. Completed and archived workouts are immutable.

## Decision rules — what changes and what does not

### A. Reactions to calendar moves/swaps

- `MoveRun`, `SwapRuns` and `MoveLongRun` already exist in `Domain/Plans/LifeHappens.cs`, with existing preview/apply and move UI. Reuse their origin tracking, signed fingerprint, and `SessionRevision` / restore semantics. Do not recreate drag/drop.
- After an accepted move, calculate **affected dates only** (default rest of week, at most 14 days): quality-day spacing, race eve, long-run recovery and strength conflicts. No doubling workout; no moving original again silently; do not create extra training days.
- If the runner moves a long run next to a planned tempo/interval workout, prefer an easy/recovery replacement (with allowed distance) or rest; include a review when intensity is affected. If a safe schedule is impossible, explain the conflict in the existing move dialog *before* accepting the move, or offer valid alternatives; don't silently overwrite the user's explicit intent.
- Moving a workout earlier/later must recalculate approximate duration, and keep weekly km sums consistent with the changed days. Return a deterministic impact summary, not free-form model text.
- Move/undo/move again, an offline check-in arriving after a move, and simultaneous two-device edits must not duplicate sessions or undo a newer decision.

### B. Reactions to actual running

- A single missed easy session shouldn't trigger a multi-week replan; never add "make-up" kilometres.
- Missed long run, several missed runs, a full week of inactivity, load spikes, pain that changed running, or a longer-than-planned independently logged run can trigger a **conservative review** of the remaining/future weeks, with fixed priority pain/recovery > race-week protection > load > performance.
- Respect `CoachEvidence`, `WeeklyCoach`, `WeeklyReview`, `Readiness`, `RemainingWeek`, `Replan` and `TrainingPlanGenerator`; do **not** create a second competing plan algorithm. Existing weekly decisions currently require explicit acceptance: separate safely auto-applicable low-impact changes from significant changes needing acceptance, and test each.
- Pace-zone changes require **sufficient recent independent evidence** over multiple runs/weeks (not one unusually fast run); do not prescribe faster paces when fatigue/pain or insufficient data, or in taper/race week. Explain both current and proposed zone ranges to the runner if offering an adjustment.
- Changes to time, distance, and session structure must preserve intervals, warm-up/cool-down, run/walk, taper/cutback weeks, training volume caps and goal/race dates. `SessionAdjuster` is a useful safety layer but not the whole adaptation engine.
- No change to a past, completed, logged, concluded or archived session. A change must be recoverable without removing actual running history.

### C. Data provenance and provider constraints

- **Permitted inputs for persisted adaptive coaching:** Taperday plan, manually entered independent check-ins, independently uploaded activity files with validated provenance, readiness answers, and runner-initiated calendar changes. Deduplicate upload/check-in associations.
- **Strava API-derived records must not be sent to AI/MCP and should not drive *persisted* adaptive training decisions.** See `docs/strava-sync.md` for the 7-day cache and presentational auto-completion semantics, and https://www.strava.com/legal/api_policy . Existing "completed via Strava" can continue to display transiently under current rules, but it is not permanent independently recorded coaching evidence. Do not "launder" Strava data through a derived metric, copied check-in or cached completion. If data source unclear, fail closed and exclude.
- For runners using Garmin/Apple Watch via Strava, Taperday can show a live synced completion with **no manual upload or tick**. To produce durable evidence-driven adaptation from Strava-connected watch metrics, seek written Strava approval for the intended private coaching behavior first. Explore direct-provider connections as a secondary contingency, not a replacement for Strava. Until such integration is in place, the existing optional independent upload/manual log is a fallback, **not an expected daily step**. Do not silently break Strava policy or promise automatic long-term coaching that this source cannot provide.
- No AI provider is **necessary** to make a plan adaptive. Prefer deterministic analysis for pace/load, only consider a private backend model later for narrative summaries with opt-in/privacy and permitted data. Do not imply a paid LLM is required. No user chat.

## Architecture and implementation sequence

**Trigger:** New/edit/delete check-in, manual run log, uploaded activity saved/deleted, readiness updated, moved/swapped run applied/restored, preference/plan changed and start of a new training week. Leverage existing application command handlers and domain events where available; verify after transaction commit, not before.

**Evaluator:** `AdaptivePlanEvaluator` in Application/Domain with a source-filtered, plan/runner-scoped `TrainingEvidence` projection, runner-local date and stable event key. Input includes current `SavedPlan.Version`, `SavedPlan.Adjustments`, accepted `CoachWeeks`, check-ins, independent uploads, readiness, and move provenance. Output has an explicit class:
- `NoChange`
- `SafeAutomaticCorrection`: bounded future day spacing/rest-only action, *if* deterministic rules can guarantee it preserves user move/actual logs and is idempotent
- `NeedsRunnerApproval`: intensity, duration/distance/pace, workout replacement, week progression or replan

Provide before/after `date, type, distanceKm, estimatedDuration, pace zone, structured steps, weekly totals, training load summary, reason`. A signed/fingerprinted proposal is tied to user, plan version, evidence and current local date. Apply with optimistic concurrency and compare/recompute. Never trust client-provided revised sessions. Store history with source `AutoAfterMove`, `AutoAfterLog`, `WeeklyAdaptation`, etc.; mark accepted, declined, reverted and affected dates.

**Execution and scheduling:** Re-evaluation should happen on write events plus a bounded GET/read fallback to ensure a free/sleeping F1 host still catches up. No long-lived in-memory queues as the only trigger. Evaluate exactly once per relevant fingerprint, not on every tab opening. Add a durable idempotency record if auto-applying. Do not start a model call on render, load or pull-to-refresh.

**Existing paths to inspect:**
- `src/StartLine.Application/Features/Coaching/Coaching.cs`, `RemainingWeek.cs`, `LifeHappens.cs`
- `src/StartLine.Domain/Plans/LifeHappens.cs`, `RemainingWeek.cs`, `SessionAdjustment.cs`, `SavedPlan.cs`
- `src/StartLine.Application/Features/CheckIns/CheckIns.cs`
- `src/StartLine.Application/Features/AiCoach/TrainingEvidence.cs` (eligible evidence projection; rename to a neutral namespace if appropriate)
- `src/StartLine.Application/Features/Activities/` (activity import and source validity)
- `client/src/features/coaching/useCheckIns.ts`
- `client/src/features/plan/MoveRunDialog.tsx`, `RescheduleDrag.tsx`, `PlanView.tsx`, `client/src/app/App.tsx`
- `docs/strava-sync.md`, `docs/testing.md`, `docs/run-logging.md`, `docs/ai-coach-mcp.md`

**Backend contract proposal:** `GET /api/v1/me/plans/{id}/adaptation` returns the current allowed, deduplicated suggestion and provenance (no model dialogue). `POST /.../adaptation/apply` requires signed preview token, and `POST /.../adaptation/decline` suppresses that exact recommendation. Auto-safe adjustments are applied transactionally when an event commits and return a change summary. Keep existing `LifeHappens` and `coach/proposal` endpoints working until migration is proven. Do not create any public MCP write tools. Remove/deprecate the old /ai/ask contract and consent UI as part of completing this redesign.

**Frontend:** No chat/prompt textbox, no "AI coach" as a navigation item, no AI consent toggle. Use a small in-context card only if future training genuinely changes or a significant proposal is ready. Distinguish *automatically adjusted* from *suggested, not applied*. For auto-applied changes, offer a simple Undo; for a recommendation, provide Review / Keep plan. Preserve the original Taperday colours, runner animation, typography, dark/light mode and bottom navigation on small screens.

## Concrete acceptance scenarios

1. Move a Sunday 18 km long run to Saturday when Friday has tempo: keep Saturday as runner-chosen, evaluate Friday's recovery conflict, and safely suggest changing Friday or warn before completing move. Do not duplicate or move Saturday again.
2. Move a Wednesday easy 6 km to Thursday: if no training conflict, keep all workouts unchanged and show **no AI UI**.
3. Miss one easy 6 km: no attempt to add 6 km to the next day's run; week updates naturally.
4. Miss three key sessions / a full training week: propose conservative future-week realignment with clear summary and user acceptance.
5. Log a 5 km run when 8 km prescribed: update actual progress without falsely declaring the prescribed intensity met; future adaptation only if supported by rule and enough evidence.
6. Log multiple weeks of independent runs comfortably ahead of planned pace: offer a *future* pace adjustment only with enough valid evidence and without retrospectively changing already logged workouts.
7. Pain/illness, beginners, run-walk ultras, taper/race week: never make aggressive increases; no medical diagnosis.
8. Strava-only runner: synced run automatically appears as permitted display without upload/check-in; it isn't copied into stored training evidence or AI payload, and any lack of independent progression evidence is explained only when material.
9. Move then log late, undo, swap twice, switch account, offline replay, 2 devices: idempotent, no stale overwrite or phantom sessions.
10. App loads with AI env flags on: still **no Ask the coach** surface. Existing calendar, check-ins, weekly review and run modification remain functional.

## Definition of done

- All adapted plans are driven by eligible automatically ingested recorded data and reschedule events, without users talking to a model; manual logging/uploads remain fallback, not the default.
- Suggestions are timely, visible only when meaningful; safe corrections apply consistently, larger ones are approved. Restoring old plans and training history works.
- Event-driven updates and idempotency pass isolated domain/integration tests; provenance excludes Strava from persistent adaptive and model/MCP paths.
- Backend unit/integration/SQL, frontend Vitest/lint/typecheck and browser E2E mobile/desktop both themes and reduced motion pass. Real staging QA with synthetic runner verifies full journeys; screenshots and test evidence attached to this PR.
- Provider AI key not required for normal adaptivity; preserve feature flags off on current production.
- Explicit owner approval is REQUIRED before any merge, staging promotion or production release. Do not infer consent from a green CI run.

### Explicit agent warning: Strava is the core integration

Do **not** tell the owner that manual uploads are the central data source. Do **not** replace the Strava path with a new Garmin/Apple integration by default. Treat Strava as the primary automatic source for *current activity, matching and transient progress*. If Strava-derived lasting future-plan adjustments are required, mark them blocked pending written provider authorisation instead of silently breaking policy. Proceed with safe automatic changes based on runner-owned schedules and permitted independent evidence.

## Prompt for coding agent

> Continue draft PR **fix/adaptive-coaching-no-chat**. Read `docs/invisible-adaptive-training.md`, `docs/ai-coach-mcp.md`, `docs/testing.md` and the current staging code. The product owner wants a Runna-style **invisible adaptive training engine**, NOT an interactive AI chatbot: no questions, textbox or AI buttons. Automatic future-workout evaluation must trigger from independent run entries/uploads, missed sessions, readiness and moved/swapped workouts. Implement a deterministic safe scheduler and evidence-driven progress/pace adaptation using the existing plan, coach, move and preview/restore contracts; preserve runner-created moves. Allow truly safe small fixes automatically; present meaningful pace/intensity/volume changes as short recommendations with Review / Keep / Undo. Never feed Strava API data into an LLM, third-party MCP or persisted derived coaching decision. Keep UI original, mobile+desktop, dark+light, animations. Add end-to-end integration/event/idempotence/UI tests and PR screenshots. **Do not merge or deploy this PR without explicit owner approval.**
