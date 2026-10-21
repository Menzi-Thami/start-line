# Strava sync

Runners connect Strava once and their runs arrive by themselves, judged against the plan exactly like a .FIT upload.
Uploading stays as the fallback (and for anyone not on Strava).

## Why Strava, and what it costs

Garmin's own developer program is business-only and closed to new applications, so Strava is the realistic route
for Garmin runners (Garmin Connect syncs to Strava for free). Checked 19 Oct 2026:

| Route | Free for a solo developer? | Notes |
|---|---|---|
| Strava | No: since 1 Jun 2026 a Standard-tier app needs the developer to have a paid Strava subscription (about US $11.99/month or $79.99/year; reported by the press, not stated in Strava's agreement). Runners connecting need nothing. | 1 athlete at first, 10 after a self-upgrade, more only after Strava reviews the app |
| Polar AccessLink | Yes | Signed webhooks, FIT and samples, last 30 days. The obvious second provider |
| Suunto | No ("we currently don't offer the API access for personal use") | |
| COROS | Self-service, but polling only and 50 files a day | Partner API needs a company |

Rate limits (per app, shared by every runner): 200 requests per 15 min and 2,000 per day overall; reads 100/1,000
(200/2,000 after the upgrade). Windows reset on the quarter hour and at 00:00 UTC.

## What Strava's API Policy (1 Jun 2026) means here

- **6.2: "You may not retain Strava Data in your cache for longer than seven (7) days."** A synced run is a
  cache: `Activity.CachedUntil` is 7 days after it was fetched, a daily `Refresh` job re-fetches anything with
  under 3 days left, lapsed copies are hidden from every read (`ActivityQueries.Visible`) and deleted on the next
  worker pass. Reading "refreshed at least every 7 days" as compliant is Taperday's interpretation, sent to Strava
  for confirmation before going past single-athlete mode.
- **5.4: no combining Strava Data with other customer data.** Uploads and synced runs are never merged: an upload
  of a synced run replaces the copy, and a synced copy of an uploaded run is skipped.
- **5.7: location.** Streams are requested as `time,distance,altitude,heartrate`; `latlng` is never asked for.
  Heart rate from Strava is kept only for runners who gave Taperday's separate heart-rate consent; for everyone else
  it's dropped before the run is recorded, like any upload.
- **6.3 / 7.4 / 2.5: deletion.** Activity deletions and revocations are queued at `Delete` priority and need no API
  call, so they never wait for the rate limit. Disconnecting revokes at Strava, deletes every synced run and says so
  on screen (the written confirmation).
- **2.3 / 6.1: display.** A runner's Strava runs are only ever shown to that runner.
- **5.3: AI.** Taperday sends nothing to any AI service.
- **Brand.** Official, unmodified "Connect with Strava" button and "Powered by Strava" logo (`client/public/strava/`,
  from developers.strava.com/guidelines), smaller than Taperday's own name; every synced run links back with
  "View on Strava"; runs recorded on Garmin say so (Policy 4.4).

## How it works

```
Strava ──push──▶ POST /api/v1/webhooks/strava/{hookSecret}   (anonymous, rate-limited, answers in < 2 s)
                   │ checks subscription id + connected athlete, then only queues
                   ▼
                 SyncJobs table  ◀── connect (Backfill, Refresh), plan opened (CatchUp)
                   │
                 StravaSyncWorker (sleeps until woken or the next job is due)
                   │ IStravaSync.RunDueAsync: GET activity + streams with that runner's own token
                   ▼
                 StravaRecording ─▶ ActivityRecording ─▶ ActivityRecorder ─▶ Activity.Record (same as uploads)
```

- **Events are unsigned**, so an event is only a hint: it's checked against our subscription and a connected athlete,
  then the run is read from Strava with that runner's token. A forged event can at most cost one read.
- **Jobs** are durable (the free App Service plan sleeps). Retries back off 1 m, 5 m, 30 m, 2 h, 12 h, then the job is
  marked failed and the runner is told; failed jobs are forgotten after a week. A 401 marks the connection
  `NeedsReconnect`. Duplicate events for the same run collapse into one job.
- **Rate limit:** `StravaRateGate` reads Strava's usage headers on every response and stops background work at 90%
  until the next window, leaving room for runners connecting or disconnecting.
- **Catch-up:** the free plan can miss Strava's 2-second deadline while it wakes up, so opening the plan also asks
  Strava for anything since the newest synced run (at most every 10 minutes).
- **Database:** the worker never polls while idle, so the Azure SQL free offer can still pause.
- **Backfill:** connecting fetches the last 6 weeks (`StravaCache.Backfill`), enough for the trend and volume charts.

## Tokens

`ProviderConnection` holds the athlete id, scopes and both tokens, encrypted with ASP.NET Core Data Protection
(purpose `StartLine.Sync.Tokens.v1`). The key ring lives in the `DataProtectionKeys` table and, in Azure, is wrapped
by the `data-protection` key in Key Vault (`DataProtection__KeyVaultKeyUri`), so a copy of the database alone can't
decrypt a token. Outside development the API refuses to start with Strava configured and no Key Vault key. The
connection is deleted with the runner (cascade), and Strava is asked to revoke first. The account export lists
connected services but never token values. The OAuth `state` is encrypted, names the runner who started connecting,
and expires after 15 minutes; a callback for another account is refused.

Scope: `read,activity:read_all`, so runs kept "Only You" are judged too. A runner who unticks activity access
on Strava's page is refused with an explanation.

## Code map

| | Where |
|---|---|
| Cache rules, origins | `Domain/Activities/ActivityOrigin.cs` (`StravaCache`) |
| Connection, jobs, retries, rate windows | `Domain/Sync` |
| Strava interface, settings, token and state protectors, rate gate | `Application/Features/Sync/StravaAbstractions.cs` |
| Strava streams to a recording | `Application/Features/Sync/StravaRecording.cs` |
| Connect, status, catch-up, disconnect | `Application/Features/Sync/StravaConnect.cs` |
| Webhook verification and events | `Application/Features/Sync/StravaWebhook.cs` |
| The work itself | `Application/Features/Sync/StravaSyncRunner.cs` |
| HTTP client, options, Data Protection, worker | `Infrastructure/Sync` |
| Client: account section, brand marks, callback, polling | `client/src/features/sync` |
| Client: Overview tab | `client/src/features/dashboard` |

Tests never call Strava: `tests/StartLine.Integration.Tests/FakeStravaApi.cs` stands in for it, and
`HttpStravaApiTests` checks the real client against canned responses.

## Developer Program compliance (for the app review)

What Strava's Developer Program asks for, and where Taperday meets it. This is the checklist to point the review at.

| Requirement | Status |
|---|---|
| A Strava subscription on the developer account | Done (the account that owns Client ID 289205). |
| OAuth 2.0 auth-code exchange; 6-hour access tokens refreshed with refresh tokens | `HttpStravaApi` + `StravaTokens`: exchange, refresh 5 min before expiry, rotated refresh token re-encrypted. |
| **No AI use of Strava data** (no AI coaching or plan generation on Strava data) | Taperday has **no AI**. Plans and run analysis are deterministic code. If AI is ever added, it must not touch Strava data. |
| A complementary experience, not a clone of Strava's features | Taperday builds training plans and judges each run against its planned session, goal pace and zones. It doesn't replicate Strava's feed, leaderboards or segments. |
| Official "Connect with Strava" button; brand orange only where allowed | The official button SVG, unmodified; "Powered by Strava" near synced data; "View on Strava" on each run. |
| Never expose tokens, refresh tokens or the client secret | Tokens are encrypted at rest and never logged, exported or returned. The webhook secret is kept out of traces. **Action: the client secret was shown in a chat and must be rotated.** |
| Webhooks, not polling, for updates and deauthorisations | One push subscription (id 377962); the worker reacts to events, with a catch-up only when the app is opened. |
| Works for up to 10 athletes before review; submit to go further | Capacity is at 10. Submit the review form once there's real usage: https://share.hsforms.com/1VXSwPUYqSH6IxK0y51FjHwcnkd8 |
| Within rate limits (200/15 min, 2,000/day; 400/4,000 after upgrade) | `StravaRateGate` reads Strava's usage headers and stops background work at 90%, leaving room for runners connecting. |
| A lawful privacy policy (Policy 7.3) | Published at `/?view=privacy` (linked from every page's footer). It names synced runs, the 7-day cache, heart rate and the contact, and runners accept it (version `2026-10-21`) before connecting. |

Open actions are in `security-posture.md` → To do.

## Switching it on (Thami's steps)

1. Subscribe to Strava on the account that will own the API app.
2. On strava.com/settings/api, create the app: name **Taperday** (no "Strava" in it), website the live site,
   **Authorization Callback Domain** the web app's host (`localhost` for a local test app). Upload the Taperday icon.
3. In the API's App Service settings (never in the repo):
   - `Strava__ClientId`, `Strava__ClientSecret` from that page
   - `Strava__RedirectUri` = `https://<web host>/strava/callback`
   - `Strava__VerifyToken` and `Strava__HookSecret`: two random strings of 24+ characters, e.g. `openssl rand -hex 24`
4. Redeploy `infra/main.bicep` once so the Key Vault key and `DataProtection__KeyVaultKeyUri` exist.
5. Create the push subscription (once per app):
   ```bash
   curl -X POST https://www.strava.com/api/v3/push_subscriptions -F client_id=$ID -F client_secret=$SECRET -F "callback_url=https://<api host>/api/v1/webhooks/strava/$HOOK_SECRET" -F verify_token=$VERIFY_TOKEN
   ```
   It answers `{"id": 123456}`: set `Strava__SubscriptionId` to that id. Until it's set, events are ignored (catch-up
   still works).
6. Upgrade the app's capacity to 10 athletes from the same settings page when ready. Before asking Strava to review
   it for more, email developers@strava.com about Policy 5.4 and 6.2 (the 7-day cache and plan matching).

## Strava changes already announced

- 4 Jan 2027: base URL `api-v3.strava.com` (`Strava__ApiBaseUrl`).
- 1 Jun 2027: tokens in headers only, and `/oauth/deauthorize` becomes `/oauth/revoke` (`Strava__DeauthorizePath`).
