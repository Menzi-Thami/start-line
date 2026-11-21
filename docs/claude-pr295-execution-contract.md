# PR #295 — Claude Code execution contract: Strava-first invisible adaptive training

**Owner-approved product direction as of 21 November 2026.** This file is the SINGLE SOURCE OF TRUTH for completing draft PR #295. It supersedes conflicting requirements in `docs/invisible-adaptive-training.md`, `docs/ai-coach-mcp.md`, PR #294 and older chat prompts. Read `CLAUDE.md`, `.claude/rules/engineering-principles.md`, `docs/testing.md` first. When an ambiguity remains, choose the safer, less intrusive, backwards-compatible behaviour below and state the choice in the PR. Do not improvise a new product direction.

## Scenario decision (21 Nov 2026): STRAVA SAID NO — no exception will be granted

**Treat a definitive denial as the product baseline. Do not re-request, reframe, hide, proxy or work around Strava's restriction by relabelling API-derived data or using an LLM, third-party MCP, browser extension, scraper, exported derivatives or fake user check-ins.**

Product strategy is **Strava-first for zero-touch current run display, independent-source-first for long-lived performance coaching**. Both source paths can coexist, but they are distinct data-provenance channels, not two labels for the same imported activity.

### Capabilities we WILL ship without Strava coaching rights

- **For every connected Strava runner:** preserve automatic Strava OAuth, webhook ingestion, 7-day rolling permitted transient cache, foreground catch-up, source attribution and on-read matching to scheduled sessions; show run completed and current progress without upload, manual entry, ticking, or chatbot. No permanent coaching decision from that data.
- **For all runners irrespective of provider:** automatically detect schedule conflicts after their own move/swap or change of availability; adjust truly safe future rest/easy spacing with reversible action, offer a clear before/after approval for hard-session changes, and apply conservative safeguards from runner-authored readiness/illness reports. Protect original race/date, training history, cutback/taper, completion and rest rules.
- **For athletes with separately authorised independent automatic activity data:** allow future pace/volume/intensity training adaptations through the existing deterministic WeeklyCoach after evidence/provenance validation and established approval, without any paid LLM. The independent feed must come **directly from an authorised device/service integration**, not Strava's API or a proxy. No false manual logging requirement.
- **For athletes with only Strava and no independent evidence:** show seamless present-day completion and schedule adaptation, but do **not** claim the plan has personalised future speeds or mileage using their Strava metrics. Do not ask them to upload every run or repeatedly display "insufficient training data"; simply leave pace progression unchanged unless their own allowed inputs justify it.

### Independent automatic source contingency — separately permissioned, not a primary-provider replacement

**Prioritise Garmin Business Starter feasibility**, because many existing Strava-first runners record on Garmin:
- Garmin Connect Developer Program **now lists Starter Business** access for startups/organisations, with Activity API JSON/.FIT, OAuth2 and **push delivery**; no historical-data backfill is listed for Starter and user capacity is limited. Request application credentials and review actual eligibility, commercial terms, scope and permission **before coding live ingestion**. Do not mistake "available program" for approved Taperday access. Relevant official pages:
  - https://developer.garmin.com/gc-developer-program/overview/
  - https://developer.garmin.com/gc-developer-program/enterprise/program-faq/
  - https://developer.garmin.com/gc-developer-program/enterprise/activity-api/
- Garmin **Personal API** is only for the individual account holder's personal use, **not** commercial/multi-athlete Taperday. Never ask all runners for personal API keys or share developer tokens as a bypass. https://developer.garmin.com/gc-developer-program/personal/personal-faq/
- **Polar AccessLink** is a second candidate where a runner uses Polar: self-service OAuth app creation and exercise webhooks; confirm exact license/retention and per-user consent. https://www.polar.com/polar-api-v4/
- For Apple Watch, a browser PWA cannot directly query HealthKit. An authorised **native bridge** or independent vendor feed would be a separately scoped future project, not an imaginary PWA capability. https://developer.apple.com/documentation/healthkit/setting-up-healthkit
- Do not substitute paid intermediary API platforms or scraping services without validating that **their own vendor data rights** allow persistent coaching; aggregation services do not erase Strava restrictions. No external provider subscription should be activated without owner approval.

**Architecture for a future eligible feed (design/specify now, implement adapter only if approved and testable):**
1. `ActivityOrigin` or equivalent distinguishes `StravaTransient`, `IndependentGarmin`, `IndependentPolar`, `ManualRunnerDeclaration`, `IndependentFileUpload`. Do not treat Strava-derived records as uploads. Explicit per-source eligibility for **persistent coaching** is false for Strava.
2. Source-scoped OAuth, per-runner consent, credential encryption, webhook authenticity, original source identifier, event replay dedupe, local timezone date, deletion/revocation handling, data minimisation, separate retention lifecycle.
3. Reuse `ActivityRecorder`, existing plan-matching, duration and pace calculations, and `CoachEvidence` for **eligible independently licensed sources only**. Do not add a parallel plan engine or combine Strava-derived metrics with other source measurements.
4. In the UI, show **one run** to the runner if two providers report the same underlying device recording, but keep per-source data segregated. A properly independently sourced activity may contribute to durable coaching; the Strava copy remains transient and must not be used to create/confirm the derived coaching result. Do not dedupe by copying Strava metrics or storing a Strava-derived permanent fingerprint.
5. Multiple providers should remain **optional**: Strava for current run progress, direct provider only when the runner wants fully automatic long-term performance adaptation and that vendor integration has been approved. The runner grants this second connection **once**, not for each run.
6. Product never promises unlimited athlete support, Garmin histories, live Apple Watch HealthKit sync, or same-day data availability until the relevant provider authorises and operational testing confirms them.

**Explicit status:** external Garmin/Polar permissions, credentials, costs and live vendor testing are **NOT VERIFIED**. Do not claim that a feature working with synthetic fakes proves a provider-approved integration. Build only the deterministic interfaces and test doubles now if actual permissions are absent.

### New acceptance cases for denial scenario (add to existing S/M/E/U/P checks)

| ID | Input | Required result |
|---|---|---|
| N01 | Strava-only runner runs 10 days consecutively, no manual logs | All eligible days show current transient completion automatically; no stored fitness/pace-derived adjustments |
| N02 | Strava-only runner moves a long run next to intervals | Runner's move persists; Taperday-owned plan schedule produces a safe warning/review without reading Strava activity metrics |
| N03 | Approved direct Garmin feed independently receives watch recording also visible via Strava | One current run shown; only Garmin-origin permitted metrics enter persistent coaching; no Strava metrics/IDs/derivatives retained in coaching |
| N04 | Garmin Starter access not granted, no independent feed | No imaginary integration or forced upload; existing Strava completion and schedule-based guidance remain fully usable |
| N05 | User disconnects Strava but retains independently approved Garmin feed | Transient Strava display removed; independent licensed source/history remains only as allowed by its own terms |
| N06 | Separate source loses consent or provider requests deletion | Delete that source's data and associated derived state as required; do not regenerate it from Strava cache |
| N07 | Runner uses Apple Watch with Strava but Taperday is still PWA-only | Automatic Strava display works; no claim of direct HealthKit data access |
| N08 | Client has old `AiCoach__Enabled` or `VITE_AI_COACH_ENABLED` flags | No AI chat, no model billing, no hidden derived coaching from Strava |
| N09 | Runner completed 5km of an 8km session via Strava | Current display shows a run, not falsely the full intensity; durable coach unchanged |
| N10 | Source disabled/reconnected, app sleeps, late duplicate activity arrives | Durable retries/match idempotence; no cross-source or cross-runner data leakage |

**Action for Claude:** implement all Strava and schedule functionality not blocked; document independent-feed interfaces and vendor approval gate, without fabricating provider authorisation. Do not stall P0 improvements waiting for vendor access. **No merge/deploy.**

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
