# Daily readiness (#141)

**Where it lives:** Home › **How are you feeling today?** It replaces the earlier version, which saved to the device only.

| What | How |
|---|---|
| Check-in | Fresh, okay, tired or unwell, optionally with sleep (well, okay, badly), soreness (none, a bit, very) and a note of up to 280 characters. One per day, saved to the account (`Readiness` table, unique per runner and day, deleted with the account). |
| History | The last two weeks, newest first. Any of those days can be changed or cleared; the future and older days can't (400). |
| Guidance | A tired day suggests taking it easier. An unwell day says to rest, not to run with a fever or chest symptoms, and to see a doctor if it doesn't settle. Never a diagnosis. Both link to the weekly review. |
| Weekly review | When the runner doesn't answer the review's readiness question, today's or yesterday's check-in answers instead: fresh counts as ready, tired as tired, unwell as unwell, and okay says nothing. The review says so ("Using your daily check-in…"), an answer given in the review wins, and the plan changes only when the runner applies the change (`WeeklyReview.Guide` still holds progression back unless they're ready). |
| Privacy | Listed in the privacy notice under "How you feel, only if you say". It's in the account export (`readiness`). |

## API

| Method | Path |
|---|---|
| GET | `/api/v1/me/readiness?days=14` (`no-store`, newest first, up to 60 days) |
| PUT | `/api/v1/me/readiness/{date}` `{ feeling, sleep?, soreness?, note? }` |
| DELETE | `/api/v1/me/readiness/{date}` (clearing a day with nothing is fine) |

`WeeklyReviewDto` gains `recoveryFromCheckIn`. Migration `Readiness` is additive.

## Tests

| Layer | File |
|---|---|
| Integration | `tests/StartLine.Integration.Tests/ReadinessTests.cs` |
| Client | `client/src/features/runner-home/ReadinessCheckIn.test.tsx` |
| Playwright | `client/e2e/readiness.spec.ts` (screenshots in `docs/qa/141`) |
