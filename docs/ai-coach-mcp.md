# Taperday AI coach and MCP pilot (opt-in)

This branch adds a small, **disabled-by-default** AI coach and a **read-only** remote MCP endpoint to the existing ASP.NET Core app. There is no new database or paid service tier. Do not merge until CI, staging, account isolation and privacy acceptance are tested.

## What it does now

- An authenticated runner can ask a question about their current plan.
- The provider receives the plan's next scheduled workouts, pace guidance and recent **independently entered check-ins**. Linked imported activities are excluded even when a runner entered some measurements themselves; this is deliberate.
- The inexpensive configured model (default: `gpt-6-luna`) can suggest a **shorter future workout** in 20, 30, 45 or 60 minutes. Taperday's existing `LifeHappens` domain engine computes the resulting safe distance and easy pace, returns a conflict-resistant preview token and rejects unsafe/past/completed/race-day choices.
- The runner sees the exact proposed distance and taps **Apply this adjustment**. A stale preview is rejected. The runner can restore the original later.
- A separate read-only MCP endpoint exposes `list_my_plans`, `get_training_plan`, `get_manual_checkins`. MCP never calls the AI API or Strava.

**Not implemented yet:** automatic increases in volume, changing goal race time, automatic edits across multiple weeks, arbitrary kilometre/duration goals, continuous agent background runs, chat history, external client OAuth onboarding, or device-based Strava AI analysis. Do not advertise these as shipping.

## Enable on private staging only

In the staging App Service configuration, add:

- `AiCoach__Enabled=true`
- `AiCoach__Model=gpt-6-luna` (optional)
- `AiCoach__ApiKey=<private AI project API key>`
- `AiCoach__McpEnabled=true` **only** if testing authenticated MCP access

In the staging GitHub environment **Variables**, set `VITE_AI_COACH_ENABLED=true` and redeploy staging through the documented flow. For production, leave all AI flags off until the privacy notice has been updated, consent reviewed and sign-in/authorization tests are green.

Never check the API key into GitHub. It must be configured only as a secret App Service setting. The PWA receives no API key. Disable by removing/setting `AiCoach__Enabled=false`; the PWA must also be rebuilt without the visible feature flag. Use only the Taperday Azure subscription, not a customer tenant.

For the MCP endpoint: `/mcp`, Streamable HTTP on the existing API, bearer-token authenticated with the runner's Entra `Plans.ReadWrite` scope. A generic third-party ChatGPT/Claude connection is **not** automatically enabled; supported OAuth onboarding, redirect URLs, audience and consent need separate design and testing. Do not bypass Entra by putting a permanent API token in a client.

## Cost controls

The API rate limits **model calls to six per signed-in runner per 24-hour fixed window** and asks produce no background AI calls. The model response is limited to 500 completion tokens and input is bounded to a 500-character question, 14 upcoming workouts and 24 manual check-ins. The MCP tools make no model calls.

The ASP.NET rate-limit buckets are **in-memory**, resetting on restart/scale-out, so they **are not a hard monthly money cap**. Set a dedicated provider-side spend limit/alert and monitor usage. For the initial pilot, start with a provider project budget of about USD $5 (roughly R90, exchange-rate dependent). Block any unauthenticated tools. Stop the pilot if Azure F1 CPU or request volume grows.

## Required security and QA before shipping

1. API off by default (503 for `ask`, status endpoint reports false); the frontend gate must be false by default.
2. Signed-out and wrong-scope users are rejected for `/mcp` and `/ai/ask`; runners cannot read or mutate each other's plan IDs.
3. AI prompt and MCP output contain **zero Strava-derived data**, including linked activities, imported summaries, expiry markers, IDs or analysis derived from synced runs. Never send Strava data into an LLM or a third-party MCP client. Strava 2026 API Policy §5.16 prohibits a third-party MCP server from exposing Strava data.
4. Test a malicious model suggestion, a previous-day workout, a completed workout, race day, an archived plan, invalid minutes and stale proposal; none can change training without runner confirmation.
5. Test clear, useful wording, narrow-screen/dark/light/reduced-motion display, network failures and repeat taps.
6. Do not log prompts, private history or provider responses. Verify PII redaction in telemetry. Review the existing privacy notice, retention and lawful basis before inviting real runners.
7. `scripts/check.sh` must pass with a **disposable local test SQL instance**. CI, not production SQL, runs integration tests. Review GitHub CI status and visual staging tests; never treat this document as proof that those tests passed.

## Roadmap after the pilot

- **Second slice:** allow an exact target time/distance on a specific future workout, bounded by the session's original distance, safe pace and existing recovery rules, with a signed preview token.
- **Third slice:** use independent uploads and check-ins for weekly fitness and load trends, then offer a proposed week-by-week pace/distance adjustment checked by the deterministic generator and weekly review rules.
- **Fourth slice:** cost dashboard, durable per-runner quota, audit trail, privacy opt-in and external assistant OAuth support. Only then consider opening MCP to real customers.

## Strava policy

Never reuse `GetRunningLogQuery(includeSynced:true)`, `strava-completions`, synced activity or cached import summaries in these services. Policy: https://www.strava.com/legal/api_policy . Strava's own first-party MCP is a separate product and does not authorize us to expose Strava data.

## References

- https://github.com/modelcontextprotocol/csharp-sdk
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/pricing
