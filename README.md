# Taperday

A running coach that builds a plan around your race and the days you can run, then adapts it every week to how you actually ran. Live at **[taperday.run](https://taperday.run)**.

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
| Delivery | Feature branch → PR to `staging` → staging site → release button → `main` → production (see below) |

### Releasing: staging, then production

```
feature branch ──PR──▶ staging ──PR──▶ main
                         │               │
                         ▼               ▼
                 staging site       taperday.run
```

1. **Build** on a feature branch and open a pull request into `staging`. CI runs the full test suite on it.
2. **Merge into `staging`.** It deploys to the staging API, database and website on its own (`deploy-staging-only.yml`), then `scripts/smoke.sh` checks it: the site loads and may call its API, the database answers, races list and a plan builds. Staging has its own empty database and no email, Strava or push settings, so it never reaches a runner.
3. **Try it** on the staging site (`https://icy-grass-0c32e680f-staging.eastus2.1.azurestaticapps.net`) with a test account. Several changes can wait on `staging` together.
4. **Release** with **Actions → 3 - Release to production → Run workflow**. It checks staging passed for that exact commit, merges `staging` into `main`, deploys to taperday.run and smoke-checks production. Nothing reaches production until it is pressed.

The release button is the only road to production: a push to `main` deploys nothing. For an urgent fix merged straight into `main`, run **Actions → Ops - Redeploy production** by hand, then merge `main` back into `staging` so they don't drift. The whole pipeline on one page: [docs/how-we-ship.md](docs/how-we-ship.md). Accounts, settings and failed-run diagnosis: [docs/deploy.md](docs/deploy.md).

Run checks **before** merging. The deployment workflows build and apply migrations, but don't replace the complete pre-merge test suite. This repository does not require an automatic merge.

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

Training adjustments and weekly reviews: [behaviour and safeguards](docs/flexible-training-week.md). PWA notifications: [device setup and delivery requirements](docs/pwa-reminders.md).
