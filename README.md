# Taperday

A free training plan for runners, from a first 5K to Comrades, that coaches you through it. Live at
[taperday.run](https://taperday.run).

Pick a race, a goal time and the days you can run. Taperday builds a week-by-week plan with a pace, a purpose and
step-by-step instructions for every session. You don't need an account to build one or share it as a link. Sign in
to keep it, bring in your runs and have the plan adjust to how your training is going.

## Building a plan (no account needed)

- **Any race.** Choose from the race catalogue or enter any distance and date.
- **Your days, your start.** Tick the 3 to 7 days you can run, pick your long-run day and choose the day the plan
  starts. Hard sessions are spread so they never land back to back when your days allow it.
- **Trains for the distance.** 5K plans lean on speed, half and full marathons on threshold and race pace, and ultras
  on back-to-back weekends, long hills and time on feet. Two Oceans and Comrades get different profiles.
- **The full set of sessions.** Easy, recovery, strides, hills, fartlek, intervals, tempo, cruise intervals,
  progression runs, race-pace runs, steady, fast-finish and rehearsal long runs, a race-week sharpener and a shakeout.
  Strength and mobility days are optional.
- **How to run it.** Every run comes step by step: the warm-up, each rep and recovery, and the cool-down, each with
  that week's pace range or, for hills and strides, how it should feel.
- **Paces from your goal.** Each zone is anchored to an equivalent race performance instead of a fixed offset, so easy
  really is easy for every distance.
- **Built-in safety rails.** Volume rises by at most 10% a week, there are regular easier weeks, long runs are capped
  by time as well as distance, and race week is light.
- **An honest outlook.** The coach says whether your goal looks realistic and why, and suggests a better one when
  you're ahead of it or at risk. Add a recent race and it can judge your goal against your current fitness.
- **Share it.** The whole plan lives in its link, so the same link always opens the same plan.

## With an account

- **Home.** Today's run, your week, your running totals and bests, and calculators for race splits, pace and time,
  heart-rate zones and race-day fuelling.
- **Your plans.** One current plan, with past plans kept so you can go back to one.
- **Your runs.** Connect Strava once and runs arrive by themselves, or upload a `.fit`, `.gpx` or `.tcx` file (or the
  zip it came in) from almost any watch. Each run is matched to the session it was for, with splits, halves and best
  efforts.
- **Check-ins and a weekly coach.** Say how a run felt. Each Monday the coach reads last week and holds, eases or
  steps up this week, always within the training rules. Anything bigger, like a new goal or an injury rebuild, is
  offered, never made for you.
- **Replan from here.** Missed a week, ill or injured? Rebuild the rest of the plan from where you are, keeping the
  weeks you've already run.
- **Strength.** Runner-specific exercises with figures showing how to do each one.
- **Your data.** Export everything Taperday holds about you, disconnect Strava or delete your account at any time.
  Heart rate is kept only if you say so.

## Running it locally

Needs the .NET 10 SDK, Node 22+ and SQL Server LocalDB (it comes with Visual Studio, or install it on its own).

```bash
dotnet run --project src/StartLine.API --launch-profile http   # API on http://localhost:5122
cd client && npm install && npm run dev                         # app on http://localhost:5173
```

In Development the API creates and migrates its LocalDB database when it starts. To use another SQL Server, set
`ConnectionStrings__StartLine`. API docs are at http://localhost:5122/scalar.

No secrets are needed to build and share plans. Sign-in and Strava stay off until they're configured: see
[docs/accounts-setup.md](docs/accounts-setup.md) and [docs/strava-sync.md](docs/strava-sync.md).

## Tests

```bash
dotnet test StartLine.slnx         # domain, application, architecture and integration tests
cd client && npm test              # unit and component tests
cd client && npm run e2e           # end-to-end, in a real browser (starts the API and the app itself)
```

Integration tests run against LocalDB, or the SQL Server in `STARTLINE_TEST_SQL` when it's set (CI uses a container).
The end-to-end tests need a browser once: `npx playwright install chromium`. The build treats warnings as errors.

## How it's built

- **API** (`src/`): .NET 10 in Clean Architecture (Domain, Application, Infrastructure, API), EF Core on SQL Server,
  sign-in with Microsoft Entra External ID. The plan generator is pure and deterministic: the same answers always
  give the same plan.
- **App** (`client/`): React, Vite and TypeScript, in the "Night run" design ([docs/design](docs/design/night-run/README.md),
  [docs/brand.md](docs/brand.md)).
- **Hosting**: Azure, described in `infra/main.bicep`. Every merge to `main` deploys once CI passes
  ([docs/deploy.md](docs/deploy.md)).

## Race calendar

The race calendar builds itself. Each race source (organiser feeds, federation calendars, a curated list) is
fetched at startup and on a schedule. Sources are reconciled automatically: the most authoritative one wins,
and every race says whether its date and distance are confirmed. If a source goes down, its last good data is
kept. Plans for unconfirmed races say so, and because plans follow the race, they move if the date moves.

The curated list in `src/StartLine.API/appsettings.json` is the fallback source. Adding an online source means
writing one small `IRaceSource` class; check that site's terms of use first.

## More

| Doc | What's in it |
|---|---|
| [accounts-setup.md](docs/accounts-setup.md) | Setting up sign-in, the database and the privacy rules |
| [strava-sync.md](docs/strava-sync.md) | Strava sync, its 7-day cache and Strava's terms |
| [activity-import.md](docs/activity-import.md) | Reading runs from watch files, and how runs are analysed |
| [deploy.md](docs/deploy.md) | Azure resources, costs and the deploy pipeline |
| [security.md](docs/security.md), [security-posture.md](docs/security-posture.md) | Security controls and where Taperday stands |
| [brand.md](docs/brand.md) | The name, logo and voice |
