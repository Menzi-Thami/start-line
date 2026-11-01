# Progress story (#143)

**Where it lives:** Home › Running insights › **Your progress**, under the training trends. A 4, 8 or 12-week switch picks the span, and each span is compared with the same length just before it.

| Part | What it says | Worked out from |
|---|---|---|
| Comparison | Distance, runs, average week, longest run and weeks with running, against the span before, with the change | `RunningLogReader` with synced runs: the same totals as Home |
| Weekly bars | Run against planned per week, with the longest run marked; a screen-reader table says the same | Plan sessions and logged runs |
| Consistency | Planned sessions run, skipped and not logged in the span | `TrainingTrends.AdherenceOf` over the span (ticked or uploaded counts; a Strava copy alone doesn't) |
| Easy pace | Easy-effort pace in the span against the span before | `TrainingTrends.EasyPaceOf` over the span |
| Bests | The fastest 1K, mile, 5K, 10K, half and marathon in the span, and whether each beats every run before it ("new best" or "first one recorded") | Best efforts of the runs Taperday holds |
| Race goal | The plan's goal against what uploaded runs point to now and at the start of the span; a screen-reader table lists the weekly estimates | `Fitness.Estimate` on uploads only, as the coach does |
| What it can't see | Few weeks, no earlier span, runs without a distance, the 7-day Strava window, no race estimate, a plan that can't be built | |

Everything is worked out on each read and nothing is stored, so Strava runs appear only while Taperday holds them (Policy 6.2).

## API

`GET /api/v1/me/plans/{id}/progress?weeks=4|8|12` returns `ProgressStoryDto` (`no-store`). Any other span is a 400; another runner's plan is a 404.

## Tests

| Layer | File |
|---|---|
| Domain | `tests/StartLine.Domain.Tests/Coaching/ProgressStoryTests.cs` |
| Integration | `TrainingInsightsTests.Progress_tells_the_story_over_four_eight_or_twelve_weeks_and_is_private` |
| Client | `client/src/features/coaching/ProgressStory.test.tsx` |
| Playwright | `client/e2e/progress-story.spec.ts` (phone and desktop, 320–1440px, screenshots in `docs/qa/143`) |
