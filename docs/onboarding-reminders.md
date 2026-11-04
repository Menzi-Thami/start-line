# Onboarding and inactive-runner emails (#175)

One-off emails that help a signed-up runner take the next step: build a plan, start it, or pick it back up. **Off by default.** Nothing goes to a runner until `OnboardingReminder__Enabled` is set, after the previews have been checked (see [Rolling it out](#rolling-it-out)).

They're not a drip campaign. Each email goes once (the third once per quiet spell), never to anonymous visitors, and only to runners with an email address and **news and updates** on.

## The three cohorts

A runner is in at most one cohort at a time, checked in this order (`OnboardingEligibility.Classify`):

| # | Cohort | When | Email | Button |
|---|---|---|---|---|
| 1 | **No plan ever** (`StartPlan`) | Signed up ≥ 48 hours ago and never saved a plan. Archived plans count as saved | "Your starting line is waiting" | Build my training plan → `https://taperday.run/?view=build` |
| 2 | **A plan, never started** (`FirstRun`) | First saved plan ≥ 7 days old, and no run ever recorded | "Your first run is waiting" | Open my plan → `https://taperday.run/?view=home` |
| 3 | **Gone quiet** (`ReturnToRunning`) | Recorded runs before, none for ≥ 21 days | "Ready when you are" | Pick up my plan → `https://taperday.run/?view=home` |

- **Order matters.** No plan means cohort 1 whatever else is true (uploads without a plan still get "build a plan"). A runner under 48 hours old gets nothing, even with old uploads. Any recorded run means never cohort 2.
- **Quiet** (cohort 3) counts from the end of the last day with a recorded run, and never from before the account or the newest saved plan. Runs uploaded from before signing up, or a plan built last week, don't make a quiet spell.
- **Spacing.** Two onboarding emails of any kind are at least 14 days apart. Cohort 3 is once per **episode** (the day of the last recorded run before the quiet spell), needs fresh running since the last one (a later episode), and has a **60-day cooldown**. Without new running there's never a second nudge.
- Every threshold is a named constant in `OnboardingEligibility` with a test.

## Activity evidence: "not recorded" vs "not exercising"

Taperday only keeps two kinds of running for good: **check-ins** that say a run happened (Done, Cut short, Swapped for easy; *not* Skipped; on any of the runner's plans, archived included) and **uploaded runs**. These are the only evidence cohorts 2 and 3 are decided from, and the only thing written down is the delivery record (no activity data).

Strava runs are a 7-day cache (Strava API Policy 6.2, 5.3, 5.5; see [strava-sync.md](strava-sync.md)). Nothing worked out from them is stored, so they can't move a runner *into* a cohort. They can hold an email back, and they're read fresh at the moment of sending:

- **Strava runs in the cache now** (`CachedUntil > now`): cohorts 2 and 3 are skipped. The runner is running, just not recording it in Taperday. Runs whose cache has lapsed but haven't been cleared yet count as gone.
- **A Strava connection that needs reconnecting**: cohorts 2 and 3 are skipped. Taperday can't see their running, so it says nothing rather than guess.
- **Nothing is claimed** when a runner is held back this way, so the decision is made again on the next run of the worker.

The known limit: a runner who runs with no Strava connection and never ticks or uploads looks the same as one who isn't running. The copy is written for that. "Your first run" asks them to tick it off if they've already been out, and "Ready when you are" says running elsewhere or taking a break is fine. It never says they aren't running.

## Sending once: the delivery record

`OnboardingDeliveries` (migration `20261101214544_OnboardingDeliveries`) has one row per runner, campaign and episode, enforced by a unique index. Episode is empty for cohorts 1 and 2. The account going takes its rows with it (cascade delete).

For each runner (`OnboardingReminderSender.SendToAsync`):

1. **Read** the runner's state fresh and classify.
2. **Check what's gone before**: the 14-day gap, and for cohort 3 the episode and cooldown rules.
3. **Claim** the row before sending: an insert (a unique-index clash means another instance got there first), or for a retry an atomic `Failed → Sending` update that only one instance can win.
4. **Read again, immediately before sending.** A plan built, a run recorded, updates turned off, the account deleted, or Strava runs now in the cache all let the claim go (a first claim is deleted; a retry goes back to Failed, this attempt not counted) and nothing is sent.
5. **Send**, then mark the row Sent. A failed send marks it Failed.

After the claim, every step is a single-row update, so an account deleted mid-send can't leave a half-saved change behind that breaks the rest of the batch.

- **Restarts, deploys, a second instance**: the claim makes it once, however often the worker runs.
- **Failed sends** (Brevo down) are tried again on later runs, **3 attempts in all**, then left alone.
- **A crash mid-send** leaves the row in Sending. It's **never resent**, because the email may have gone, and it counts towards the spacing rules as if sent.

## Unsubscribing and consent

The onboarding emails belong to **news and updates** (`Runner.UpdateEmailsOffAt`), the list Taperday's "what's new" emails use. They're about the service the runner signed up for, they're on unless the runner says no, and every one carries a way out:

- The footer's Unsubscribe button goes to the runner's own `u1` key on `https://taperday.run/?view=unsubscribe&t=KEY`. That page asks before it unsubscribes.
- The one-click `List-Unsubscribe` / `List-Unsubscribe-Post` headers (RFC 8058) are added by `BrevoEmailSender` from the same key.
- Unsubscribing stops news and updates, onboarding emails included. **The weekly recap (`WeeklyEmails`, its own `w1` key) is never touched.** The test `A_runner_without_a_plan_gets_one_email_at_48_hours_that_unsubscribes_from_updates_and_not_the_recap` checks that.
- Runners can turn news and updates back on (or off) in Account.

POPIA: these are service messages to existing account holders about the service they signed up for, with an opt-out in every email. They are **not** marketing campaigns, which would still need their own opt-in (see [email.md](email.md)). This is the reasoning behind the design, not legal advice. Have it reviewed if the copy ever moves towards promotion.

## Rate limit and the Brevo quota

Brevo's free plan allows **300 emails a day**, shared by everything Taperday sends from `hello@taperday.run`. To let historical signups trickle out rather than burst:

- **Per run**: at most `MaxPerRun` (5) every `Every` (30 minutes).
- **Per day**: at most `DailyLimit` (40) onboarding emails in any 24 hours.
- **Whole budget**: onboarding stops when the last 24 hours' sends (onboarding *and* weekly recap) plus a reserve of one email for every runner with the weekly recap on would pass `DailyEmailBudget` (250), leaving room under Brevo's 300.
- **Newest signups first**, so a fresh 48-hour signup isn't stuck behind the backlog. Older signups follow at up to 40 a day; a backlog of 400 takes about ten days.

## Settings (App Service, `app-taperday-api-3ghg5t`)

| Setting | Default | |
|---|---|---|
| `OnboardingReminder__Enabled` | `false` | Sends to runners who are due one |
| `OnboardingReminder__TestTo` | empty | Sends one made-up preview of each of the three emails to this address at startup. **Clear it after**, or every restart sends three more |
| `OnboardingReminder__Every` | `00:30:00` | How often the worker runs |
| `OnboardingReminder__MaxPerRun` | `5` | Per run |
| `OnboardingReminder__DailyLimit` | `40` | Onboarding emails in any 24 hours |
| `OnboardingReminder__DailyEmailBudget` | `250` | Every email in 24 hours, recap first |

They need the Brevo key (`Email__BrevoApiKey`, see [email.md](email.md)) and the authenticated sender `hello@taperday.run`. Without the key nothing is sent, and the log says so.

## Preview (synthetic, gated from real sends)

`OnboardingEmail.Preview` composes each email for a made-up runner ("Sample Runner"). It uses no runner's data and no database, has no unsubscribe key (the footer goes to Account), and puts `[Test]` in the subject. It goes only to `OnboardingReminder__TestTo` and **works with `Enabled` off**: setting it never sends to a runner and writes no delivery records. `OnboardingEmailTests` renders all three and checks the HTML, the plain text and the links.

## Telemetry

Logs carry **counts and ids only, never personal data**: no names, addresses or running.

- `Onboarding emails: {Sent} sent, {Failed} failed (allowance {Allowance}).` once per run that sent or failed something.
- `Onboarding email {DeliveryId} ({Campaign}) failed on attempt {Attempt}.` uses the delivery row's own id, not the runner's, so a failure can be looked up in the database without logging who it was.
- `Onboarding emails are off (OnboardingReminder:Enabled).` and `…not scheduled: no Brevo key…` at startup.
- What went to whom lives only in `OnboardingDeliveries` (status, attempts, claimed and sent times).

## Rolling it out

1. **Merge and deploy.** The migration creates the empty table. Nothing is sent: `Enabled` is off.
2. **Preview.** Set `OnboardingReminder__TestTo` (this restarts the app and sends three `[Test]` emails). Check them in Gmail, Outlook and on a phone, light and dark, then **clear the setting**.
3. **Check the quota.** Count runners with the weekly recap on, and confirm today's sends leave room. Lower `DailyLimit` for a gentler start if needed.
4. **Switch it on.** This is the manual enable step: set `OnboardingReminder__Enabled=true`. The first run sends at most 5; older signups follow at up to 40 a day.
5. **Watch** the log lines above and the `OnboardingDeliveries` table for the first few days. To stop at once, set `Enabled=false`. The claims stay, so turning it back on never repeats an email.

## Tests

- `tests/StartLine.Application.Tests/Onboarding/OnboardingEligibilityTests.cs`: 47 h 59 m vs 48 h; a plan at 48 h; archived plans; opt-out and no email for every cohort; the 7- and 21-day boundaries; old accounts; precedence; uploads from before signing up and a new plan aren't a quiet spell; synced runs and an unreachable Strava; the 14-day gap; episodes and the 60-day cooldown; the budget and recap reserve.
- `tests/StartLine.Application.Tests/Onboarding/OnboardingEmailTests.cs`: copy, first name (and fallbacks, HTML encoding), links, the updates-only unsubscribe, plain text, and synthetic previews.
- `tests/StartLine.Integration.Tests/OnboardingReminderTests.cs` (disposable SQL, fake clock, fake outbox): each cohort end to end; plan at 48 h and archived-only plans; opt-out, no email and deleted accounts; skipped vs done check-ins, uploads, cached vs lapsed Strava runs and a connection needing reconnecting (partial synced data); one nudge per quiet spell and the cooldown; precedence; competing workers; bounded retries; a crash-state claim; batching within run and day limits with repeated runs; off by default; the worker on its schedule when enabled; the preview.

## Not yet

- **Couch to 5K.** The issue asks for a beginner Couch to 5K option in the first email "when that feature is live". There's no builder route for it on `main` yet (it's being built in PR #179). TODO: when it ships, add a second link to the "Your starting line is waiting" email pointing at its builder route, and a test for it.
- **A plan deleted outright** (removed with no check-ins) leaves no trace, so that runner can look like "no plan ever" and get cohort 1. Archived plans are counted.
- **Send time.** Emails go out whenever the worker runs, not at a set hour in the runner's own time zone.
