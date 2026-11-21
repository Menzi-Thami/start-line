> **Superseded 21 November 2026.** The AI chat coach and MCP were retired in PR #295; see [post-run rating](post-run-rating.md) and [the contract](claude-pr295-execution-contract.md). Kept for history only.

# Taperday AI Coach + MCP — complete agent handover (PR #294)

> **Status, 20 November 2026 (second pass):** the design now lives in [ai-coach-mcp.md](ai-coach-mcp.md), which is current. Built:
> exact time/distance/pace changes for one upcoming run (`SessionAdjuster`, previewed, stale-safe, undoable, run keeps its type);
> weekly adaptation routed to the existing weekly coach rather than a second engine; a rules-only question reader so the coach works
> with no AI; AI as an opt-in reader behind a strict schema, fail-closed durable budget, Strava-free evidence projection with uploads;
> stateless authenticated MCP with RFC 9728 discovery and a read-only `preview_run_change`. Still open, by design or for the owner:
> third-party MCP client onboarding (Entra has no dynamic client registration), the privacy notice change before production AI,
> a live provider test (needs a key on staging), and real-runner rollout. The sections below are the original brief, kept for history.

**Purpose:** Finish the end-to-end vision: a personalised, opt-in training coach that can recommend and, **with explicit runner approval**, modify future workout **distance**, **duration**, **target pace** and, when justified by independent evidence, the remaining **week-by-week plan**. MCP makes approved read-only training tools available to authenticated external clients. Keep the current PWA, brand, animations and light/dark modes; **do not redesign the site**.

**Owner's constraints (20 November 2026):** fewer than 10 active runners, comfortable piloting paid AI, initial target budget about **R100/month additional AI spend**, use current Azure hosting initially, protect existing plan functionality, use staging before production. AI is meant to be meaningfully **dynamic**, not only a chat window and not only shortening workouts.

## A. Current PR — precise status, no overclaiming

- Draft PR #294, branch **feat/ai-coach-mcp-pilot** against **staging**.
- The commit before this handover (07404718fdcaf5f65a4b10cc47da116afc3a384a) passed all ten jobs in GitHub Checks run **44717215964**: backend, frontend, four Playwright shards, iPhone WebKit, iPad WebKit, Android Chromium and desktop Firefox. Secret scan also passed. Those results do **not** establish live provider responses, real-user consent or production functionality. Re-run CI for the eventual implementation commit.
- Implemented: feature-gated runner AI ask endpoint with up to 14 upcoming non-race/non-strength sessions and up to 24 independently entered/unlinked check-ins; model suggests optional **ShortOnTime** on a future session, **20/30/45/60 minutes**; existing **LifeHappens** engine generates and validates a preview; user must click Apply. Backend uses **gpt-6-luna** via Chat Completions with store=false. Model calls limited to six requests per authenticated runner per day *in memory*.
- Implemented: three read-only MCP tools (**list_my_plans**, **get_training_plan**, **get_manual_checkins**), hosted on the existing ASP.NET API at **/mcp**, protected by existing runner authorization and off by default. External client consent/OAuth onboarding not tested or complete.
- Implemented: gated **AiCoachPanel** on own saved plan, API client methods, tests for ask vs apply vs cancel, API test for disabled-by-default and anonymous rejection.
- **Not implemented:** data-derived fitness adaptation across weeks, increasing safe distances/pace, arbitrary selected kilometres or minutes, coherent updates to structured workout steps/intervals, dynamic training-goal time suggestions, a persistent AI budget ledger, AI consent/retention flow, comprehensive AI provider mocking/contract tests, robust third-party MCP client onboarding, a live staging pilot.
- Do **not** merge or release merely because generic CI is green. New work must pass the additional conditions below.

## B. Product journeys and acceptance

1. **First-time runner:** no AI until signed in, privacy consent updated/accepted, explicit AI opt-in; preserve free no-sign-up plan building. An AI unavailable/off state must be understandable and never block plan creation.
2. **Ask:** from own active plan, ask e.g. “I only have 35 minutes tomorrow”, “I missed my tempo”, “Why is my easy pace so slow?”, “How should next week change after these runs?” AI answers using permitted independent training evidence, indicates insufficient evidence, and gives source/recency of evidence without exposing raw imported IDs.
3. **Adjust exact session:** user selects a future run, gives **time** (available minutes), **distance** (km), or **pace** (min/km, including work/recovery zones if applicable). Produce a **validated deterministic proposal** with before/after **date, type, km, approximate duration, easy/quality paces, steps and weekly total**. Unsupported or unsafe increases must yield “not recommended” rather than silently accepting.
4. **Weekly adaptation:** after manually logged training, independently uploaded activity, or weekly check-in, optionally *offer* progress-aware adjustment for next week/remaining weeks. Use existing **CoachEvidence**, **WeeklyReview/CoachWeek**, **Readiness**, **Replan**, **RemainingWeek**, **LifeHappens** and generator/versioning contracts. Guard against redundant recommendations. Do **not** make automatic saves or silently mutate plans.
5. **Apply:** provide an explicit compare/approve/decline flow. Apply only a frozen, current-plan, ownership-checked, stale-safe preview. Changes persist after reload, across mobile/desktop, in calendar, progress, workout detail and calendar feed. Support revert/undo without erasing actual logged runs. Preserve original prescribed sessions and completed weeks.
6. **Post-race:** concluded plans remain historical; coach may discuss recovery or a new goal but must **not** edit a concluded race plan. Maintain existing recovery, easy-running and “Train for another race” navigation.
7. **AI transparency:** disclose the limited evidence used (manually entered check-ins and eligible independently uploaded runs), that it is guidance not medical advice, that Strava is excluded, and that no change is applied unless accepted. Preserve the Taperday tone, Night Run colours, runner animation, responsive UI and reduced-motion behavior.

### Worked examples to test

- Original 8 km Easy tomorrow, user has 35 min: propose an allowed shorter easy run whose duration is feasible at the assigned easy pace, display actual rounded km and duration; never invent a session that won't fit.
- Original 6 km Easy, user asks for 10 km: only propose if a separately implemented and validated progression rule says the total weekly and recent load permit it; otherwise refuse increase with reason.
- User completes several independently recorded weeks at comfortably faster paces: recommend a conservative **future** pace-zone adjustment with justification and compare; do not change already completed workout target paces or past evidence.
- A runner is recovering from illness, reports pain affecting running, lacks sufficient independently sourced data, or is in race week: hold/ease training, require professional evaluation when warranted; no aggressive pace/volume increase.
- User requests moving a run: reuse existing safe date choices and constraints rather than inventing a shortcut around LifeHappens.
- A 42.2 km runner, a Couch-to-5K beginner, and an ultramarathon runner must receive plans consistent with their distinct generator profiles, cutback weeks, strength days, run/walk patterns and taper.

## C. Architecture, contracts and paths

**Do not let a model directly write session rows or bypass safety.** Keep the deterministic plan engine as authority.

Recommended flow:

**Runner PWA** -> authenticated **AI controller/orchestrator** -> **AllowedTrainingContext** (only runner-owned, explicitly eligible evidence with origin labels) -> model generates **structured candidate** (not executable) -> **Domain TrainingAdjustmentValidator** calculates and guards changes -> **Preview DTO with signed/hashed state token and full before/after diff** -> explicit **Apply** via application handler with optimistic concurrency, recomputation and logging -> refresh own plan/calendar/progress.

Build a dedicated domain service for adjustment candidates. Reuse existing `SessionRevision` and plan generator semantics where possible, but if the current revision cannot represent explicit paces, distances and structured interval steps across multiple weeks, **extend it safely** with migration/versioning and backwards compatibility, rather than collapsing structured workouts into generic easy runs. Reject stale/out-of-range changes, never alter original historical prescriptions or workout results.

Key code paths:

- `src/StartLine.API/Controllers/AiCoachController.cs` — initial model call and minimal proposal parsing.
- `src/StartLine.API/Infrastructure/TaperdayMcpTools.cs` — three read-only MCP tools.
- `src/StartLine.API/PresentationDependencyInjection.cs`, `Program.cs` — auth, rate limit, MCP route.
- `src/StartLine.Application/Features/Coaching/` — review, evidence, LifeHappens handler.
- `src/StartLine.Domain/Coaching/` and `src/StartLine.Domain/Plans/` — authoritative coaching/progression rules.
- `src/StartLine.Domain/Plans/SavedPlan.cs`, `RemainingWeek.cs`, `LifeHappens.cs`, `SessionSteps.cs`, `WorkoutBuilder.cs` — persistence semantics, safety and interval consistency.
- `src/StartLine.Application/Features/CheckIns/`, `Features/Activities/` — independent run evidence and provenance.
- `client/src/features/plan/AiCoachPanel.tsx`, `PlanView.tsx`, `client/src/lib/api-client.ts`, `client/src/app/App.tsx` — runner experience.
- `docs/strava-sync.md`, `docs/run-logging.md`, `docs/training-insights.md`, `docs/testing.md`, `docs/security-posture.md`, `docs/ai-coach-mcp.md`.

**Time ambiguity:** distinguish a runner's **race goal finish time**, **workout duration**, and **target pace (seconds/km)** in schemas, UI, validation and history. Do not translate user utterances into arbitrary training adjustments without enough specificity and verified context. If ambiguous, the UI should ask *one short clarifying question*.

**Time zone:** today's date and workout eligibility must use the **runner's own time zone** via current existing clock/runner logic. The pilot's `DateTime.UtcNow` filtering is a known gap. Provide a test near UTC midnight in Africa/Johannesburg. Workouts should always be shown and changed for the correct local date.

## D. Data source and Strava policy boundary

Strava's API policy restricts operating AI systems and third-party MCP exposure using Strava data. **Do not** expose cached Strava runs, activity metrics, derived training statistics, sync issues, linked imports, provider identifiers or incidental Strava-derived context to AI/MCP. Avoid `GetRunningLogQuery(includeSynced:true)` and `strava-completions` in all coaching tool paths. No “data laundering” by copying Strava numbers into a different DTO.

**Eligible evidence:** plan inputs and planned sessions generated by Taperday; verified independent manual check-ins; independently uploaded FIT/GPX/TCX source data that is proven non-Strava and consented. The existing pilot **does not yet fetch independent uploaded activities**; add an explicit provenance-aware query with tests for the source, conflicts and check-in association. Do not count the same manual check-in and upload twice. If an origin is uncertain, exclude it. Document tradeoffs and obtain legal/policy review before offering user-facing AI that relies on activity integrations.

Tests must inspect **the actual outbound model HTTP request payload** and **the actual MCP results**, seeded with mixed linked Strava/imported/manual data, to prove no restricted information leaks. Test race/results/history from which Strava-derived figures may have entered earlier workflows as well; review legacy derived records rather than assuming upstream purity.

## E. Security / cost / reliability requirements

- Existing Entra External ID remains the identity provider. Every tool and request is scoped to the validated runner; never accept client-supplied runner IDs. Test same-runner vs different runner and wrong scopes. No anonymous data or MCP metadata leakage.
- Remote MCP: verify real Streamable HTTP client negotiation, tools/list and tool execution against authenticated endpoints. Connecting external ChatGPT/Claude clients requires compatible **OAuth consent/onboarding** and token audience/security review; it is not done just because `/mcp` exists.
- Feature flags default off in staging/prod; avoid shipping dead controls to unauthenticated runners. API key server-side only. Add AI-specific informed consent and privacy notice updates before any real runner data is sent to a provider.
- Model output is **untrusted input**. Use structured outputs/schema validation and deterministic whitelist; reject malformed JSON, missing properties, arbitrary model text/tool instructions, unsafe targets, invalid dates/pace/volume, stale fingerprint or hidden edits. Parse failures must show friendly fallbacks and never throw unhandled 500/secret-bearing logs. Return clear `429`/`502`/timeouts, no internal/provider errors to client.
- **Durable spending control:** current in-memory 6/day limiter can reset when F1 restarts and is **not** a money cap; implement durable project/runner usage metering and fail-closed request budgeting if the hard target matters. Configure provider budget/alerts, verify provider spending-limit enforcement semantics, and monitor Azure F1 CPU and quota separately. Do not background-call AI on opening screens. Log request count, tokens and cost, no raw prompts or health details.
- Rate limits, total session cap, response size and timeout at all endpoints. No model-initiated transfers, external URLs or shell actions. Prompt injection must not override tool permissions or trigger writes.
- User can decline, restore, delete history and consent, and export/delete any AI-associated saved data. Define retention and avoid accidentally persisting chat context.
- Keep rollout owner-only initially (fewer than ten users total does not authorize auto-opt-in). A staging pilot may use only **synthetic test runners** until consent and isolation checks pass.

## F. Test matrix and definition of done

Before treating the **pilot** as mergeable:

- [ ] Fresh full `scripts/check.sh` + NuGet restore, dotnet strict formatting/build/tests, frontend lint/typecheck/Vitest/build/audit; disposable **local/test SQL only**, never production.
- [ ] Provider fake HTTP tests for successful JSON, malformed JSON, missing choices, 4xx/5xx, timeout, rate-limit, output too long, injected tool call, duplicate submit; verify **no plan writes** before confirmation and **exact original plan** after cancel.
- [ ] Account isolation tests for `ask`, `status`, `/mcp` and every tool; linked Strava data not present in model outbound request or MCP responses.
- [ ] Preview token tied to plan version and eligible new check-ins; stale apply returns 409. Race, past/completed/archived workouts immutable.
- [ ] UI dark/light/reduced motion, 320px mobile through desktop, keyboard + screen reader, errors/retries, reloading accepted adjustments, undo and history.
- [ ] Real staging MCP client auth/Streamable HTTP and synthetic AI-provider request test (subject to actual API project access); verify latency and F1 cold starts.
- [ ] Privacy notice, opt-in, budget and telemetry reviewed. Code/documentation delivered with screenshots and test evidence.

Before treating the **full dynamic AI coach** as done:

- [ ] Exact distance **and** duration adjustments (not just 20/30/45/60), with accurate pace/duration relationship.
- [ ] Specific pace/pace-zone adjustments validated against independent performance and training constraints; no invented personal bests.
- [ ] Coherent structured tempo/interval/recovery steps, volume totals, rest spacing, taper, cutback, run/walk and strength after every change.
- [ ] Week-to-week adaptation: explain data and uncertainty, propose preview, allow runner approval and rollback, respect race target.
- [ ] Calendar/Plan/Home/Progress/week review/ICS show consistent changed workouts on re-fetch; completed and archived runs unchanged.
- [ ] Regression tests for easy, long, tempo, intervals, beginner 5K, half/marathon, ultra, illness/pain and post-race.
- [ ] Durable budget control, audit trail, independent-uploads provenance and measured cost/latency from pilot.
- [ ] Authenticated MCP integration and external client onboarding demonstrated **if** making external assistant access part of release scope.
- [ ] Staging acceptance using real browser journey, no unexplained failures; production only through established release workflow after approval.

## G. Agent execution order

1. **Inspect** latest PR #294, branch diff and latest staging/main changes before coding; reconcile conflicts and do not overwrite others' work. Read `CLAUDE.md`, `docs/testing.md`, current docs and existing domain tests.
2. **Stabilise pilot** first: validate model API contract, fix time-zone bug, handle provider errors, write fake HTTP and data-provenance tests, verify MCP authentication. Capture tests/evidence in PR.
3. **Build independent-data projection + deterministic adjustment proposal** as new reviewed domain/API contracts, with explicit before/after diff and stale-safe apply. Integrate exact time/distance and then pace changes incrementally.
4. **Add weekly adaptation** reusing current generation/coach/recovery rules. Update all derived views, ensure no historical mutation, add browser/integration tests.
5. **Run complete QA** and update docs, CI evidence, screenshots, cost controls, privacy and rollout. Merge **to staging first only after checks pass**. Do not merge to production or enable provider flags without the owner's approval.

## H. Prompt for Claude Code / Codex

> Pick up Taperday draft PR #294 (`feat/ai-coach-mcp-pilot` into `staging`). Read `docs/ai-coach-mcp-handover.md`, `docs/ai-coach-mcp.md`, `CLAUDE.md`, `docs/testing.md` and the current PR diff. Finish the implementation of the runner's **dynamic AI training coach**: safe evidence-driven future workout duration, distance, target pace and multi-week adjustments, with Taperday's deterministic safety validation, explicit before/after preview, approval, rollback, consistent plan/calendar/progress display, runner-local dates, signed-in access, strict Strava data exclusion and durable AI budget controls. First stabilise and test the existing pilot and real MCP client/auth flow. Preserve Taperday colours, animations and responsive dark/light design. Use the current architecture; no independent AI plan editor or second paid host. Add full backend, frontend, provider-mock, MCP and browser QA. Never use production runner data for testing. Update this PR with commits, screenshots, exact tests/results, remaining risks and release instructions. Do **not** merge to production or enable paid model calls for real runners without explicit owner approval.

## I. Guardrail on claims

**GitHub CI passing does not mean the AI coach works end-to-end.** The provider's live behavior, external MCP client auth, cost enforcement, user consent and adaptive training correctness each need separate evidence. Do not represent a pilot implementation or this handover as a completed production feature.
