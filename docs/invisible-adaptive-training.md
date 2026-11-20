# Taperday: Invisible Adaptive Training — corrected product brief and implementation handover

**Owner decision (20 Nov 2026):** The user does **not** want runners interacting with an AI, typing prompts, choosing AI modes, or seeing an "Ask the coach" panel. The product should feel like an adaptive running plan similar in *experience* to Runna: recorded running and rescheduling influence **future** training, with concise, ordinary plan-update notices. This supersedes PR #294's conversational-coach product direction.

**Important change-control instruction:** PR #294 was merged to staging despite the owner not wanting an automatic merge. **Do not merge this corrective PR to staging, main, or prod without explicit owner approval.** Keep production untouched. The branch and PR exist for review, implementation and tests.

## Current corrective PR status

- Branch: `fix/adaptive-coaching-no-chat` created from staging after PR #294.
- This first correction removes `AiCoachPanel` from `PlanView`, removes its wiring from `App.tsx`, and removes its dedicated UI props. It does **not yet** deliver the automatic event-driven adaptation engine.
- Existing features such as drag-and-drop run movement, check-ins, manual run entry, weekly review, current runner-scoped API endpoints and read-only MCP implementation remain in the codebase for reuse or later removal.
- Backend conversational `/ai/ask` still exists in staging code but the feature is off by default. **Do not enable `AiCoach__Enabled`, a provider key, `AiCoach__McpEnabled` or the old UI flag for users.** In the final product, retire/disable the conversational and external-client API surface and replace with internal adaptation evaluation endpoints; do not rely on hiding buttons alone as the final access control.
- This is a deliberately incomplete *corrective implementation + build handover*, **not** a claim that dynamic training is finished.

## Experience: no chatbot, no AI branding

The runner's ordinary journey:

1. A runner logs a completed run (manual check-in or independently uploaded FIT/GPX/TCX), marks one missed, changes availability/strength days, or drags/swaps a workout in Calendar.
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
- For runners using Garmin/Apple Watch via Strava, Taperday can show a live synced completion; to produce a durable evidence-driven training adjustment, they may need a permitted **independently uploaded** recording or their own manual log, until a compliant first-party device integration exists. This is a genuine product limitation, not a reason to silently break Strava policy.
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
8. Strava-only runner: synced run continues to appear as permitted display, but isn't copied into stored training evidence or AI payload; clearly handle insufficient independent evidence.
9. Move then log late, undo, swap twice, switch account, offline replay, 2 devices: idempotent, no stale overwrite or phantom sessions.
10. App loads with AI env flags on: still **no Ask the coach** surface. Existing calendar, check-ins, weekly review and run modification remain functional.

## Definition of done

- All adapted plans are driven by recorded data and explicit reschedule events, without users talking to a model.
- Suggestions are timely, visible only when meaningful; safe corrections apply consistently, larger ones are approved. Restoring old plans and training history works.
- Event-driven updates and idempotency pass isolated domain/integration tests; provenance excludes Strava from persistent adaptive and model/MCP paths.
- Backend unit/integration/SQL, frontend Vitest/lint/typecheck and browser E2E mobile/desktop both themes and reduced motion pass. Real staging QA with synthetic runner verifies full journeys; screenshots and test evidence attached to this PR.
- Provider AI key not required for normal adaptivity; preserve feature flags off on current production.
- Explicit owner approval is REQUIRED before any merge, staging promotion or production release. Do not infer consent from a green CI run.

## Prompt for coding agent

> Continue draft PR **fix/adaptive-coaching-no-chat**. Read `docs/invisible-adaptive-training.md`, `docs/ai-coach-mcp.md`, `docs/testing.md` and the current staging code. The product owner wants a Runna-style **invisible adaptive training engine**, NOT an interactive AI chatbot: no questions, textbox or AI buttons. Automatic future-workout evaluation must trigger from independent run entries/uploads, missed sessions, readiness and moved/swapped workouts. Implement a deterministic safe scheduler and evidence-driven progress/pace adaptation using the existing plan, coach, move and preview/restore contracts; preserve runner-created moves. Allow truly safe small fixes automatically; present meaningful pace/intensity/volume changes as short recommendations with Review / Keep / Undo. Never feed Strava API data into an LLM, third-party MCP or persisted derived coaching decision. Keep UI original, mobile+desktop, dark+light, animations. Add end-to-end integration/event/idempotence/UI tests and PR screenshots. **Do not merge or deploy this PR without explicit owner approval.**
