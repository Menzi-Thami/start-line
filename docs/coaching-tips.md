# Weekly coaching tips

One short, evidence-based running tip a week, by email, on each runner's own Thursday morning. It's part of the runner's
**weekly emails**, beside the Monday recap ([runner-weekly-recap.md](runner-weekly-recap.md)), and never crammed into it.
**Off by default**: nothing goes to a runner until `CoachingTips__Enabled` is set, after the previews have been checked.

## What it is

- One tip: a title and two to four short sentences, plus one button, **Open this week** (`https://taperday.run`, the
  same place the recap's button goes).
- Subject: `Your Taperday tip: {tip title}`. Kicker `Your Thursday tip · 19 November`.
- The Frame look (`EmailLayout.Wrap`: the logo, the runner peeking over the card) and a plain-text copy.
- British English, warm and plain. No hype, no jargon, never a diagnosis: where pain comes up the tip says to see a
  physio or sports doctor if it lingers.
- Composed by `CoachingTipEmail` (`src/StartLine.Application/Features/CoachingTips/CoachingTipEmail.cs`).

## When and to whom

- **Between 07:00 and 08:00 on the runner's own Thursday** (`Runner.TimeZone`; an unknown zone counts as UTC).
- **Runners with weekly emails on** (`Runner.WeeklyEmails`, the recap's own setting) **and an email address**. There's
  no separate preference.
- `CoachingTipWorker` checks every 15 minutes and `CoachingTipSender` sends what's due.
- **A missed hour is skipped,** never sent late, as with the recap. On the free F1 plan the API sleeps when idle, so
  `.github/workflows/recap-wake.yml` now also pings `/health/live` every 15 minutes from Wednesday 16:00 through
  Thursday 20:59 UTC, covering Thursday 07:00 in UTC+14 through UTC−12.

## Which tip

The first rule that matches wins (`CoachingTipSelector.Choose`; every threshold is a named constant with a test):

| # | Rule | When | Tips |
|---|---|---|---|
| 1 | **Race week** | The current plan's race is 0–6 days after the Thursday | `race-1` … `race-3`, a different one each race |
| 2 | **Taper** | The race is 7–20 days away | `taper-1`, `taper-2` |
| 3 | **Long-run jump** | The longest single run in the 7 days to yesterday is **more than** 10% beyond the longest in the 30 days before that (exactly 10% isn't). Skipped when those 30 days have no run of at least 2 km | `spike`, in the runner's own numbers: both distances and a suggested cap of 1.1 × the earlier longest |
| 4 | **Comeback** | The current plan had running sessions in the 7 days to yesterday (since the plan was made, before race day) and no run was logged | `comeback` |
| 5 | **The runner's track** | Otherwise: one step a week | Track A or B below |

- **No repeats.** An override tip (rules 1–4) sent in the last 4 weeks (fewer than 28 days) is never sent again: the
  rules fall through to the next one. Within race week and the taper, a tip never sent comes first, then the one sent
  longest ago.
- **Tracks.** Track A (new runners): the current plan is for a new runner (`Experience.New`), a Couch to 5K programme
  is under way (`Runner.BeginnerProgressJson`, not all 27 runs done), or there's no current plan. Track B: everyone else.
  Each has 12 tips in order.
- **The step** is the number of tips the runner has already been sent from that track, read from the delivery records.
  Overrides and the other track's tips don't move it. After the twelfth, the general rotation (`g-1` … `g-8`) follows,
  round and round.

### Running figures: read now, never kept

Rules 3 and 4 read the runner's running through `RunningLogReader` with `includeSynced: true`: kept runs (the runner's
own check-ins and uploads) plus the Strava runs Taperday holds **right now**, as Home counts them. They're worked out on
every read and used only for the choice and this one email. Nothing worked out from a Strava run is stored: the delivery
row keeps only the tip's key and the Thursday, never a distance (Strava API Policy, see [strava-sync.md](strava-sync.md)).
A Strava-only runner has nothing in the earlier 30 days (the cache is 7 days), so rule 3 never fires for them.

## The tip bank

`CoachingTipBank` (`src/StartLine.Application/Features/CoachingTips/CoachingTipBank.cs`): one record per tip (`Key`,
`Title`, `Body`): the overrides, Track A (`a-1` … `a-12`), Track B (`b-1` … `b-12`) and the rotation. Keys are stored
on delivery records, so **never rename a key or reuse one for different advice**; add a new key instead.

The content comes from the owner's research: 80/20 easy running and the talk test; the 2025 finding that single-run
spikes (more than weekly totals) predict overuse injuries; Couch to 5K and run–walk for new runners; heavy strength work
plus plyometrics for running economy; the IOC 2023 consensus on REDs (relative energy deficiency in sport); and the taper
meta-analyses. Claims stay within that outline: no exact g/kg numbers and no paces beyond what the tips state.

## Sending once: the delivery record

The tip reuses `OnboardingDeliveries` (see [onboarding-reminders.md](onboarding-reminders.md)) with campaign
`CoachingTip` (stored as a string, so no migration for the value) and **episode = the runner's Thursday** (`yyyy-MM-dd`).
The unique index on runner, campaign and episode makes it one tip per runner per Thursday. The tip's key goes in the
`TipKey` column, added by the migration **`20261119093510_AddCoachingTipKey`** (one nullable `varchar(16)`, null for every
onboarding email).

For each runner (`CoachingTipSender.SendToAsync`): read the runner, check the hour and the setting, choose the tip,
**claim** the row (an insert, or for a retry an atomic `Failed → Sending` update that also records the tip now chosen),
**read again** immediately before sending (weekly emails off, the address gone or the account deleted lets the claim go
and nothing is sent), send, then mark it Sent or Failed with single-row updates.

- **Restarts, deploys, a second instance**: the claim makes it once.
- **A failed send** (Brevo down) is tried again on the next check that hour, **3 attempts in all**.
- **A crash mid-send** leaves the row in Sending; it's never resent, because the email may have gone.
- The onboarding emails ignore `CoachingTip` rows entirely: they don't trigger the 14-day gap between onboarding emails,
  open episodes or count towards the onboarding daily limit.

## Unsubscribing

The tip is part of the weekly emails, so it carries the runner's **weekly** key (`w1`, `EmailList.Weekly`) in the footer
link (`?view=unsubscribe&t=KEY&list=weekly`) and the one-click header (`UnsubscribeLinks`). **That key stops the recap
and the tip together**, and nothing else: news and updates stay as they were. The footer, the recap's footer, Account
("Weekly emails: a Monday recap … and a Thursday coaching tip") and the unsubscribe page all say so. Runners can turn
weekly emails back on in Account.

## The daily email budget

Brevo's free plan sends **300 emails a day**, shared by everything. Priority: **the recap first** (never held back), **then
tips**, **then onboarding nudges**.

- Tips go only while every email of the last 24 hours (recaps, tips, onboarding, announcements; sent or mid-send) is
  under `CoachingTips__DailyEmailBudget` (250). A tip held back isn't claimed; it's tried again on the next check that
  hour, and skipped if the hour ends.
- Onboarding counts tips with the recap: its allowance subtracts them, and it still holds one place for every runner with
  weekly emails on.

## Settings (App Service, `app-taperday-api-3ghg5t`)

| Setting | Default | |
|---|---|---|
| `CoachingTips__Enabled` | `false` | Sends tips to runners with weekly emails on |
| `CoachingTips__TestTo` | empty | Three made-up previews at startup: Track A's first tip, Track B's first tip and the long-run jump (sample numbers). No runner's data. **Clear it after**, or every restart sends three more |
| `CoachingTips__DailyEmailBudget` | `250` | Every email in 24 hours, recap first |

They need the Brevo key (`Email__BrevoApiKey`, see [email.md](email.md)). Without it nothing is sent, and the log says so.

## Preview

`CoachingTipEmail.Previews` composes the three previews for "Sample Runner": no database, no unsubscribe key (the footer
goes to Account) and `[Test]` in the subject. They go only to `CoachingTips__TestTo`, **work with `Enabled` off**, and write
no delivery records.

## Telemetry

Counts and ids only, never personal data:

- `Coaching tips: {Sent} sent, {Failed} failed, {HeldBack} held back by the daily email budget.` for each check that did something.
- `Coaching tip {DeliveryId} failed on attempt {Attempt}.` with the delivery row's own id.
- `Coaching tips are off (CoachingTips:Enabled).` and `Coaching tips not scheduled: no Brevo key…` at startup.

## Rolling it out

1. **Merge and deploy.** The migration adds the empty `TipKey` column. Nothing is sent: `Enabled` is off.
2. **Preview.** Set `CoachingTips__TestTo` (this restarts the app and sends three `[Test]` emails). Check them in Gmail,
   Outlook and on a phone, light and dark, then **clear the setting**.
3. **Check the quota.** Count runners with weekly emails on: on a Thursday, each gets one tip.
4. **Switch it on.** Set `CoachingTips__Enabled=true`. The next Thursday 07:00 (runner-local) sends to everyone due.
5. **Watch** the log lines and the `OnboardingDeliveries` rows with campaign `CoachingTip`. To stop at once, set
   `Enabled=false`; the claims stay, so turning it back on never repeats a Thursday.

## Tests

- `tests/StartLine.Application.Tests/CoachingTips/CoachingTipSelectionTests.cs`: each override and their order, the race
  week and taper boundaries (0, 6, 7, 20, 21 days, a race already run), the jump's edges (exactly 10%, just over, an
  earlier run of exactly 2 km and of 1.99 km, nothing to compare), the comeback, the track choice, the step from history
  (overrides and the other track don't count), after twelve and round again, the four-week no-repeat (27 vs 28 days) and
  a retry's own row not counting as history.
- `tests/StartLine.Application.Tests/CoachingTips/CoachingTipEmailTests.cs`: the bank's shape (12/12/8, unique keys that
  fit the column, 2–4 sentences, no g/kg), the copy, first name and encoding, the button, the weekly unsubscribe, the
  plain text and the previews.
- `tests/StartLine.Integration.Tests/CoachingTipTests.cs` (disposable SQL, fake clock, fake outbox): the Thursday hour per
  time zone, a missed hour, competing workers, a failed send retried, the weekly unsubscribe, weekly emails off and no
  address, the track step across Thursdays, a long-run jump from logged runs (and not again within four weeks), comeback
  then taper then race week from a real plan, a tip not holding back an onboarding email, the budget, off by default, the
  worker on its schedule, and the preview writing nothing.

## Not yet

- **Strava-derived choice.** Which tip went is kept (its key, such as `spike` or `comeback`), and the choice may have used
  Strava runs Taperday held at the time. No distance or other figure is kept, but the key alone records that a rule fired.
- **Couch to 5K detail.** A programme counts as under way until all 27 runs are ticked; a programme abandoned part-way
  keeps a runner on Track A even with a regular plan beside it.
- **Send time.** Like the recap, a tip only goes while the API is awake in the runner's 07:00 hour; the wake workflow
  covers it, but a GitHub Actions outage would skip that week.
