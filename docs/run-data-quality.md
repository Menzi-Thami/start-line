# Run data quality

**Where it lives:**
- A runner's **Runs** page has a collapsed **Your run data** panel.
- Every run page has a **Where this run came from** disclosure.
- Both read from `api/v1/me/run-data` and the run's `source` (`SourceDto`).

## What a runner can see and do

| Need | What Taperday does |
|---|---|
| Where a run came from | **Uploads:** the file format (FIT, GPX or TCX), the file name (name only, no folders, cut to 120 characters) and when it was added. **Strava copies:** when it was last fetched and how long it's held (`CachedUntil`, 7 days). Uploads from before this change show "a file". |
| What a total is made of | This week's and this month's totals split into kilometres and runs from check-ins, uploads and Strava, plus runs counted with no distance. Built by `RunningLogReader`, the same code as Home's totals, so they can't disagree. |
| Duplicates | See [Duplicates](#duplicates). |
| Runs that didn't sync | Failed Strava fetches (out of automatic retries) list their error and can be retried (`POST run-data/retry-strava`). Skipped fetches list why, for example "already uploaded" or "run limit reached". |
| Missing measurements | Counts of runs without heart rate, elevation or splits. The heart-rate count says when the cause is the runner not allowing heart rate. Each run page names its own gaps and their likely cause. |
| Export | `GET run-data/export.csv`: one row per visible run, with provenance columns. Cells that start like a formula (`= + - @`) get an apostrophe, so a file name can't run as a spreadsheet formula. |
| Delete | `POST run-data/delete` deletes up to 100 of the runner's own runs; other runners' ids are ignored. Deleting a Strava copy only removes Taperday's copy. |

## Duplicates

`RunMatch` decides whether two runs are the same.

**Same run.** Starts within 2 minutes and distances within 3% (or 150 m on short runs). This catches a FIT file and a GPX export of one run, or a file and its Strava copy, whose start times disagree by seconds.
- Uploading the same run again is refused: 409 `activity_exists`.
- Uploading the file of a synced run replaces the Strava copy. Check-ins linked to the copy are re-pointed at the upload, so the link no longer dangles.
- A Strava fetch of a run that's already uploaded is skipped, with the reason recorded.

**Overlapping, but not the same.** Shown as a possible duplicate. The runner chooses:
- **Delete this one** removes one copy;
- **Keep both** stores a `DuplicateDismissal`, so that pair isn't flagged again.

Taperday never deletes a possible duplicate on its own.

## Strava rules

Everything about Strava runs is computed when read, from `Visible` copies, and nothing derived is stored:
- Strava API Policy 6.2: hold for 7 days.
- Policy 5.4: uploads and synced copies are never merged.

Skipped and failed jobs store only the Strava activity id and a short reason. Like failed jobs before, they're pruned after 7 days.

## Tests

| Layer | File |
|---|---|
| Domain | `tests/StartLine.Domain.Tests/Activities/RunMatchTests.cs` |
| Integration | `tests/StartLine.Integration.Tests/RunDataTests.cs`: provenance, near-duplicate uploads, relinked check-ins, skipped and failed syncs and retry, breakdown, CSV, bulk delete |
| Client | `client/src/features/activities/RunData.test.tsx` |
| Playwright | `client/e2e/run-data.spec.ts` |
