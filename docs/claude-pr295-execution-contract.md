# PR #295 — Claude Code execution contract: Strava-first invisible adaptive training

**Owner-approved product direction as of 21 November 2026.** This file is the SINGLE SOURCE OF TRUTH for completing draft PR #295. It supersedes conflicting requirements in `docs/invisible-adaptive-training.md`, `docs/ai-coach-mcp.md`, PR #294 and older chat prompts. Read `CLAUDE.md`, `.claude/rules/engineering-principles.md`, `docs/testing.md` first. When an ambiguity remains, choose the safer, less intrusive, backwards-compatible behaviour below and state the choice in the PR. Do not improvise a new product direction.

## FINAL OWNER CONSTRAINT — EXISTING STRAVA API ONLY (21 NOV 2026)

**The owner has no access to ANY additional provider APIs and cannot obtain Garmin, Polar, Apple, HealthKit, aggregator or other new provider access. No new external API is in scope, and Strava has refused special approval for permanent coaching decisions derived from its API data. This is final for PR #295.**

**Do not investigate, build adapters for, recommend, wait for, request, or make the product depend on any other API. Do not suggest an alternative API as the answer.** The only connected activity feed is Taperday's **already-working Strava integration**; it remains the PRIMARY experience.

### Exactly what to implement with existing resources

1. **Zero-touch Strava CURRENT activity:** existing OAuth, webhooks, durable sync jobs, foreground catch-up, dedupe, transient activity cache and `SyncedCompletions`. Match eligible runs on the currently moved plan date. Current Home, calendar, Plan, progress and recap reflect permitted active cached activity without user upload or permanent tick. The runner uses a watch and does **nothing in Taperday** for normal completed-run display.
2. **Always-on schedule intelligence from Taperday-owned data:** when a runner drags/swaps a workout, changes running availability, adjusts readiness, reports pain/illness or explicitly marks a session missed, evaluate future training automatically and conservatively using existing deterministic coaching logic. Preserve runner-selected dates; safely handle hard-day adjacency, extra recovery, taper, strength conflicts, race week and run/walk without a chatbot. Auto-apply only provably safe minor corrections with undo; prompt once for meaningful modifications.
3. **Occasional human-provided signals, not daily logging:** existing account/profile inputs (race goal, current weekly volume, recent race/5K/10K performance where independently and willingly supplied), optional very short periodic readiness/effort feedback, independently authored check-ins, and pre-existing optional FIT/GPX/TCX imports can provide **independent** evidence for longer-term coach progression. Prefer **one short weekly check-in only when material**, not a form after every run. No manual data is invented, copied from Strava, inferred from its cached metrics or required to display completion. Taperday must remain useful if the runner never enters anything.
4. **Transparent limitation:** Under the assumed Strava denial, fully automatic **persisted fitness/pace/mileage progression based solely on Strava measurements is NOT possible**. Do not falsely advertise or simulate it; do not silently write derived snapshots, use AI/MCP as a proxy, run browser scrapers, ask the user to download Strava exports every week, or launder the data into a fabricated user entry. Keep current Strava calculations transient and source-labelled as they are today. Until there is genuinely independent evidence, leave pace progression at the plan's existing prescription.
5. **No new app:** Taperday remains the existing PWA. Never propose native companion apps, direct HealthKit PWA access, paid data brokers or second OAuth integration in this PR.

### In-scope adaptation examples

- **Easy 6 km moved Wednesday → Thursday with no collision:** save move, no additional prompt or schedule rewrite.
- **Sunday long run moved to Saturday beside a Friday tempo:** keep Saturday as chosen; warn about recovery and propose a safer *future* Friday session for explicit review. Do not silently change the tempo or move Saturday back.
- **Runner explicitly marks illness, injury, or very hard effort:** prioritise recovery and safe rest/easy corrections using *their own report*. No aggressive catch-up mileage.
- **Strava records 5 km vs planned 8 km:** show automatic completion with accurate shortfall in the CURRENT visible view; do NOT permanently alter next week's training based on that Strava measurement.
- **Runner's own recent independent 5K result and repeated independently submitted feedback:** use existing WeeklyCoach conditions to make a conservative, reviewable future-pace proposal, not an automatic unbounded speed-up.
- **No Strava activity seen yet:** do NOT infer the run was missed; the watch may sync late, be offline, or be disconnected. A missed session only becomes a durable training signal when the runner explicitly says so or independent permitted evidence establishes it.

### Required acceptance tests replacing all prior external-provider tests

| ID | Synthetic scenario | Expected |
|---|---|---|
| N01 | Strava-only runner records ten runs without opening forms | All currently eligible runs show transient auto-completion; no persistent Strava-derived coaching |
| N02 | Runner moves a long run to Saturday next to Friday tempo | Runner's date stays; schedule conflict evaluated without Strava measurements |
| N03 | No Garmin/Polar/Apple/other API configured | Existing product, sync, coaching safety and builds still work; no new credentials, integrations or API requests |
| N04 | Runner has Strava and no other data inputs | No manual-upload nag, no fictional pace improvement; current progress remains automatic |
| N05 | Strava disconnects or cached record expires | Derived current completion disappears as required; no hidden permanent coaching decisions |
| N06 | Runner volunteers own readiness/illness report | Correct safe future adjustment/review; provenance is self-report, not Strava |
| N07 | PWA-only Apple Watch owner records a run through Strava | Automatic current display; no browser HealthKit access claim |
| N08 | Old `AiCoach__Enabled` and `VITE_AI_COACH_ENABLED` both true in test | No chat, AI calls, MCP or hidden Strava-derived coaching |
| N09 | Strava synced 5 km against prescribed 8 km | Participation/shortfall shown transiently; persistent training prescription unchanged |
| N10 | App sleeps, late duplicate Strava run arrives and another device opens | Retry/dedupe/source expiry, no doubled completion or runner crossover |
| N11 | No Strava activity yet for yesterday, possibly delayed sync | Do not auto-mark missed or automatically replan |
| N12 | Only eligible independent check-ins/race benchmark available | Existing deterministic weekly coach can propose changes with accepted preview and clear evidence |

**Claude instruction:** implement in-scope changes now using Taperday's existing source code, not a new API. Remove external-provider integration plans from the implementation checklist and tests. DO NOT merge, deploy or request third-party keys.

## TECHNICAL CAPABILITY DIRECTIVE — build the real adaptation algorithm, test with synthetic recordings

**User direction (21 Nov 2026): offer the maximum functionality technically possible from the current integration, instead of stopping at calendar-only features.** This is a specific engineering directive: **implement and verify** the algorithm, its UI and its safety properties. Existing Strava API policy constraints still apply to actual use: the synthetic engineering path must NOT feed real Strava API measurements into persistent coaching or activate a prohibited live workflow. The product owner must separately decide whether that risk/rights issue is resolved before any rollout.

**The algorithm is NOT a chatbot.** A deterministic rules engine receives a normalised `RecordedRun`-shaped input; that data source may be a **synthetic Strava-shaped test fixture** for development, or independently permitted runner-provided evidence in a real running environment. Keep provenance explicit, prevent a live Strava-only record from becoming persistent adapted training in this PR.

### Build the end-to-end engine

1. **Data contract:** `RecordedRun` fields: `source`, `planId`, `sessionId` or date association, runner-local `date`, `distanceKm?`, `movingSeconds?`, `elapsedSeconds?`, `meanPaceSecPerKm?`, `splits?`, `meanHeartRate?`, `maxHeartRate?`, `perceivedEffort?`, `pain?`, `confidence`, `cachedUntil?`. Unknown metrics are genuinely null, not imputed. `source` must distinguish `SyntheticFixture`, `IndependentRunnerEntry`, `IndependentFileUpload`, `StravaTransient`. Do not persist a second copy of Strava-derived measurements.
2. **Association:** match to currently effective moved session using source-local date and available time; only auto-match when unique (one meaningful run/one planned session); otherwise request a short resolution. No claiming timed intervals/tempo success from a single mean pace or distance. Don't double count same watch recording.
3. **Per-run comparison:** compare prescribed distance/duration against actual with existing `SessionPrescription`/synced feedback semantics. For synthetic or eligible evidence, assess structured interval adherence only where step/segment evidence actually supports it; if unassessable, show `NotEvaluated`. Optional HR only when independently consented, otherwise omit.
4. **Training-trend evaluator:** bounded last 3–4 full weeks; calculate independently attributable weekly volume, adherence, number of quality sessions, long-run completion and reliable effort trend. Guard against missing uploads, bad timezone, treadmill sessions without distance, paused watches, mixed race types, abnormal races, and low evidence sample count. No simple "you ran fast once → faster plan".
5. **Proposals:** `NoChange` / `ReviewRecovery` / `ReduceNextHardSession` / `HoldVolume` / `ReduceVolume` / `ReviewPaceProgression`. Use the existing `WeeklyCoach`, `RemainingWeek`, `SessionAdjuster`, `LifeHappens`, `Replan` and generator caps as actual executors; do NOT duplicate their periodisation math. `SafeAutoCorrection` is restricted to proven conservative changes on eligible future easy/rest sessions and is reversible; pacing/volume/hard-work changes need explicit approval.
6. **Thresholds:** use existing training-volume caps (<=10% where existing generator permits), existing three-strong-week pace progression requirement, no volume+pace+difficulty increases in same week, one missed easy run does not trigger make-up mileage, no increase during race taper/pain/illness. If evidence doesn't meet pre-existing thresholds, answer `NoChange` or `Hold` rather than invent a new sports-science threshold. Any new cutoff must be a named constant with a boundary test.
7. **Output:** `AdaptationProposal` includes only runner-owned synthetic/eligible evidence, before/after complete session prescriptions (date, type, km, duration, pace, steps), weekly km changes, reason codes and proof of safety constraints. Apply a signed version-bound fingerprint; repeat preview is side-effect free, old token after run/move/midnight gives 409, decline suppression, undo, owner isolation and cross-device consistency.
8. **Frontend:** beside the completed run show concise `Run recorded · 5 km of your planned 8 km`; if a safe future-plan change is generated from ELIGIBLE evidence show `Your training has been adjusted` with undo; material suggestions `Review change`/`Keep plan`. Under Strava-only data, show accurate current run feedback but no fake claim that future prescribed training has automatically adapted from it. No AI chat, new modal for every run, provider search, upload nags or redesign.

### Concrete synthetic fixtures and expected outcomes

| Test | Synthetic recorded run(s) | Output |
|---|---|---|
| T01 | Scheduled 8 km easy, independently sourced run 5 km | Actual shown 5/8, completion recorded appropriately, future unchanged from single short run |
| T02 | Planned 50-min run/walk, track has 50-min motion and no reliable distance | Completed by duration, no made-up kilometres |
| T03 | Three complete strong independent training weeks, runner reports Ready, no pain, outside taper | Existing WeeklyCoach may offer a bounded pace progression *for future weeks* for review |
| T04 | One very fast independent 5 km | No automatic faster paces |
| T05 | Multiple independently confirmed missed hard sessions or prolonged break | Conservative resumption/replan review, no added make-up mileage |
| T06 | Hard long run moved beside intervals, no recorded run at all | Warn/evaluate neighbouring schedule from plan state, preserve user move |
| T07 | Synthetic duplicate run from watch/Strava-like fixture | Single run association, no double count |
| T08 | StravaTransient run 12 km against planned 10 km | Display short-lived 12/10 and comparison, **no** permanent coaching proposal or derived training record |
| T09 | Independent eligible run and Strava transient copy appear same day | No double count; keep independent eligible evidence separate and validate independently of Strava |
| T10 | Repeated sync events, 2 devices, stale proposal | Deterministic results, no phantom revised sessions, old apply 409 |
| T11 | One run with missing pace/HR/splits | No invented zone compliance, effort, recovery or interval success |
| T12 | Injury/pain, beginner, ultra run/walk, taper/race week | Safe hold/recovery, no aggressive upgrade |

**Implementation order:** (a) introduce the pure evaluator + synthetic input fixtures and safety tests; (b) wire it to the already permitted Taperday-owned schedule and independent evidence events; (c) extend run-analysis display using the existing transient Strava-completion pipeline; (d) add small proposal/review/undo UI and API; (e) demonstrate synthetic end-to-end scenario in Playwright; (f) leave live Strava performance-driven persistent adaptation DISABLED with an explicit documented contract blocker. This is a real code deliverable, **not another architecture-only handover**. A fake passing test is never described as evidence of live provider permission.

## 0. Hard execution rules

1. **DO NOT MERGE PR #295. DO NOT DEPLOY. DO NOT PUSH TO STAGING OR MAIN.** Work only on `fix/adaptive-coaching-no-chat`, which targets `staging`. A green CI pipeline is NOT approval. The owner expressly objected when PR #294 was merged without asking. Stop with a **draft PR ready for owner review**, not a deployment.
2. **Do not ask runners questions of an AI.** No chatbot, natural-language textbox, "Ask the coach", chat bubble, AI tab, AI consent screen, or external assistant connections in normal UX. No model call during sync, opening plan, moving a workout, or checking the week's progress. **A paid LLM is not required for this feature.**
3. **Strava is the PRIMARY connected run feed.** Runners use Garmin, Apple Watch or their phone as usual; Taperday syncs from their connected Strava account. Automatic ingestion, auto-completion and current progress must not require a manual FIT/GPX/TCX upload or a manual tick. Do not replace Strava with speculative Garmin/Apple API integrations.
4. **Strava policy permanently excludes one category under this scenario, not automation overall.** Under the Strava API Policy effective 1 June 2026, §§5.3–5.5, 5.16, 6.2, third-party AI/MCP use, analytics and durable derived data are restricted. **Do not send Strava API data or data derived from it to an LLM, AI/MCP agent, embedding store or external training service. Do not persist changed pace, volume, fitness estimates, training decisions, or runner declarations derived from Strava data absent written permission.** Do not infer permission from the athlete's OAuth consent. Use the existing transient `SyncedCompletions` read/display approach and existing cache limits only; do not expand sensitive processing by assumption. Full performance-driven permanent coaching *from Strava alone* is **OUT OF SCOPE under the assumed definitive Strava denial**. Document it as such rather than quietly implement a prohibited workaround. A request draft exists in `docs/invisible-adaptive-training.md`; **do not send it** without owner approval.
5. **Keep the original Taperday product.** Preserve Night Run dark/light design, cartoon runner and intro animation, bottom navigation, PWA support, mobile/tablet/desktop responsiveness, non-account plan builder, run/walk/Couch-to-5K and marathon/ultra support, race/recovery/post-race navigation, existing weekly recaps and calendar links.
6. **Synthetic tests only.** Never run migrations/Respawn against staging or production SQL. Never test with real runner accounts, tokens, Strava credentials, or paid API keys. Never commit secrets. Follow `docs/testing.md`. No co-authored-by or AI attribution in commits, PR body or code.
7. Work incrementally and keep PR #295's code, tests, docs and acceptance notes together. Do not open competing PRs; do not silently rebase away other peoples' changes. Inspect `staging` and `main` before changes and reconcile safely.

## 1. Definitive product: "Connect Strava once. Run. We handle the rest."

**Expected runner journey:**

- New signed-in runner sees an unobtrusive, clear, skippable `Connect with Strava` action near onboarding; OAuth completes, the existing six-week backfill queues, connection status is visible. Existing users should not see repeated connection prompts when connected.
- Runner records a workout on a watch or phone. Existing Strava webhook and durable `SyncJobs` ingest it, with retry, rate limit, late-upload handling and app-foreground catch-up; no manual operation required.
- When the run is a confident match, Today/Home, Plan, calendar day, weekly progress and the weekly recap show it as **Completed via Strava** immediately on refresh/foreground, *without writing a permanent check-in*. Its distance/time comparison may be shown transiently according to existing rules. Do not mark completion as prescribed tempo/interval success when only distance/time is known.
- If two runs, two planned sessions, a linked manual entry, upload on the same day, skipped session, timezone mismatch, or missing Strava metric makes the match ambiguous, **do not guess or double-count**. Show one small actionable resolution only where necessary.
- Moving/swapping workouts remains simple drag/drop or `Move run` on mobile. After the move, the **plan's own schedule** is evaluated for conflicts and safe recovery spacing without needing any LLM or an activity upload. A safe move with no conflict should result in no extra modal.
- Material future-plan edits (pace, weekly mileage, workout intensity, a key long-run replacement) require a single **Review change / Keep plan** decision with **Undo**, not chatbot interaction. The runner should not need to initiate a weekly conversation. No repeated proposal for an unchanged fingerprint after `Keep plan`.
- If data is insufficient, synced late or unsupported by provider rights, behave gracefully: keep original plan, don't invent a missed run or ask for a manual upload just to count today's displayed progress.

### Non-goals for this PR

- No replacement Strava provider, native Garmin or Apple app, HealthKit-in-a-browser claim, multi-provider integration platform, paid model, chat, external AI assistant onboarding, or redesign.
- No coaching recommendations derived from cached Strava speed/HR/distance/time that are saved for good, under this denial scenario.
- No feature that auto-creates a runner-authored check-in, auto-logs exercise metrics persistently from Strava, or bypasses 7-day source retention.

## 2. Existing code — re-use rather than rebuild

- `CLAUDE.md`: Clean Architecture, `.NET 10`, `Domain → Application → Infrastructure → API`, own CQRS dispatcher (not MediatR), `TimeProvider`, versioned plans, safety constraints and brand rules.
- `docs/strava-sync.md`: current Strava webhook, `SyncJobs`, 1/5/30/120-minute retry then longer retry, six-week backfill, throttled catch-up, seven-day transient cache, `RunCelebrator`, source attribution, reconnect flow.
- `src/StartLine.Application/Features/Sync/{StravaSyncRunner.cs,StravaWebhook.cs,StravaConnect.cs,StravaRecording.cs}`, `src/StartLine.Domain/Sync/`, `src/StartLine.Domain/Coaching/SyncedCompletions.cs`: actual sync and display model. Use `FakeStravaApi` in tests.
- `GET /api/v1/me/plans/{id}/strava-completions` and `client/src/features/coaching/useSyncedCompletions.ts`: transient matching/read display. `client/e2e/strava-completion.spec.ts` and `tests/StartLine.Integration.Tests/StravaCompletionTests.cs` are base regression harnesses.
- `client/src/features/plan/{MoveRunDialog.tsx,RescheduleDrag.tsx,PlanView.tsx}`, `src/StartLine.Domain/Plans/LifeHappens.cs`, `src/StartLine.Application/Features/Coaching/LifeHappens.cs`: move/swap/restore, existing preview token and original run identity. `client/e2e/move-run-dialog.spec.ts` and `LifeHappensTests.cs` already cover essential moves.
- `src/StartLine.Domain/Plans/{SessionAdjustment.cs,RemainingWeek.cs,SavedPlan.cs,TrainingPlanGenerator.cs,PlanProfile.cs,SessionSteps.cs}`, `src/StartLine.Application/Features/Coaching/{Coaching.cs,RemainingWeek.cs,Readiness.cs}`, `src/StartLine.Application/Features/AiCoach/{SessionAdjustments.cs,TrainingEvidence.cs}`: reuse safety caps, current week coaching, date/version fingerprints and permitted independent evidence.
- `src/StartLine.API/Controllers/{MyPlansController.cs,AiCoachController.cs,MyCheckInsController.cs,MySyncController.cs}`: existing runner-scoped API patterns; check actual routes before coding.
- `docs/flexible-training-week.md`, `docs/automatic-running-totals.md`, `docs/run-logging.md`, `docs/testing.md`: separate actual runs from original prescription, expiry, account boundaries, stale-token rules. Existing v1/v2 generator outputs MUST remain backwards compatible. **Do not change generator v1/v2 or snapshot hashes**; a new generated shape requires new generator version.

## 3. Required code slices (implement sequentially, not all-or-nothing)

### Slice A — Remove chat functionality completely from ordinary runner journey

**Already committed in PR #295:** remove `AiCoachPanel` rendering and `App.tsx` wiring; a regression test asserts chat controls aren't shown. Verify the code really has no new chat surfaces, even with prior `VITE_AI_COACH_ENABLED=true`.

**Complete:**
- Retire/disable the conversational `POST /api/v1/me/plans/{id}/ai/ask` endpoint and the old AI consent/status API if no other supported feature uses them. Prefer removing the route and unused client call paths; adjust integration tests that asserted conversational behaviour. Do not leave a reachable provider route simply by hiding the UI.
- Remove unused `AiCoachPanel` component, chat-specific styles/API types, question reader, provider calls and budgets only when references are confirmed and their deletion is safe. **Do not delete/migrate legacy DB tables or reversible runner history in this PR unless tests prove migration safety**; separate tidy-up if necessary. Preserve reusable `SessionAdjuster` deterministic safety and preview/apply services.
- Keep `AiCoach__Enabled` / MCP feature flags off in staging and prod. If deterministic `session-adjustment/preview` depends on the old flag, decouple it behind a dedicated `AdaptiveTraining:Enabled` flag (default false) or keep dormant until the new feature is tested. No unauthenticated new route, no paid model dependency.
- Remove `client/e2e/ai-coach.spec.ts` or replace it with invisible-adaptation acceptance tests; do not simply skip failing old AI tests. Verify no AI disclosure or opt-in appears when there is no AI processing.

### Slice B — Strava-first zero-touch reliability and status

**No new data provider.** Harden the existing Strava pipeline, do not duplicate it. Required:
- Check connection/OAuth success and skippable onboarding for runners with/without current plans; do not loop users through sign-in or Strava consent every app load.
- Webhook loss, cold-start/App Service F1 sleep, 15-minute/day rate limiting, late Strava upload or retroactive activity edit, deleted activity, token revoked, repeat webhook, duplicate fetch and synthetic two-device foreground requests: durable queue/backoff, bounded idempotent fetch and correct user-visible status. Preserve the established six-week backfill and ten-minute catch-up throttle unless tests demonstrate a justified change.
- After a successful import, ensure existing `useSyncedRuns`, `useSyncedCompletions`, Home/Plan/date detail/Calendar/Progress eventually refetch **without manual page reload or Check for runs**. Use existing foreground/visibility/store or invalidation facilities; avoid excessive polling and background work on every render.
- Preserve `SyncedCompletions.Of` match invariants: match by runner-local run date to the CURRENT moved-date plan, exactly one meaningful running activity and one checkable planned run, not on strength/rest/race, no conflicting manual status and no independently uploaded duplicate. A runner's Done/Skipped choice wins, conflicts are explained, no invented completion.
- Current display should make source and uncertainty clear; absent/expired/revoked runs disappear as existing policy requires and are not copied into a permanent summary. A normal matched run is not labelled "needs manual log"; reserve one-tap resolve for genuine ambiguity.
- Dedup identity across Strava sync, independently uploaded originals and separate manually declared entries. Do not silently convert a Strava activity into upload provenance.
- Measure `connection success`, `import success/failure`, `match rate`, `time to visible match`, `ambiguous-match count`, `stale-cache/reconnect` events. **Telemetry must not log athlete identifiers, activity routes, private activity details or imported distance/time.** Product target: **at least 95% zero-touch appearance of eligible runs**; this is a goal, **not an existing measured SLA**. CI can check algorithmic conditions, not claim population-wide target achieved.

### Slice C — Invisible schedule evaluation after runner-owned events

**Only owner-controlled inputs in persisted decisions:** original saved plan, user-requested move/swap/rest day, accepted prior revisions/weekly calls, local date, explicitly supplied readiness/illness/pain, and independently entered check-ins/uploads with clearly verified provenance. **The existence/absence/content of a Strava API activity is NOT an admissible source for a persisted adaptation decision.**

Introduce a small `AdaptivePlanEvaluator` (suggested name; follow architecture) with a pure-domain evaluator and an Application handler. It should run on:
1. Accepted `LifeHappens` move/swap/restore or chosen run-day change.
2. Independently logged check-in create/update/delete, independently uploaded recording add/delete, readiness update.
3. A new training week (lazily on authenticated plan read with bounded once-per-fingerprint evaluation if the F1 host slept). **Do not treat no Strava run as proof that the workout was missed.**

Compute a fingerprint containing `runnerId`, `planId`, saved plan rowversion, generator version/inputs, original requested move and existing `SessionRevision`, accepted `CoachWeek`, permitted evidence identifiers+version, readiness, runner-local date. Never use an imported Strava ID or metrics in this fingerprint for long-term stored decisions. Use `CoachCalls.LocalToday(runner, time)`, inject `TimeProvider`.

Classification contract:
- `NoChange`: no UI, no write.
- `WarningOnly`: existing moved session accepted, but quality/rest conflict cannot be safely corrected without approval; show an unobtrusive inline message, don't alter run dates or contents.
- `SafeAutoCorrection`: **ONLY** shifting an untouched rest/easy placement or easing/resting a future *easy/recovery* session to protect recovery; **never** new km, faster pace, extra day, changed strength/day of race, more hard intensity, a changed runner-selected moved workout, a logged day or changes to a hard workout. Ensure restoration is deterministic, clear and possible. If you cannot prove all those invariants, downgrade to `NeedsApproval`.
- `NeedsApproval`: replacing a key session, changing a tempo/interval workout, reducing a long run materially, adjusting pace zones/weekly progression, rebuilding future weeks or changing training load. No write until `Review change` + Apply on a current token. On `Keep plan`, do not show the same suggestion again until its fingerprint changes.

**Scope bounds:** affected days in the current week and at most the next 14 local days for immediate conflict corrections; longer future-week adaptations go through existing `WeeklyCoach` / `Replan` APIs and their safety rules and acceptance, not a second competing periodisation engine. Never touch the past, a completed/logged workout, archived/concluded plan, race or workout instructions that don't fit the adjusted prescription. Keep `SessionSteps`, run/walk/interval warm-ups, long-run limits, cutbacks, taper, strength/rest spacing and ≤10% supported progression. Do not "make up" missed kilometres.

**Move conflicts:** preserve exactly the date and session the user selected. A Sunday long run moved to Saturday adjacent to Friday tempo must result in a collision warning or a correctly gated conservative alternative for Friday—not another silent move of the Saturday long run. A Wednesday easy moved to Thursday with no conflict must cause **no** extra approval card, notification or replan.

**Concurrency, idempotency, history:** run the evaluator after successful event commit or use an event/outbox with replay-safe processing, not before; enforce unique evaluation key or equivalent durable dedupe (don't rely solely on in-process state); compare current version and recompute before Apply; return 409 on stale proposals. Two devices/offline replay/midnight/move-undo-move again must not create phantom/doubled workouts. Persist accepted or declined material decisions with no raw Strava data. Revision/undo must be auditable and not erase completed runs. Keep account export and deletion behaviour consistent with new records.

### Slice D — Minimal user-facing training updates, no assistant panel

**Location:** a quiet card near the current week or affected run, and a one-line Home status **only when a real plan change is auto-applied or pending review**.

Example exact copy (localised units and dates):
- Auto-safe: **"Your week has been adjusted."** "After moving your long run to Saturday, Friday is now a recovery day." Actions: **"See changes"**, **"Undo"**.
- Needs approval: **"A safer week is suggested."** "Your long run is now Saturday, next to Friday's tempo. Review an easier Friday." Actions: **"Review change"**, **"Keep plan"**. The compare view shows before/after date, type, km, estimated minutes, pace range, steps and weekly km.
- Sync: **"Run synced from Strava"** as appropriate; current UI may show "Completed via Strava." Do not display a "Please upload to personalise" banner for normal synced activities.
- Insufficient eligible evidence for faster pace: **no nag and no popup**. Keep pace unchanged; show a clear reason only if runner opens an existing training guidance detail.
- Two ambiguous runs: one contextual **"Choose which run matches"** action. No multiple forms.

Accessibility: keyboard, screen reader status without unsolicited focus jumps, mobile 320px/390px, tablet, desktop, reduced-motion, both dark/light. Reuse current fonts/colours/runner animation; preserve bottom navigation. No stacked cards on every home load.

**Consistency:** API plan DTO, current week, calendar day, personal calendar feed/ICS, Home next workout, Progress, weekly recap, workout detail and exported workout must reflect the same *accepted* revisions after refresh and across devices. A pending suggestion never changes those views. Historical prescriptions and actual running remain separate.

### Slice E — Clean API contracts and feature flags

Use existing `/api/v1/me/plans/{id}/life-happens/preview|apply`, `.../coach/proposal|apply|decline`, `.../remaining-week/proposal|apply` where they suffice. If one read-only adaptation endpoint is needed, use:
- `GET /api/v1/me/plans/{id}/adaptation` → `{ state: "none"|"warning"|"autoApplied"|"needsApproval", source: "schedule"|"independentRun"|"readiness"|"weeklyReview", reasonCode, message, affectedDates, before, after, weeklyKmBefore, weeklyKmAfter, token?, version }`. This response must have **no raw Strava metrics**. Ensure stable DTO field types and document in OpenAPI / generated client.
- `POST /api/v1/me/plans/{id}/adaptation/apply` → `{ token }`, runner-scoped, recompute and reject stale token with 409; no body-supplied arbitrary sessions.
- `POST /api/v1/me/plans/{id}/adaptation/decline` → `{ token }`, suppress same version/fingerprint, record no sensitive imported run data.
- `POST /api/v1/me/plans/{id}/adaptation/undo` → `{ decisionId }` or re-use `/adjustments/restore` when original date/type can be unambiguously restored. Undo must be idempotent and not revert a newer runner move or later completed run. Use 409 when unsafe.

Do not introduce these endpoints merely to duplicate existing working contracts: first check if `LifeHappens` and `ReviewCoachingCommand` can serve them. Whatever contract is chosen, write response examples, status codes (401/403/404/409/429) and generated TypeScript client updates. Do not leave stale client routes.

`AdaptiveTraining:Enabled` defaults **false** until owner authorises rollout. It may gate newly persisted automatic corrections separately from current trusted Strava completion, which must remain operational even with the adaptive flag off. Old `VITE_AI_COACH_ENABLED`, `AiCoach:ApiKey`, `AiCoach:McpEnabled` must not activate a chat panel or model calls. Keep the external MCP port disabled; do not offer it to runners.

## 4. Verification matrix — no shortcuts

A **pass** means the expected persisted state, visible UI and source/ownership boundaries match; asserting a request was sent is not enough. Extend existing domain, application, integration and E2E suites rather than building only mock screenshots.

| ID | Setup/action | Expected |
|---|---|---|
| S01 | New runner connects Strava and gets a normal single watch run | No manual upload/tick; one matched completion in Home, Plan, Calendar, Progress |
| S02 | PWA sleeping, late watch upload, missed webhook | Catch-up discovers run after foreground, no manual `Check for runs` |
| S03 | Duplicate webhook, concurrent catch-up, same activity refreshed | One run, one completion, no double counted distance |
| S04 | Token expired/revoked, rate limited, API temporarily down | Durable retry/status, reconnect only when required, no spurious missed day |
| S05 | Imported run 4.5km vs 6km prescribed | Shows participation and shortfall, never claims full prescribed quality |
| S06 | Timed beginner run/walk recording | Time-based completion matching; do not infer missing GPS distance |
| S07 | Two runs / two planned sessions in one local day | No automatic false match; one-tap disambiguation if applicable |
| S08 | Runner explicitly marked Skipped, later Strava run appears | Runner's mark wins; conflict displayed; no overwritten check-in |
| S09 | User independently uploaded same file / linked own log | No Strava provenance laundering, no double count |
| S10 | Cached Strava activity expires, is deleted or user disconnects | Remove transient completion; no stored Strava-derived weekly decision |
| M01 | Move Wednesday easy → free Thursday without conflicts | Move saved; no extra popup, notification or mileage change |
| M02 | Move Sunday long run → Saturday next to Friday tempo | Saturday stays; warning/valid conservative Friday proposal; no silent shift |
| M03 | Two devices move same session, stale token | 409 and fresh preview, no double move |
| M04 | Move, undo, repeat move, offline replays arrive | Deterministic final calendar; no ghost session or duplicate revision |
| M05 | Move near race/strength/completed past day | Existing hard constraints reject without damaging plan |
| E01 | One ordinary easy session not logged; Strava not yet synced | Do not presume missed; don't "make up" kilometres |
| E02 | Independent manual check-in or upload indicates pain/overload | Ease/hold through validated proposal, never speed up |
| E03 | Multiple valid independently sourced runs over weeks | Existing weekly coach may propose faster future paces only under current thresholds and approval |
| E04 | Strava-only athlete has many strong runs | Automatic current progress works; **no stored pace/volume progression from Strava** without written permission |
| E05 | Future week review/decline then repeat unchanged evidence | Once-only offer or no offer; preserve declined plan |
| E06 | Apply genuine future change then refresh, open another device | Same changed plan in Home/Plan/Calendar/Progress/ICS; Undo restores safely |
| E07 | Stale preview after new check-in/plan version or local midnight | 409, no accidental apply |
| U01 | 320px phone + 390px phone + tablet + desktop, light/dark | All controls legible and operable, no chat UI, accessible keyboard |
| U02 | Anonymous builder, signed-out user, second account's plan ID | Anonymous plan still works; forbidden reads/writes rejected |
| U03 | Older generator v1/v2 saved plan and historical race | Snapshots unchanged, archival and past workouts immutable |
| P01 | Inspect outbound HTTP to any model/MCP; Strava data seeded | **Zero** Strava data and **zero model calls in ordinary adaptivity** |
| P02 | Cross source + deletion of uploaded/manual evidence | Relevant pending proposal invalidated, no retained prohibited data |
| P03 | F1 idle, repeated app opens | Bounded work, no duplicate actions, no background model costs |

Also run all existing `StravaSyncTests`, `StravaCompletionTests`, `AdaptiveTrainingTests`, `LifeHappensTests`, `CoachTests`, `AiCoachTests` (replace retired chat assertions), `client/e2e/strava-completion.spec.ts`, `move-run-dialog.spec.ts`, `life-happens.spec.ts`, and new `adaptive-training.spec.ts`.

**Test infrastructure:** `FakeStravaApi`, `FakeTimeProvider`, `WebApplicationFactory`, disposable local SQL or GitHub CI SQL; do not call live Strava/Entra/AI in automated tests. Include a test for Africa/Johannesburg day boundary (UTC 22:30 is local next day), catch-up on a moved workout date, deletion after cache expiry, and explicit proof no restricted data enters any model payload.

## 5. Execution checklist for Claude — follow in this order

- [ ] **Preflight:** read this document, `CLAUDE.md`, `.claude/rules/engineering-principles.md`, `docs/testing.md`, `docs/strava-sync.md`, `docs/flexible-training-week.md`. Inspect current branch, files, open PRs and staging/main differences. Record baseline HEAD and check statuses. No cross-PR merges without owner permission.
- [ ] **Audit existing sync and runner journey:** trace real webhook→queue→import→cache→`SyncedCompletions`→Home/Plan/Calendar/Progress/recap; identify actual edge-case gaps, don't write a duplicate integration. Capture evidence in PR.
- [ ] **Finish chat retirement** and preserve independent deterministic coaching endpoints. Feature flags off and no UI even if old flags true.
- [ ] **Improve zero-touch Strava matching/refresh reliability** and handle ambiguous/conflicting dates, replays and outages. Add synthetic API and browser tests.
- [ ] **Implement adaptive schedule evaluator** from Taperday-owned move/readiness/eligible independent events with categorised safe correction/approval and optimistic concurrency, using current rules.
- [ ] **Add quiet update/review/undo UI** and ensure all plan representations stay consistent across reloads/devices.
- [ ] **Verify strict provenance/security:** no Strava-derived lasting coaching, no AI calls, no unsafe transformations, no account crossover, no race/past edits.
- [ ] **Update all docs**: this contract and `docs/invisible-adaptive-training.md` should agree; move old AI instructions under a clearly marked retired section or remove them from active handovers. Ensure latest Taperday privacy notice remains accurate; do not claim AI service use if not calling AI.
- [ ] **Run checks:** `dotnet tool restore`, `scripts/check.sh`, all backend and browser suites, 0 warning build, strict format, lint, typecheck, Playwright screenshot evidence. Disposable SQL only. If blocked by unavailable environment, state exact unrun checks; CI is supplemental, not proof of live E2E.
- [ ] **Document handoff evidence in PR #295**: exact commits, design choices, before/after mobile/desktop screenshots both themes, API before/after, migrations and backwards compatibility, test matrix S01–P03 with pass/fail/unverified, privacy/Strava remaining contractual blocker, rollout flags and how to revert.
- [ ] **STOP at draft PR.** Do NOT merge, promote to staging, run a production workflow, change App Service secrets or enable any flags. Ask owner for **explicit approval** after implementation and QA.

## 6. Specific rollback / rollout contract

Only after owner approval:
- Roll out to staging first; exercise a **synthetic** connected-run simulation (not real Strava account) and real PWA view on desktop and phone. Keep adaptive auto-write flag off until verified.
- Use current GitHub staging deployment conventions; do not introduce a second production server or new paid model usage.
- Rollback by disabling `AdaptiveTraining:Enabled` (if introduced) and redeploying the PWA, retaining saved runner moves and accepted training plans; **never** delete plan history or remove independently reported check-ins as part of rollback.
- Promote to production only on separate explicit owner instruction and documented smoke results.

### Exact agent instruction to paste (also in PR body)

> Work **only** in draft PR #295 (`fix/adaptive-coaching-no-chat` -> `staging`). Read `docs/claude-pr295-execution-contract.md` entirely. Build **Strava-first invisible adaptive training**, not an AI chatbot. Preserve automatic Strava ingest, catch-up, matching and transient completion; improve reliability and make manual uploads strictly fallback. Build deterministic automatic evaluation after runner-initiated calendar moves, readiness changes, and independently sourced run evidence; safe low-impact corrections may auto-apply, material pace/intensity/volume changes require review/decline/undo. **Never** persist coaching derived from Strava API metrics or send them to AI/MCP; mark this performance-adaptation dependency BLOCKED unavailable under the assumed Strava denial, and do not substitute manual uploads as the normal experience. Reuse Taperday's existing training rules, preview tokens, generator versions, auth and UI brand. Add source/isolation/concurrency/expired-cache tests, responsive dark/light browser screenshots and full CI evidence. Update this PR comprehensively. **DO NOT MERGE, DEPLOY, ENABLE PROVIDER SECRETS OR CHANGE PRODUCTION.**
