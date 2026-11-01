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
  of a synced run replaces the copy, and a synced copy of an uploaded run is skipped. Home's current display now resolves
  the runner's saved history and valid cached measurements on each read, with Strava contributions labelled and no
  materialised aggregate or copied imported measurements. The saved-only API remains the default; `includeSynced=true`
  opts into this transient view. See [automatic totals](automatic-running-totals.md). This does not change cache retention,
  source-record separation or the provider-policy review needed before expanding beyond single-athlete mode.
- **5.3 and 5.5: derived data.** Anything "derived from, aggregated from ... or generated using Strava Data" is held to
  the same 7 days, and none of it goes in a lasting index. So nothing Taperday keeps for good is worked out from a synced
  run:
  - **The coach's weekly call** (`CoachWeek`, kept for good so a plan never changes after the fact) is made only from
    check-ins and uploaded runs (`CoachEvidence`): no synced run counts as evidence, and the fitness estimate behind a
    call's paces uses uploads' best efforts only. Calls made before 26 Oct 2026 may have used a synced run.
  - **The saved-only running log** (`RunningLog.Of`, default `GET /me/running`) counts ticked sessions at their planned distance (the
    runner's own distance if they gave one; half for a run cut short, as the coach counts it) and uploads at their
    measured distance. A day with an upload counts the upload and none of that day's ticks. Home's read-only current
    totals use `RunningLog.WithSynced` instead, resolving valid activity associations once, preferring independently
    entered distances and excluding expired imports. These calculated figures are not persisted or cached for reuse.
- **Completed via Strava: computed on read, never stored (#177).** While Taperday holds a Strava run that matches a
  planned running session, that session shows as completed "via Strava" on Home's Today card, the week, the calendar,
  the day summary, the week's "x of y done", Home's "This week" ring and the weekly review, and it counts in adherence
  (training insights, the progress story) and the weekly recap's "planned sessions run". It is worked out on each read
  by `SyncedCompletions.Of` (`Domain/Coaching/SyncedCompletions.cs`) and served by
  `GET /api/v1/me/plans/{id}/strava-completions` (`no-store`). **Nothing is written**: no check-in, no flag, no copy of
  the distance. When the cached copy lapses (`ActivityQueries.Visible`), the athlete disconnects or revokes access, or
  the run is deleted on Strava, the run is gone and the session falls back to whatever the runner ticked. The client
  asks again when check-ins or runs change, when the app returns to the front and at the earliest `cachedUntil`.
  - **Matching** (all must hold, or nothing is completed): the run's local date (the runner's time zone, as at import)
    is the session's date; exactly one checkable running session that day (never strength or rest days, and not race
    day, which isn't checked in on); exactly one meaningful run that day; that run is from Strava with no upload the
    same day (an upload is already the runner's own evidence); and the run isn't linked to a check-in or logged as an
    extra run. Two running sessions or two runs in a day are ambiguous: no completion.
  - **Meaningful run**: at least 1 km *or* at least 10 minutes of moving time (`SyncedCompletions.MinKm`, `MinTime`), so
    a GPS blip or a jog to the shop doesn't count but a treadmill run with no distance does. Non-runs (rides, walks)
    are never imported.
  - **Shorter and longer runs complete the session too**: completion means the runner showed up and ran. The feedback
    says how it compared, within ±10% being near (`NearShare`): shorter "You got out there — that counts. You ran
    {actual} of your planned {planned} today. …", longer "Nice work getting your run in! You covered {actual} against
    {planned} planned. …", near (or nothing to compare, such as a treadmill run with no distance) "Run recorded. Nice
    work showing up today." It never claims the prescribed workout was met. A session whose steps are all timed (run/walk
    intervals such as Couch to 5K) is judged by moving time against the steps' total time, not distance
    (`SessionPrescription`); every other session by distance.
  - **The runner's word always wins.** A Done, cut-short or swapped check-in hides the computed completion. A skipped
    session stays skipped and the matching run is shown beside it as a conflict ("You marked this skipped. Strava has a
    6.4 km run on this day."), with one tap to change the answer. Nothing is silently overwritten.
  - **No double counting.** An upload of the same run replaces the synced copy (below), so it counts once, as an upload.
    Running totals already count a held run once through `RunningLog.WithSynced`; a computed completion adds no tick, so
    it adds no distance.
- **Keep this tick: the runner's own data.** A synced run doesn't count for good; the runner's word that they ran the
  session does. "Completed via Strava" offers **Keep this tick**: one tap saves a plain "Done" check-in with no effort
  and no activity link, through the usual check-in API, and that lasts after the Strava copy goes. **Taperday never
  ticks a session itself**: a stored tick is always a tap by the runner. The coach's weekly call (`CoachEvidence`) still
  reads only check-ins and uploads, so a computed completion never changes a plan.
- **Current Strava notification.** `RunCelebrator` offers a run-completion push when a recent Strava run is imported, only when push is enabled and the runner has a device subscription with `RunCongratulations` enabled. The activity is marked celebrated to avoid repeating it, and delivery is limited to two days after the run. The push links to `/?view=runs&run=<activity-id>` so the runner can review and log the run against their plan. By default it says a Strava run arrived; distance is included only when `Push:IncludeRunData` is enabled.
- **Legacy tick prompt types are not the current sync notification trigger.** `TickPrompts`, `TickPrompt` and `Ticks` domain/API code remain, but `StravaSyncRunner` invokes `RunCelebrator`, not the removed `TickPrompter`. The current notification is not an actionable “Ran Tuesday’s Tempo?” / “Tick it” push.
- **5.7: location.** Streams are requested as `time,distance,altitude,heartrate`; `latlng` is never asked for.
  Heart rate from Strava is kept only for runners who gave Taperday's separate heart-rate consent; for everyone else
  it's dropped before the run is recorded, like any upload.
- **6.3 / 7.4 / 2.5: deletion.** Activity deletions and revocations are queued at `Delete` priority and need no API
  call, so they never wait for the rate limit. Disconnecting revokes at Strava, deletes every synced run and says so
  on screen (the written confirmation).
- **2.3 / 6.1: display.** A runner's Strava runs are only ever shown to that runner.
- **Reminders carry no run data by default.** A push goes through a third party (the browser's push service, though
  Web Push encrypts it end to end) and shows on a lock screen, so with `Push:IncludeRunData` off (the default) a
  reminder never reads runs: it's built from the plan as the runner wrote it, without the coach's calls (which come
  partly from uploaded runs), and from check-ins. Turning it on adds the coach's call, coached distances and paces,
  last week's distance run, and distance in an enabled run-completion notification. **Ask Strava first** whether pushing a runner
  their own data to their own device is allowed (with the 7-day cache question).
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
| Coach and totals: what may be kept | `Domain/Coaching/CoachEvidence.cs`, `Domain/Coaching/RunningLog.cs` |
| Current Strava run-completion notification | `Application/Features/Notifications/RunCelebrator.cs`, `Application/Features/Notifications/NotificationDeliverer.cs`, `Application/Features/Sync/StravaSyncRunner.cs` |
| Legacy tick-prompt domain and token code (not the current sync notification trigger) | `Domain/Notifications/TickPrompt.cs`, `Application/Features/CheckIns/Ticks.cs`, `Infrastructure/Push/TickTokens.cs` |
| Client: account section, brand marks, callback, polling | `client/src/features/sync` |
| Completed via Strava: matching, thresholds, feedback, the endpoint | `Domain/Coaching/SyncedCompletions.cs`, `Application/Features/Coaching/SyncedCompletions.cs` |
| Client: "Completed via Strava", "Keep this tick", conflicts | `client/src/features/coaching/StravaCompletion.tsx`, `strava-completion.ts`, `useSyncedCompletions.ts`, `client/src/lib/strava-auto-completion.ts` |
| Legacy notification "Tick it" button | `client/public/sw.js` |
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
| A lawful privacy policy (Policy 7.3) | Published at `/?view=privacy` (linked from every page's footer). It names synced runs, the 7-day cache, heart rate and the contact, and runners accept it (version `2026-10-25`, which added reminders) before connecting. |

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
   Run-completion notifications require push configuration (VAPID keys in App Service, `docs/deploy.md`) and a subscribed device with run-congratulation notifications enabled; they include distance only with `Push__IncludeRunData` = `true`. They do not offer a remote “Tick it” action.
6. Upgrade the app's capacity to 10 athletes from the same settings page when ready. Before asking Strava to review
   it for more, email developers@strava.com about Policy 5.3, 5.4, 5.5 and 6.2 (the 7-day cache, plan matching, the
   completion computed on read and never stored, and the design that keeps only what the runner ticks).

## Strava changes already announced

- 4 Jan 2027: base URL `api-v3.strava.com` (`Strava__ApiBaseUrl`).
- 1 Jun 2027: tokens in headers only, and `/oauth/deauthorize` becomes `/oauth/revoke` (`Strava__DeauthorizePath`).
