# Run data quality

**Where it lives:**
- A runner's **Runs** page has a collapsed **Your run data** panel.
- An uploaded run's page has a one-line source.
- Both read from `api/v1/me/run-data` and the run's `source` (`SourceDto`).

## What a runner can see and do

| Need | What Taperday does |
|---|---|
| Where a run came from | **Uploads:** one quiet line on the run page, "Uploaded from a FIT file · 25 Oct". The file name (name only, no folders, either slash, cut to 120 characters) is kept for the export. **Strava runs:** they already have their own line with the link back to Strava; the hold time (`CachedUntil`, 7 days) is in the API. |
| What a total is made of | This week's and this month's totals split into kilometres and runs from check-ins, uploads and Strava, plus runs counted with no distance. Built by `RunningLogReader`, the same code as Home's totals, so they can't disagree. |
| Duplicates | Handled automatically and never shown to the runner: see [Duplicates](#duplicates). |
| Runs that didn't sync | Failed Strava fetches (out of automatic retries) list their error and can be retried (`POST run-data/retry-strava`). Skipped fetches list why: "already uploaded", "run limit reached", too short. Only failures flag the panel. |
| Missing measurements | Counts of runs without heart rate, elevation or splits. The heart-rate count says when the cause is the runner not allowing heart rate. |
| Export | `GET run-data/export.csv`: one row per visible run, with provenance columns. Cells that start like a formula (`= + - @`) get an apostrophe, so a file name can't run as a spreadsheet formula. |
| Delete | `POST run-data/delete` deletes up to 100 of the runner's own runs; other runners' ids are ignored. Deleting a Strava copy only removes Taperday's copy. |

A malformed answer from the API (an older API, a proxy page) shows "Run data isn't available right now", never a crash of the Runs page.

## Duplicates

`RunMatch` decides when two recordings are one run:
- they started within 2 minutes; and
- either their distances agree within 3% (or 150 m on short runs), or their times overlap by at least 80% of the longer recording. That catches a watch and a phone on one run, whose GPS distances disagree.

Measuring the overlap against the longer recording means a few minutes started by accident inside a long run is never taken for the run itself.

When the same run arrives twice, Taperday keeps one recording, without asking:

| Arrives | What happens |
|---|---|
| An upload of a run already uploaded | Refused (409 `activity_exists`), unless the new file measured more (heart rate, splits, elevation). In that case it replaces the old upload. |
| An upload of a run Taperday has from Strava | Replaces the Strava copy. Uploads are kept; copies lapse. |
| A Strava run that's already uploaded | Skipped, with the reason shown under "Runs from Strava that didn't arrive". A Strava copy from before this change that duplicates an upload is dropped at its next refresh, so old duplicates clear within days, with no data migration. |

Recordings are never merged into one record (Strava API Policy 5.4). Check-ins that pointed at the replaced recording follow the one that's kept.

## Strava rules

Everything about Strava runs is computed when read, from `Visible` copies, and nothing derived is stored:
- Strava API Policy 6.2: hold for 7 days.
- Policy 5.4: uploads and synced copies are never merged.

Skipped and failed jobs store only the Strava activity id and a short reason. Like failed jobs before, they're pruned after 7 days.

## Tests

| Layer | File |
|---|---|
| Domain | `tests/StartLine.Domain.Tests/Activities/RunMatchTests.cs` |
| Integration | `tests/StartLine.Integration.Tests/RunDataTests.cs`: provenance, automatic duplicates (a watch and a phone, a file and its Strava copy), relinked check-ins, skipped and failed syncs and retry, breakdown, CSV, bulk delete |
| Client | `client/src/features/activities/RunData.test.tsx` |
| Playwright | `client/e2e/run-data.spec.ts` |
