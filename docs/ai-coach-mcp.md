# Taperday coach (#294): retired AI chat and MCP, kept exact run changes

> **Retired 21 November 2026 (PR #295).** The owner doesn't want a chat coach, an AI provider or an MCP server. Removed: the
> `ai/status`, `ai/consent` and `ai/ask` endpoints, the question reader, the AI budget, the OpenAI client and its settings, the MCP
> server and its metadata, the coach panel and `VITE_AI_COACH_ENABLED`. Those routes now answer 404 even with the old
> `AiCoach__*` settings present. Kept: the rules-only exact run changes below (`SessionAdjuster`), now on `MyPlansController`
> with no flag and no screen, and the data already saved (`Runner.AiCoachConsent`, `AiUsageDays`, both in the account export and
> deleted with the account; no destructive migration). What replaced the coach: [post-run rating](post-run-rating.md).
> The rules section is current; the rest of this page is history.


> **HISTORICAL PR #294 DESIGN — SUPERSEDED for PR #295.** The product owner does not want runner-facing AI chat or an MCP-based assistant experience. The active specification is [Strava-first invisible adaptive training](claude-pr295-execution-contract.md). Do not enable chat, provider flags or MCP or implement the old rollout from this document. Do not merge/deploy without approval.

Off by default everywhere. Three layers, each usable without the next:

1. **Exact run changes (rules only, no AI).** A runner picks one upcoming run and asks for a **time** (the minutes they have), a
   **distance** or a **pace**. `SessionAdjuster` (Domain) decides: *Suggested change*, *No change needed* or *Not recommended*, always
   with a reason. The runner sees the run before and after and the week's total, and applies exactly that preview.
2. **Questions in words.** "I only have 35 minutes tomorrow", "make Saturday 18 km", "run my easy at 6:15/km", "how should next week
   change?". Taperday's own reader (`RulesIntentReader`) understands these without any AI. With the runner's agreement, and only when a
   provider key is configured and the budget allows, an AI model reads the question instead. **The model never changes a plan**: it
   returns a structured request that goes through the same rules and preview as layer 1.
3. **MCP (read-only).** Authenticated tools for a runner's own assistant: their plans, their own training, and "what would this change
   do" previews. Nothing writes.

Weekly adaptation (future weeks) is **not** a new engine: the existing weekly coach (`WeeklyCoach`, the weekly review in the plan)
already holds, eases, steps up or cuts back next week, and updates paces from logged and uploaded runs, with its own
review/apply/decline. The coach sends "how should next week change?" there.

## The rules (SessionAdjuster)

Every number is a named constant with a test (`SessionAdjusterTests`).

| Ask | Steady run (easy, recovery, easy + strides, long, medium-long) | Hard session (tempo, intervals, hills, progression, race pace…) |
|---|---|---|
| Shorter distance | Same run, same pace, new distance | Becomes an easy run of that distance: hard work isn't squeezed |
| Longer distance | Up to +20% of the run as written, the week up to +10% of the week as written, never past the plan's longest run, never as long as the week's long run, recovery runs ≤ 8 km. **Refused** in taper and race week, and after pain or a niggle in the last 14 days | Refused |
| Time available | Shortened to fit at the **slow** end of its pace; no change if it already fits; under 1 km becomes rest | Easy run that fits, if the session doesn't |
| Pace | Slower: allowed up to 25% slower than the slowest of its zone, as a ±10 s band. Inside the zone: no change. **Faster: refused** (faster paces come from evidence via the weekly coach) | Refused: hard sessions keep their paces |

Always: only today to 13 days ahead, never a past day (the runner's **local** date), a logged run, strength or the race; only the
current plan. Growth is measured from the plan **as written**, so repeated changes can't compound. `SavedPlan.ApplySessionAdjustment`
re-checks the hard limits before saving.

A change is stored as a `SessionRevision` with the new optional `Type`: the run keeps its type (a long run stays a long run, with its
run/walk). Older revisions without `Type` behave exactly as before. Undo is the existing **restore** (`/adjustments/restore`), which puts
the day back as the plan first wrote it.

## API

All under `/api/v1/me`, runner scope required, 503 when `AiCoach:Enabled` is false.

| Endpoint | What |
|---|---|
| `GET ai/status` | `enabled`, `modelAvailable` (enabled and a key configured), `consent`, `aiQuestionsLeftToday` |
| `PUT ai/consent` `{consent}` | Give or withdraw AI agreement (`Runner.AiCoachConsent`, `AiCoachConsentChangedAt`) |
| `POST plans/{id}/ai/ask` `{question}` | Answer + `intent` + optional checked `adjustment` preview + `offerWeeklyReview` + `evidence` summary + `source` (`Rules`/`Ai`) + `notice`. Never writes the plan |
| `POST plans/{id}/session-adjustment/preview` | The checked preview with a token (only when proposed) |
| `POST plans/{id}/session-adjustment/apply` `{request, token}` | Applies exactly that preview; **409** if the plan, a check-in or the day changed |

## Data boundary (Strava)

Strava's API policy does not allow Strava data in AI models or third-party MCP servers. The only door from training into the AI and
MCP is `TrainingEvidence` (Application/Features/AiCoach):

- **In:** check-ins the runner typed (status, distance, time, effort, pain), and **uploaded** files (`ActivitySource.Upload`): date,
  distance, moving time, pace. A check-in on an upload is merged into one entry, so nothing counts twice.
- **Out:** every Strava activity; every check-in linked to a non-upload activity (even numbers the runner typed on it), counted as
  `excludedLinkedRuns`; heart rate; routes; names, emails, ids. Never `includeSynced`, Strava completions or the sync cache.
- The provider gets: today, the race date, distance and goal, pace zones, the next 14 sessions and the evidence above. Tested on the
  **actual outbound HTTP body** (`AiCoachTests.With_consent_the_provider_gets_only_the_runners_own_training_never_strava_names_or_ids`)
  and on actual MCP results.
- An uploaded file could itself have been exported from Strava by the runner. That's the runner's own export, not API data; if this is a
  concern, get a policy view before enabling AI for real runners.

## AI provider and cost

`OpenAiCoachModel` (Infrastructure) calls Chat Completions with `store: false`, no tools, and a **strict JSON schema**. The question is
fenced and labelled as data. Its output is untrusted: malformed JSON, a cut-off answer, a refusal, tool calls, unknown actions, bad
dates, out-of-range numbers, errors, timeouts (20 s) and responses over 64 KB all become "unavailable", and the coach answers from its
rules with a notice. Nothing about the question or answer is logged or stored.

**Budget (durable, fail closed):** `AiUsageDays` counts calls, tokens and estimated cost per runner per UTC day. A call is counted
**before** it's made. Past `AiCoach:DailyCallsPerRunner` (default 6) or past `AiCoach:MonthlyBudgetUsd` across all runners (default
$5 ≈ R90), no call is made and the rules answer. Prices (`InputUsdPerMillionTokens` 1, `OutputUsdPerMillionTokens` 4 by default) are
deliberately above typical small-model prices so the cap trips early; set them to the chosen model's real prices. Also set a spend
limit in the provider's dashboard: this cap is an estimate. A burst limit (30 questions an hour per runner, in memory) sits in front.
At ~1,000 input and ~80 output tokens a question, six questions a day for ten runners is roughly 1,800 calls a month.

## Settings

| Setting | Default | Where |
|---|---|---|
| `AiCoach__Enabled` | false | App Service. Turns on the coach (rules layer and endpoints) |
| `AiCoach__ApiKey` | — | App Service **only**, secret. Without it, no AI: the rules answer |
| `AiCoach__Model` | `gpt-6-luna` | App Service, optional |
| `AiCoach__ReasoningEffort` | unset | Optional; sent only when set |
| `AiCoach__DailyCallsPerRunner` | 6 | |
| `AiCoach__MonthlyBudgetUsd` | 5 | |
| `AiCoach__InputUsdPerMillionTokens` / `__OutputUsdPerMillionTokens` | 1 / 4 | Set to the model's prices |
| `AiCoach__McpEnabled` | false | Maps `/mcp` and its metadata |
| `VITE_AI_COACH_ENABLED` | unset | GitHub environment **variable**; shows the panel in the PWA |

Turn off: `AiCoach__Enabled=false` (endpoints 503) and unset `VITE_AI_COACH_ENABLED` (panel gone after the next deploy).

## MCP

`/mcp`, Streamable HTTP, **stateless** (survives the F1 plan sleeping), on the existing API: no second paid host. Needs the runner
scope; a token without it gets 403, no token 401 with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"`.
That metadata (RFC 9728, public, names no runner) points at the Entra External ID tenant.

Tools: `list_my_plans`, `get_training_plan`, `get_my_training` (the `TrainingEvidence` projection), `preview_run_change` (the
adjuster, without a token: the runner applies changes in Taperday).

**Connecting a third-party assistant is not done.** Entra External ID has no dynamic client registration, so ChatGPT/Claude-style
connectors can't register themselves. A client that accepts a pre-registered client id would need its own app registration in the
tenant with its redirect URIs and the `Plans.ReadWrite` scope, then a consent and audience review. Tested: real protocol negotiation,
`tools/list`, tool calls, isolation and Strava exclusion through the test sign-in (`AiCoachTests.Mcp_…`). Not tested: a real Entra token
from an external client.

## Privacy

- AI is **opt-in** per runner, off by default, explained where it's switched on, and can be withdrawn at any time.
- No question, answer or chat history is stored. `AiUsageDays` holds counts only, is in the account export (`aiCoach`) and goes with the
  account (cascade delete).
- **Before AI is enabled in production**, the privacy notice must change: it currently says Taperday doesn't use AI
  (`client/src/features/account`, "We don’t sell your data, show ads or use AI"). Proposed wording: "We don’t sell your data or show
  ads. If you switch on AI help in the coach, your question, your plan and the runs you logged or uploaded are sent to our AI provider
  (OpenAI) to understand it; nothing is kept by them or us, and Strava data is never sent." Decide whether this needs a new notice
  version (all runners re-accept) under POPIA.

## Rollout

1. Staging with synthetic runners only, `AiCoach__Enabled=true`, no key: the rules layer end to end.
2. Staging with a key on a provider project with a hard spend limit, `AiCoach__MonthlyBudgetUsd` low: the AI layer.
3. Privacy notice updated; owner approval.
4. Production: `AiCoach__Enabled=true`, key, and `VITE_AI_COACH_ENABLED=true` in the production environment, via the release workflow.
