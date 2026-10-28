# Taperday

Product name **Taperday** (domain taperday.run). Code and project names stay `StartLine.*` on purpose.

A free running-plan builder. Pick a race (from the catalogue or any distance and date), a goal time,
the days you can run and your long-run day, and get a week-by-week plan with pace zones. No account
needed: the API is stateless and the same inputs always produce the same plan, so a plan is shared as a link.

Distances: 5K, 10K, half, marathon, ultra (≤ 60 km, e.g. Two Oceans) and long ultra (> 60 km, e.g. Comrades).
Each trains differently: see `src/StartLine.Domain/Plans/TrainingPlanGenerator.cs` (`Rotation`) and `WorkoutBuilder.cs`.

## Stack
- **Backend** (`src/`): .NET 10, Clean Architecture (`Domain → Application → Infrastructure → API`), own
  CQRS dispatcher (`Application/Common/Dispatcher`, **not MediatR**), FluentValidation in a pipeline
  behaviour, typed exceptions → ProblemDetails, API versioning (`/api/v1`), OpenAPI + Scalar (dev),
  rate limiting (per IP), health checks, OpenTelemetry (OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set).
- **Accounts**: EF Core on SQL Server, Microsoft Entra External ID with email one-time codes. Anonymous plan generation remains stateless; local accounts stay off until configured.
- **Race calendar** syncs itself: every `IRaceSource` is fetched at startup and every `RaceCalendar:SyncInterval`,
  reconciled by `RaceReconciler` (highest priority wins; organiser or agreeing sources = confirmed date) and published
  to the in-memory store. The curated list in `appsettings.json` is just the lowest-priority source. To add a source,
  implement `IRaceSource` in `Infrastructure/Races` and register it in `AddInfrastructure`. Check the site's terms first.
- **Frontend** (`client/`): React + Vite + TypeScript.
- **Tests**: xUnit + Shouldly + NSubstitute + `FakeTimeProvider`; ArchUnitNET layer rules; integration
  tests through `WebApplicationFactory` with a pinned clock.

## Safe testing

Read [docs/testing.md](docs/testing.md) before running tests. **Never test against production or real runner data.** SQL integration tests migrate and reset their database; use disposable local SQL/LocalDB only. The test factory rejects remote hosts and non-test database names. Run the full checks before merging and report limitations honestly.

## Commands (repo root)
```bash
dotnet build StartLine.slnx        # must be 0 warnings (TreatWarningsAsErrors)
dotnet test  StartLine.slnx        # Domain, Application, Architecture, Integration
dotnet run --project src/StartLine.API --launch-profile http   # http://localhost:5122, Scalar at /scalar
scripts/check.sh                   # every check, before any merge (backend, client, end-to-end)
```
`UseAppHost=false` is set because locked-down Windows devices block the generated .exe.

**Before merging any PR, run `scripts/check.sh` locally and merge only when it passes.** CI doesn't run on pull
requests (the free Actions minutes are kept for deploys; see `docs/deploy.md`), and every merge to `main` deploys.

## Layout
- `Domain/Running` — `Distance`, `Pace`, `RaceTimePredictor` (Riegel), `TrainingPaces` (zones from goal).
- `Domain/Activities` — an uploaded run: `Track` (moving time, interpolation), `Splits`, `Halves`, `BestEfforts`,
  `PlannedSessionMatch`. Read from Garmin .fit by `Infrastructure/Activities`; see `docs/activity-import.md`.
  Synced from Strava as a 7-day rolling cache (`ActivityOrigin`, `StravaCache`); see `docs/strava-sync.md`. Nothing kept
  for good is worked out from a synced run: the coach's calls use check-ins and uploads only (`CoachEvidence`), Home's totals
  count ticked sessions and uploads (`RunningLog`), and a Strava run counts only once the runner ticks its session.
- `Domain/Sync` — `ProviderConnection` (encrypted tokens), `SyncJob` (retries), `RateLimit`. Worked by
  `Application/Features/Sync/StravaSyncRunner` behind `IStravaApi`; tests use `FakeStravaApi`, never Strava.
- `Domain/Plans/SavedPlan` — a runner has **one current plan** (a filtered unique index enforces it). A new plan for the
  same race updates it in place; another race replaces it (the old one is kept server-side as `Archived`; the app has no
  My plans page since 25 Oct 2026, so it is not shown). Signed-in runners open on Home; the plan is deleted from the plan itself.
- `Domain/Plans` — `TrainingPlanGenerator` (phases, volume, taper), `WeekLayout` (which run goes on which
  chosen day), `WorkoutBuilder` (concrete sessions per distance), `PlanProfile` (per-distance shape).
- `Application/Features/{Plans,Races,Predictions}` — query + validator + handler per feature.
- `Infrastructure/Races` — race sources, the in-memory store and `RaceSyncWorker` (timer on `TimeProvider`).
- `API/Controllers` — thin: bind → dispatch → return.

## Conventions
Read `.claude/rules/engineering-principles.md`. In short: inject `TimeProvider` (no `DateTime.Now` in
logic), inward-only layer deps, plain-C# domain, typed exceptions (never catch-and-return-null), one
branch per concern, merge `main` into feature branches. Commits: `feat(scope): …`.
**Never** add `Co-Authored-By` or any AI attribution to commits, PRs or code.

Training rules worth knowing before changing the generator: weekly volume grows ≤ 10%, every 4th
week is a cutback, hard days are never back to back when the chosen days allow it, long runs are capped by
distance *and* time, and race week is light with one sharpener and a shakeout. Each rule has a test.

"Replan from here" (`PlanReplan`, `TrainingPlanGenerator.Replan.cs`) keeps the weeks already run and rebuilds the
rest from a share of what the runner had built (missed 80%, ill 60%, injured 50%, behind: last week's km), with the
same rules plus easy-only return weeks (ill 1, injured 2). Rebuilt weeks keep their phase, restart the cutback count
and are held to the 10% limit on their real (rounded) distance. A plan keeps one replan; the latest wins.

Plans carry a generator version (`PlanParameters.GeneratorVersion`, `v=` in the link, `GeneratePlanQuery.Version`, a
`GeneratorVersion` column on saved plans), so a plan keeps the shape it was built with. No version means 1: every plan
made before per-distance shapes. **Version 1 must never change**; `GeneratorV1SnapshotTests` hashes a set of v1 plans.
New plans are version 2 (`PlanShape`, `TrainingPlanGenerator.Shapes.cs`): front-loaded volume growth, 5K/10K volume
levelling off about three-fifths through the build, a stepped long-run track for half, marathon and ultra, a cutback
every 3rd week for new runners, and the 10% limit held on each week's real distance. Every generator rule test runs for
both versions (the `…V2Tests` subclasses). A shape change after this needs version 3, never an edit to version 2.

The goal outlook (`GoalOutlook`, `TrainingPlanGenerator.AssessGoal` in `TrainingPlanGenerator.Outlook.cs`) is the coach's
read on whether the goal is realistic and why: a verdict (`NotAssessed`, `AheadOfGoal`, `OnTrack`, `Stretch`, `AtRisk`), a
sentence, reasons in plain words, and a suggested goal when ahead of it or at risk. It is a pure function of the plan, so
it lives *outside* `TrainingPlan` and can never change a generated plan or a v1 hash (adding even a null property to
`TrainingPlan` would change every snapshot hash); `PlanBuilder` calls it and the DTO carries it. **One plan never gives two
verdicts on the same goal**, so it defers to what already judges one and only adds a read where nothing has: a rebuild's
`SuggestedGoal` slower than the goal is `AtRisk` with that very goal; the coach's `SuggestedGoal` faster than the goal
(three strong weeks) is `AheadOfGoal` with that very goal, and recorded runs never say it sooner; a fresh plan's
`low-volume` warning (decided by the plan's own `PlanShape`) caps the build at `Stretch`, and the outlook never re-derives
reachable volume itself. Otherwise it reads the runner's fitness against the goal, by the same `Fitness` and Riegel as the
coach: the coach's estimate from recorded runs, or a `RecentResult` the runner gave (in the link and request only, not
yet saved with a plan). A full build can take a share of the race time off by experience (8%, 5%, 3%), scaled by the
weeks of building left and the share of the original peak a rebuilt plan keeps; a goal asking up to half of that is
`OnTrack`, up to all of it `Stretch`, more `AtRisk`. Beyond the marathon only the build is judged. Every threshold is a
named constant with a test (`GoalOutlookTests`).

A runner can choose the day their plan starts (`PlanParameters.StartOn`, `start=` in the link, `GeneratePlanQuery.StartOn`,
a `StartOn` column on saved plans), from the day it's built to two weeks before the race. Weeks still run Monday to
Sunday, so a start mid-week makes a short first week holding only the runs from that day. Without it a plan starts the next
Monday, exactly as before, so no plan changes and no generator version is needed.

Every run carries its `Steps` (`SessionSteps`, built in `WorkoutBuilder` from the same numbers as its `Detail`): warm-up,
the work with its recoveries (a `Repeat` holds its block and count), cool-down. Every running step has a distance or a
time and that week's pace range, so a runner with a watch has numbers to hold: fartlek and hills at interval pace (hills
say the pace drops on a climb), strides and fast bursts at its quick end, every jog timed at recovery pace. Only the walk
between strides has no pace. Hills, fartlek and strides keep how they should feel as well. They're guidance about the
same sessions, not a change to
them, so every plan of every version has them and `GeneratorV1SnapshotTests` leaves `PlannedSession.Steps` out of its
hash. A new kind of session needs its steps and a case in `SessionStepsTests`.

Taperday installs as an app (a PWA): `client/public/manifest.webmanifest`, the icons beside it, and `client/public/sw.js`,
registered only in a production build (`lib/install-app.ts`, as `sw.js?api=<API origin>`). The worker keeps **only the
app's own files**: the page network-first (so a deploy always shows; the last copy only offline) and the hashed
`/assets/*` cache-first. It never caches another host, so the API, sign-in and anyone's data are never stored by it; keep
it that way. Its one request elsewhere is a notification's "Tick it", which posts that push's key to the API it was
registered with (https only). Bump its `VERSION` to
drop an old cache. `sw.js` and the manifest are served `no-cache` (`staticwebapp.config.json`). The Add to home screen option
is a one-time card on Home and a section in Account (`features/install`).

A plan's own calendar feed (`GET /api/v1/plans/calendar.ics?{inputs}`) is that plan as built, forever. A signed-in runner's
own plan subscribes instead to their personal feed, `GET /api/v1/calendar/{token}.ics` (`Features/Calendar`): anonymous, as
calendar apps can't sign in, keyed by `Runner.CalendarToken` (made by `GET /me/calendar`, replaced by `POST /me/calendar/reset`),
and it serves whatever plan is current, built through `PlanCoach` as opening it would, so changes, coach's calls and replans
all reach the calendar. The token is a secret: never exported or logged, and redacted from traces (`SecretPaths`).

Reminders are opt-in Web Push (`Domain/Notifications`, `Application/Features/Notifications`, `Infrastructure/Push`), per
device, turned on in Account. `Reminders.DueDay` decides when from the plan as written and the runner's own clock: the day's run at their time
(distance, pace, the plan's words), race day, and on a Monday a new week if they asked (last week's check-ins, this week,
today). What comes from runs (the coach's call, made via `PlanCoach` as opening the plan would, coached numbers, distance
run) is added only with `Push:IncludeRunData`, off by default, so no Strava data is pushed unless that's turned on. A day's reminder is marked sent before it's sent (with a rowversion), so it goes once at most; one missed while
the app slept goes out later that day. `ReminderWorker` sleeps until the next one is due and is woken by
`ReminderScheduleInterceptor` when a plan, time zone or device changes: it never polls the database. A synced Strava run that matches a planned session with no check-in sends one "Ran Tuesday's Tempo?" push
(`TickPrompter`, at most once per session, never for a run over 2 days old), noted as a `TickPrompt` (the session only,
forgotten after 7 days). Push endpoints are
secrets: encrypted like Strava tokens, never logged, redacted in traces (`PushTraces`), and only push-service hosts are
accepted. VAPID keys come from App Service settings (`docs/deploy.md`); without them reminders stay hidden.
