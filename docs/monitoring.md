# Monitoring production

How we find out that taperday.run is broken, and who does what about it. Everything here is free: Application
Insights' smart detection, an email and push action group, a GitHub Actions ping and a scheduled Claude task on the
owner's laptop. The Log Analytics workspace is capped at 0.15 GB a day, so telemetry can never cost money (when the cap
is reached, data stops until midnight UTC).

Production only. Staging has no `APPLICATIONINSIGHTS_CONNECTION_STRING`, so it sends nothing.

## Three tiers

| Tier | What it catches | How you hear | How fast |
|---|---|---|---|
| **Big** | Failure spike, API down, a feature failing for most runners | Email and Azure app push (Failure Anomalies), GitHub email (failed keep-awake ping), triage push notification and an `urgent` issue | Minutes (alerts), next morning (triage) |
| **Small** | New low-volume exception, slow endpoint, degraded Strava/Brevo/push, slow cold starts, data volume near the cap | One GitHub issue per problem, labelled `telemetry` | Next morning |
| **Background** | Gradual slowdowns, exception volume changes, memory leaks | Classic smart detection emails to the subscription owner | Within a day |

## Alerts (free)

| Alert | Source | Goes to |
|---|---|---|
| **Failure Anomalies** | Smart detection rule on `appi-taperday-*`: learns the normal failure rate of requests and outgoing calls and fires on an unusual rise | Action group `ag-taperday-owner`: email and Azure mobile app push |
| **API down** | **Ops - Keep production API awake** pings `/health/live` every 10 minutes. A failed run means the API didn't answer | GitHub's email for failed scheduled workflows (to whoever last changed the schedule) |
| **Slowdowns, exception volume, memory leak, trace severity** | Classic smart detection (on by default) | Email to the subscription owner |
| **Spending** | Cost Management budget ([deploy.md](deploy.md)) | Email at 50% and 100% |

Failure Anomalies treats every 4xx as a failure, so a burst of bot 401s or 404s can set it off. Look at the result
codes before you act.

**Not used, because they cost money every month** (ask before adding any): metric alert rules (about $0.10 per
signal), log search alert rules (about $0.50 to $1.50 each, depending on frequency) and standard availability tests
(about $0.0012 per test, roughly $10 a month for one location every 5 minutes).

### Deploy and test the alerts

The email address isn't kept in the repository. Pass it when you deploy. `infra/alerts.bicep` deploys on its own and
changes nothing else:

```bash
az deployment group create -g rg-taperday -f infra/alerts.bicep \
  -p insightsName=appi-taperday-3ghg5t alertEmail=<your email> alertAppAccount=<Azure app sign-in, optional>
```

`infra/main.bicep` deploys the same thing when you pass `alertEmail` (and optionally `alertAppAccount`). If you leave
it out, existing alerts are kept as they are.

Azure emails a one-time code to a new address. Enter it within 30 minutes, or no alert email is delivered (open
the action group in the portal and select **Resend** if it expires). Azure mobile app push needs the app signed in
with the same account.

Send a test email and push:

```bash
az monitor action-group test-notifications create -g rg-taperday --action-group ag-taperday-owner \
  --alert-type smartalert --add-action email owner-email <your email>
```

## Daily triage

A scheduled Claude task (**TaperDay production triage**, in the Claude desktop app → Scheduled) runs every morning at about
07:30 South Africa time while the app is open (a missed run starts the next time it opens). It only reads Azure: it
runs the queries below for the last 24 hours, compares them with the 7 days before, and then:

- **small issue**: opens or updates one GitHub issue per problem, labelled `telemetry`, with the query and numbers as
  evidence;
- **big issue**: also labels the issue `urgent`, sends a push notification, and may open a small fix pull request to
  `staging` when the cause is clear in the code;
- **nothing wrong**: no issue, just a short report in the run.

It never merges, never runs **3 - Release to production**, never changes Azure, app settings or secrets, and never
runs the full local checks. CI is the gate, and the owner presses the release button.

### Thresholds

Runner traffic means requests other than `GET /health/*`. Only 5xx counts as an error (4xx is usually the runner or a bot).

| Signal (query) | Big | Small |
|---|---|---|
| Error rate (1) | ≥ 5% of runner requests are 5xx with ≥ 20 errors, or ≥ 3× last week's rate with ≥ 20 errors | ≥ 1% with ≥ 5 errors |
| One operation failing (2) | ≥ 50% of its calls fail with ≥ 10 calls, or ≥ 3 different runners affected | Any 5xx not seen in the previous 7 days |
| Exceptions (3) | (counted through 1 and 2) | New `problemId` (`prev7d == 0`), or ≥ 2× its daily average with ≥ 5 |
| Slow operation (4) | p95 ≥ 10 s with ≥ 20 calls | p95 ≥ 2 s and ≥ 1.5× last week's p95 |
| Outgoing service (5) | Strava, Brevo or web push failing ≥ 50% with ≥ 10 calls | ≥ 5% failing with ≥ 3 failures, or p95 ≥ 2× last week's |
| Database and error logs (6) | SQL connection or timeout errors on ≥ 3 runner requests | Any error-level category not seen in the previous 7 days |
| Cold starts (7) | | ≥ 4 starts in 24 h (the keep-awake ping should prevent them), or any boot ≥ 30 s |
| API reachable (8) | Two or more hours in a row with no successful ping, or `/health/live` failing now | One hour with no successful ping |
| Data volume (9) | | TOTAL ≥ 70% of the cap (telemetry would stop before midnight) |

Small issues never send a push notification. They wait for you on GitHub.

### Issues: one per problem

Each issue carries a hidden key in its body, `<!-- telemetry-key: <kind>:<id> -->` (for example
`exception:<problemId>`, `operation:<name>:<resultCode>`, `dependency:<service>`, `slow:<name>`, `cold-starts`,
`volume`, `api-down`). Before opening an issue, triage looks for an open `telemetry` issue with the same key. If there
is one, it adds a comment with today's numbers, at most once a day. If a problem hasn't come back for 7 days, triage
comments to say so and closes the issue. Titles look like `Telemetry: <what> (<where>)`.

### Queries

Run any of these in Application Insights → Logs, or from a terminal (the `application-insights` CLI extension is
installed once with `az extension add -n application-insights`):

```bash
az monitor app-insights query -g rg-taperday -a appi-taperday-3ghg5t --analytics-query "<query>"
```

Keep `//` comment lines out of queries sent from the command line: the query API can reject them.

**1. Runner traffic, error rate and p95**

```kusto
requests
| where timestamp > ago(8d) and name !startswith "GET /health"
| extend period = iff(timestamp > ago(1d), "last24h", "prev7d")
| summarize requests = count(), serverErrors = countif(toint(resultCode) >= 500), p95ms = round(percentile(duration, 95)) by period
| extend perDay = iff(period == "prev7d", round(requests / 7.0, 1), todouble(requests)),
         errorRatePct = round(100.0 * serverErrors / requests, 2)
```

**2. Server errors by operation**

```kusto
requests
| where timestamp > ago(8d) and toint(resultCode) >= 500
| summarize last24h = countif(timestamp > ago(1d)), prev7d = countif(timestamp <= ago(1d)),
            users24h = dcountif(user_AuthenticatedId, timestamp > ago(1d)), lastSeen = max(timestamp)
            by name, resultCode
| join kind=leftouter (
    requests | where timestamp > ago(1d) | summarize calls24h = count() by name
  ) on name
| project name, resultCode, last24h, calls24h, failRatePct = round(100.0 * last24h / calls24h, 1), prev7d, users24h, lastSeen
| order by last24h desc
```

**3. Exceptions by problem** (`prev7d == 0` means new this week)

```kusto
exceptions
| where timestamp > ago(8d)
| summarize last24h = countif(timestamp > ago(1d)), prev7d = countif(timestamp <= ago(1d)),
            firstSeen = min(timestamp), lastSeen = max(timestamp),
            example = take_any(substring(outerMessage, 0, 200)), operation = take_any(operation_Name)
            by problemId, type
| where last24h > 0
| order by last24h desc
```

**4. Slowest operations**

```kusto
requests
| where timestamp > ago(8d) and name !startswith "GET /health"
| extend period = iff(timestamp > ago(1d), "last24h", "prev7d")
| summarize p95ms = percentile(duration, 95), calls = count() by name, period
| summarize p95_24h = round(maxif(p95ms, period == "last24h")), p95_prev = round(maxif(p95ms, period == "prev7d")),
            calls24h = maxif(calls, period == "last24h") by name
| where calls24h >= 5
| top 10 by p95_24h desc
```

**5. Outgoing services: Strava, Brevo, web push, Key Vault, sign-in**

```kusto
dependencies
| where timestamp > ago(8d)
| extend service = case(target has "strava", "Strava",
                        target has "brevo", "Brevo",
                        target has_any ("fcm.googleapis.com", "push.apple.com", "notify.windows.com", "push.services.mozilla.com"), "Web push",
                        target has "vault.azure.net", "Key Vault",
                        target has_any ("login.microsoftonline.com", "ciamlogin.com"), "Entra sign-in",
                        target)
| extend period = iff(timestamp > ago(1d), "last24h", "prev7d"),
         failed = toint(resultCode) >= 500 or toint(resultCode) == 429 or (isempty(resultCode) and success == false)
| summarize calls = count(), failures = countif(failed), p95ms = percentile(duration, 95) by service, period
| summarize calls24h = maxif(calls, period == "last24h"), failures24h = maxif(failures, period == "last24h"),
            failRate24hPct = round(100.0 * maxif(failures, period == "last24h") / maxif(calls, period == "last24h"), 1),
            failRatePrevPct = round(100.0 * maxif(failures, period == "prev7d") / maxif(calls, period == "prev7d"), 1),
            p95_24h = round(maxif(p95ms, period == "last24h")), p95_prev = round(maxif(p95ms, period == "prev7d"))
            by service
| order by failures24h desc
```

**6. Database and other error logs.** SQL calls aren't recorded as dependencies (no SqlClient instrumentation), so
database trouble shows up here as EF Core error logs and as exceptions.

```kusto
traces
| where timestamp > ago(8d) and severityLevel >= 3
| extend category = tostring(customDimensions.CategoryName)
| summarize last24h = countif(timestamp > ago(1d)), prev7d = countif(timestamp <= ago(1d)),
            example = take_any(substring(message, 0, 200)), lastSeen = max(timestamp)
            by category, severityLevel
| where last24h > 0
| order by last24h desc
```

**7. Cold starts.** Restarts and how long each took to boot (first log line to "Application started", approximate).

```kusto
let starts = traces
    | where timestamp > ago(8d) and message startswith "Application started"
    | project startedAt = timestamp, cloud_RoleInstance;
starts
| join kind=inner (traces | where timestamp > ago(8d) | project t = timestamp, cloud_RoleInstance) on cloud_RoleInstance
| where t between ((startedAt - 2m) .. startedAt)
| summarize firstLine = min(t) by startedAt
| extend bootSec = round((startedAt - firstLine) / 1s, 1)
| summarize starts24h = countif(startedAt > ago(1d)), startsPrevPerDay = round(countif(startedAt <= ago(1d)) / 7.0, 1),
            maxBootSec24h = maxif(bootSec, startedAt > ago(1d)), maxBootSecPrev = maxif(bootSec, startedAt <= ago(1d))
```

**8. Hours without a successful keep-awake ping**

```kusto
let since = toscalar(requests | where timestamp > ago(8d) | summarize bin(min(timestamp), 1h));
requests
| where timestamp > ago(1d) and name == "GET /health/live"
| summarize ok = countif(toint(resultCode) < 400) by bin(timestamp, 1h)
| join kind=rightouter (range hour from bin(ago(1d), 1h) to bin(now(), 1h) - 1h step 1h | project timestamp = hour) on timestamp
| project hour = timestamp1, ok = coalesce(ok, 0)
| where ok == 0
| where hour >= since
```

**9. Data volume against the daily cap** (0.15 GB = 153.6 MB)

```kusto
union withsource = table requests, dependencies, exceptions, traces, customMetrics, customEvents, pageViews
| where timestamp > ago(1d)
| summarize MB = round(sum(_BilledSize) / 1048576.0, 1) by table
| as perTable
| union (perTable | summarize MB = sum(MB) | extend table = "TOTAL", capPct = round(100.0 * MB / 153.6, 1))
| order by MB desc
```

## Where to look

Azure portal → resource group `rg-taperday` → **appi-taperday-3ghg5t** (Application Insights):

| View | Use it for |
|---|---|
| **Failures** | Failed requests and outgoing calls by operation, with the exceptions behind them. Drill into a sample to see the whole request. Switch the result-code filter to 5xx to hide bot 4xx |
| **Performance** | Slowest operations and their duration spread; drill into a slow sample to see where the time went (Strava call, database, our code) |
| **Application map** | The API and what it calls (Strava, Brevo, push services) with call counts, failure rates and durations on each line |
| **Live metrics** | Requests, failures and CPU per second right now. Use it while you release or reproduce a problem. It's free and doesn't count towards the cap |
| **Logs** | The queries above, or your own, over `requests`, `dependencies`, `exceptions`, `traces` and `customMetrics` |
| **Alerts** | Fired alerts, including Failure Anomalies, and the action group |

Every error response carries a `traceId` (ProblemDetails). Search for it in **Transaction search** to find that exact
request.

## Known gaps

- **No SQL dependency telemetry.** Database failures appear only as exceptions and EF Core error logs (query 6).
- **Log messages are stored as templates** (`Executed DbCommand ({elapsed}ms)…`), with the values in
  `customDimensions`.
- **EF Core logs every database command at Information.** Watch query 9. If the data volume nears the cap, raise
  `Microsoft.EntityFrameworkCore.Database.Command` to `Warning` in `appsettings.json`.
- **Triage is daily and runs on the laptop.** Real-time cover comes from Failure Anomalies and the keep-awake ping only.
