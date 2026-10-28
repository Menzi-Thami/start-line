# Taperday

A running-plan builder and training companion, from a first 5K to Comrades. Live at **[taperday.run](https://taperday.run)**.

Choose a race, a goal time and the days you can run. Get a week-by-week plan with pace zones, workout instructions and optional strength sessions. Build and share a plan without an account; sign in with an email code to save your plan, log your running and review coaching suggestions.

## What you can do

- **Build for your race.** Choose a race from the calendar or enter your own distance and date. Plans cover 5K, 10K, half marathon, marathon and ultras, with different training profiles for each distance.
- **Fit training around your week.** Choose running days, the long-run day, experience, current mileage and preferred start. Structured training may start later for a distant race; the built plan shows its actual start date.
- **Understand each workout.** See its purpose, target paces, warm-up, work, recoveries and cool-down. Inspect the plan by week or calendar, with volume charts and calculators for pace, splits, fuelling and heart-rate zones.
- **Keep a current plan.** Updating the same race saves changes in place. A different race replaces the current plan; the earlier record remains archived server-side. Strength can be added to an existing running plan without resetting its dates, generator version or running schedule. Build the changes, then choose **Save changes**.
- **Record what actually happened.** Complete a workout with manual distance and time, log a different run or add an additional run. Time-only entries leave distance unknown. Imported activities can be linked rather than entered twice. The original prescription stays visible alongside the completed entry.
- **Bring in recorded runs.** Connect Strava or upload `.fit`, `.gpx` or `.tcx` files, including supported ZIP exports. Recorded runs include splits, halves and best efforts where the file contains enough data.
- **Review upcoming training.** Check-ins capture effort and pain. Preview a coaching adjustment and explicitly apply it; opening the plan or logging a run does not silently accept a new adjustment. Larger setbacks can use **Replan from here**, preserving previous weeks.
- **Share your running.** Choose a portrait card, horizontal card or fully transparent horizontal Taperday sticker using actual distance, time and average pace when known. Share it through the device's share sheet, copy the image where supported, or save a PNG to use in an Instagram Story. Direct Instagram targeting and image pasting depend on the device and receiving app.
- **Use it across screens.** The Night run design uses dark surfaces, electric-lime actions, responsive dashboards, keyboard navigation and reduced-motion support. Install it as a PWA; cached app files can open offline, while account/API features still need a connection.
- **Keep your calendar in sync.** Export a plan calendar or subscribe to your account's personal feed. Optional Web Push reminders are configured per device.

Training safeguards include gradual volume growth, regular easier weeks, long-run distance/time limits and a light race week. A goal outlook explains whether the goal appears realistic; these are training guidance, not a medical assessment.

## Your data

Accounts use Microsoft Entra External ID. You can export your data, disconnect Strava or delete your account. Heart-rate storage requires consent. Uploaded files and GPS tracks are discarded after processing; the app keeps activity summaries rather than route recordings.

**Strava is a seven-day cache.** Imported Strava metrics are not copied into permanent manual logs or permanent coaching decisions. A linked entry shows the activity while it is available. Independently entered distance and time are kept as the runner's own record. Long-term totals use manual check-ins and uploads; the plan's current weekly view can also show available imported activities. See [Strava sync and retention](docs/strava-sync.md).

## Run locally

Requirements: **.NET 10 SDK**, **Node 22+**, and **SQL Server LocalDB or a disposable local SQL Server**. Development startup applies migrations, so its database must also be separate from production.

Start the API from the repository root:

```bash
dotnet restore StartLine.slnx
dotnet tool restore
dotnet run --project src/StartLine.API --launch-profile http
```

In another terminal:

```bash
cd client
npm ci
npm run dev
```

The API runs at `http://localhost:5122`, the app at `http://localhost:5173`, and development API documentation at `http://localhost:5122/scalar`.

LocalDB is the development default. For another **local development database**, configure `ConnectionStrings__StartLine` through local environment variables or user secrets. Never copy the production database connection into a developer or test setup. Container instructions and the separate `STARTLINE_TEST_SQL` variable are in [the testing guide](docs/testing.md).

Anonymous plan building needs no account or Strava secrets. Optional setup:

- [Accounts and email-code sign-in](docs/accounts-setup.md)
- [Strava application and sync](docs/strava-sync.md)
- [Deployment, personal calendar feeds and Web Push configuration](docs/deploy.md)

## Test before merging

**Read [docs/testing.md](docs/testing.md) first. Automated tests must never use the live Taperday database or real runner accounts.** SQL integration tests migrate and reset their database. The test factory rejects remote hosts and database names that do not identify a test database.

With a disposable test database available:

```bash
dotnet tool restore
scripts/check.sh
```

This runs formatting, strict backend build/tests, EF migration checks, frontend lint/types/tests/build/audit and browser journeys. CI uses disposable SQL Server containers. Test results, skipped checks and physical-device/authentication limitations belong in the PR description; do not substitute a focused test pass for full validation.

Useful focused frontend commands, from `client/`:

```bash
npm run typecheck
npm run lint
npx vitest run --testTimeout=30000 --maxWorkers=1
npm run build
npm run e2e
```

Playwright needs its browser installed once with `npx playwright install chromium`. Its standard journeys start a local API and production frontend. Keep physical iPhone/Android/Safari verification separate from browser emulation, particularly for sharing and clipboard behavior.

## Architecture and deployment

| Area | Implementation |
| --- | --- |
| Backend | .NET 10, Clean Architecture, a small CQRS dispatcher, FluentValidation, EF Core / SQL Server |
| Frontend | React, TypeScript, Vite; Bricolage headings, Atkinson body text, mono running numbers |
| Authentication | Microsoft Entra External ID; email one-time codes |
| Plan compatibility | Versioned deterministic generators; preserve historical versions and shared-link inputs |
| Website | Azure Static Web Apps; custom domains use managed HTTPS certificates |
| API | Azure App Service; the configured free F1 tier can sleep independently of SQL |
| Database | Infrastructure defaults to paid Azure SQL Basic: 5 DTUs and 2 GiB; storage and processing still need monitoring |
| Delivery | Feature branch → validated PR → merge to `main` → production deployment |

Run checks **before** merging. The main deployment workflow builds and applies migrations, but does not replace the complete pre-merge test suite. See [deployment and failed-run diagnosis](docs/deploy.md). This repository does not require an automatic merge.

The race calendar reconciles organiser feeds, federation calendars and curated fallback entries. Source priority and confirmation status remain visible; a failed source retains its last good data. New sources implement `IRaceSource` and must respect the source site's terms.

## Developer references

| Document | Purpose |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | Repository conventions, architecture and compatibility rules |
| [Engineering principles](.claude/rules/engineering-principles.md) | Dependency direction, clocks, errors and safe testing |
| [Testing](docs/testing.md) | Isolated databases and checks required before merging |
| [Run logging](docs/run-logging.md) | Planned versus completed work, additional runs, coaching and stickers |
| [Activity imports](docs/activity-import.md) | Supported recordings and run analysis |
| [Design system](docs/design/night-run/README.md), [brand](docs/brand.md) | Taperday's visual identity and voice |
| [Security](docs/security.md), [security posture](docs/security-posture.md) | Controls and operational limitations |
