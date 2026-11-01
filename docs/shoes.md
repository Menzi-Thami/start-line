# Shoes

**Where it lives:**
- **Account › Shoes** for managing pairs.
- A **Shoes** picker on every run page.
- The pair's name on each row of the runs list.

**API:** `api/v1/me/shoes`.

## The model

| Piece | What it holds |
|---|---|
| `Shoe` | A pair: name, the kilometres it had already run when added, a replacement limit (100–3,000 km, default 700), a default flag (at most one per runner, enforced by a filtered unique index), a reminder opt-in, and a retired date. Up to 30 pairs. |
| `ShoeAssignment` | One run worn in one pair, by id only: an uploaded or synced run (`ActivityId`), or a check-in with a distance (`CheckInId`). A run is on at most one pair (unique filtered indexes). There are no foreign keys to runs: an assignment whose run is gone simply stops counting. |

**A pair's distance is never stored.** `ShoeMileage` works it out on every read: the starting kilometres plus the distance of every assigned run that still exists.
- A deleted run, or a lapsed Strava copy, comes off its pair automatically.
- Nothing derived from Strava is kept (Strava API Policy 6.2). `stravaKm` shows the part that comes from Strava copies, which count while Taperday holds them.
- A check-in linked to an uploaded or synced run counts once: the run's own distance wins.
- A check-in with no distance can't be put on a pair: there's nothing real to count.

## Automatic behaviour

- **New runs on the default pair:** new uploads (single and bulk) and newly synced Strava runs go on the default pair, if there is one and it isn't retired.
- **Replaced Strava copies:** when an upload replaces the Strava copy of the same run (see `docs/run-data-quality.md`), the copy's pair moves to the upload.
- **Reminders:** a pair with reminders on that reaches its limit queues one push (`NotificationKind.ShoeMileage`) to each of the runner's devices. The reminder links to `/?view=account&settings=shoes`, respects quiet hours, and expires after 7 days. It fires once per limit; raising the limit and reaching it again reminds again. Retired pairs never remind.
- **Retiring:** a retired pair keeps its runs and history but takes no new runs and stops being the default.

## Endpoints

| Method | Path | Does |
|---|---|---|
| GET | `/me/shoes` | Pairs with distance, run count, Strava share, last run, wear (`Fine`, `NearingLimit` at 90%, `PastLimit`) |
| POST | `/me/shoes` | Add a pair |
| PUT | `/me/shoes/{id}` | Edit a pair; also retire it or bring it back |
| DELETE | `/me/shoes/{id}` | Delete the pair and its assignments; the runs stay |
| PUT | `/me/shoes/worn` | Put one run (`activityId` or `checkInId`) on a pair, or take it off with `shoeId: null` |
| POST | `/me/shoes/{id}/runs` | Put up to 200 past runs on a pair; runs already on a pair stay |
| GET | `/me/shoes/unworn-runs` | Runs from the last 90 days not on any pair |

Shoes and their run ids are included in the account export, and deleted with the account.

## Tests

| Layer | File |
|---|---|
| Domain | `tests/StartLine.Domain.Tests/Shoes/ShoeTests.cs` |
| Integration | `tests/StartLine.Integration.Tests/ShoeTests.cs`: distances, the default pair, an upload replacing a Strava copy, reminders, bulk add, check-ins, privacy and export |
| Client | `client/src/features/account/ShoeTracker.test.tsx` |
| Playwright | `client/e2e/shoes.spec.ts` |
