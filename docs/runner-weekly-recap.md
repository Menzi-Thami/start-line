# Runner weekly recap (#162)

A weekly email for runners who turn it on in their profile ("Send me a weekly recap of my recorded runs and upcoming training", `Runner.WeeklyEmails`). It **replaces the maker's Monday report**: `WeeklyReportWorker` is gone.

## What it says

| Part | From |
|---|---|
| Last week's runs and kilometres, and runs counted without a distance | `RunningLogReader` with synced runs: the same totals as Home. Strava runs count while Taperday holds them, and nothing about them is stored |
| Planned sessions run ("4 of 5") | The active plan's checkable sessions that week, run if checked in (not skipped) or uploaded |
| The week ahead | The active plan's sessions for this week: day, title, distance |
| Race countdown | The active plan's race date |

Figures only, with no claims the numbers don't support. Built with `EmailLayout` (the Frame look: grey ground, white card, sage, serif headline), with a plain-text copy. Email clients strip animation and scripts, so it's static.

## When and how often

- **19:00 on each runner's own Sunday** (`Runner.TimeZone`; an unknown zone counts as UTC), about the Monday–Sunday ending that day, with the week ahead. A run logged after 19:00 on Sunday shows in the trends the next week, not in that email.
- **The API must be awake to send.** On the free F1 plan the app sleeps after about 20 idle minutes and its timers stop, so `.github/workflows/recap-wake.yml` pings `/health/live` every 15 minutes from Sunday 14:00 to Monday 06:00 UTC (19:00 Sunday from UTC+5 to UTC−11). Free on a public repo.
- `RunnerWeeklyRecapWorker` checks every 15 minutes, and `WeeklyRecapSender` sends what's due.
- **Once per runner and week:** a `WeeklyRecapDeliveries` row (unique on runner and week) is claimed before sending. Restarts, retries and a second app instance can't send twice.
- **A failed send** (Brevo down, say) is tried again on the next check, up to 3 attempts in all. A claim left mid-send by a crash is never resent, because the email may have gone.
- **A missed Sunday evening is skipped,** never sent late on Monday.

## Unsubscribing

Each recap carries the runner's own **weekly** key (`w1`), in the footer link (`?view=unsubscribe&t=KEY&list=weekly`) and the one-click header. It turns the recap off and nothing else: update emails stay as they were. See [email.md](email.md).

## Settings (App Service, `app-taperday-api-3ghg5t`)

| Setting | Default | |
|---|---|---|
| `RunnerWeeklyRecap__Enabled` | `false` | Sends to opted-in runners |
| `RunnerWeeklyRecap__TestTo` | empty | One made-up preview (4 runs, 32.5 km, a sample week ahead) to this address at startup. No runner's data. **Clear it after**, or every restart sends another |

## Rolling it out

1. **Preview.** Set `RunnerWeeklyRecap__TestTo`, which restarts the app and sends one preview. Check it in Gmail, Outlook and on a phone, in light and dark. Then clear the setting.
2. **Switch it on.** Set `RunnerWeeklyRecap__Enabled=true`. The next Sunday 19:00 sends to every runner who has the box ticked.
3. **Brevo limits.** The free plan sends 300 emails a day. Past that, the plan needs upgrading before Sunday.
4. **Brevo key.** A key unused for 90 days expires. The retired Monday report used to keep it in use, so switch the recap on within 90 days of the last send.

## Tests

`tests/StartLine.Integration.Tests/WeeklyRecapTests.cs` covers per-zone timing, sending once, retry after a failure, and the weekly-only unsubscribe. `UnsubscribeTests` covers both kinds of key.
