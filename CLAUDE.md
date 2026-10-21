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
- **No database and no auth yet.** Add EF/SQL and Entra External ID only when accounts arrive. Don't add them speculatively.
- **Race calendar** syncs itself: every `IRaceSource` is fetched at startup and every `RaceCalendar:SyncInterval`,
  reconciled by `RaceReconciler` (highest priority wins; organiser or agreeing sources = confirmed date) and published
  to the in-memory store. The curated list in `appsettings.json` is just the lowest-priority source. To add a source,
  implement `IRaceSource` in `Infrastructure/Races` and register it in `AddInfrastructure`. Check the site's terms first.
- **Frontend** (`client/`): React + Vite + TypeScript.
- **Tests**: xUnit + Shouldly + NSubstitute + `FakeTimeProvider`; ArchUnitNET layer rules; integration
  tests through `WebApplicationFactory` with a pinned clock.

## Commands (repo root)
```bash
dotnet build StartLine.slnx        # must be 0 warnings (TreatWarningsAsErrors)
dotnet test  StartLine.slnx        # Domain, Application, Architecture, Integration
dotnet run --project src/StartLine.API --launch-profile http   # http://localhost:5122, Scalar at /scalar
```
`UseAppHost=false` is set because locked-down Windows devices block the generated .exe.

## Layout
- `Domain/Running` — `Distance`, `Pace`, `RaceTimePredictor` (Riegel), `TrainingPaces` (zones from goal).
- `Domain/Activities` — an uploaded run: `Track` (moving time, interpolation), `Splits`, `Halves`, `BestEfforts`,
  `PlannedSessionMatch`. Read from Garmin .fit by `Infrastructure/Activities`; see `docs/activity-import.md`.
  Synced from Strava as a 7-day rolling cache (`ActivityOrigin`, `StravaCache`); see `docs/strava-sync.md`.
- `Domain/Sync` — `ProviderConnection` (encrypted tokens), `SyncJob` (retries), `RateLimit`. Worked by
  `Application/Features/Sync/StravaSyncRunner` behind `IStravaApi`; tests use `FakeStravaApi`, never Strava.
- `Domain/Plans/SavedPlan` — a runner has **one current plan** (a filtered unique index enforces it). A new plan for the
  same race updates it in place; another race replaces it and the old one becomes a past plan (`Archived`), which can be made
  current again. Signed-in runners open on their current plan.
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
