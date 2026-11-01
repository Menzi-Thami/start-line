# Training insights (#140)

**Where it lives:** Home › Running insights › **Your training trends**, above the 12-week chart. The weekly coaching review on Home and on the plan has a **Decline this change** button next to Apply.

## What a runner sees

| Part | What it says | Worked out from |
|---|---|---|
| Next step | One of: *Carry on as planned*, *Hold your distance this week*, *Ease off and look after it*, *Log a few more runs first*, with the reason and the figures behind it | The three trends below, plus pain reported in check-ins |
| Load | Last 7 days against the average week of the 4 weeks before. Rising fast above +30%, rising above +10%, lower below −20%. With fewer than 3 of those 4 weeks run, no verdict is given | `RunningLogReader` with synced runs, the same totals as Home |
| Consistency | Planned sessions in the last 4 weeks: run, skipped, not logged. A run counts if it was ticked or uploaded, or while Taperday holds a Strava run that matches it (computed on each read, never stored; see `docs/strava-sync.md`) | Plan sessions, check-ins, uploads |
| Easy pace | Easy runs in the last 4 weeks against the 4 before: pace, and heart rate where recorded. Easy means rated 1–4, or planned as easy/recovery/strides/shakeout without a rating. At least 2 runs of 2 km or more in each window | Visible runs and check-in effort |
| What these trends can't see | Few weeks of running, runs without a distance, the 7-day Strava window, too few easy runs, unlogged sessions | |
| Coaching history | The last 12 answers to the weekly review: accepted or declined, which week, the coach's verdict, and whether it changed the plan | `CoachingDecisions` table |

## Safety

- **Nothing changes the plan on its own.** The next step is advice. A change only happens in the weekly review, after the runner accepts it. A runner can also decline it.
- **Pain comes first.** Pain that changed a run in the last 14 days always gives *Ease off*.
- **A load spike holds volume.** So does running fewer than 60% of planned sessions. The review's existing guards still apply: three strong weeks before progressing, one demand at a time, and recovery and taper weeks protected.
- **No diagnosis.** Pain advice says to see a professional if it doesn't settle.

## Strava rules

The trends are worked out on every read and never stored, so Strava runs can appear in them while Taperday holds them (Policy 6.2). The decision log stores only the coach's call, which is made from check-ins and uploads (`CoachEvidence`), plus the runner's own answer and readiness. It's included in the account export and deleted with the plan.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/v1/me/plans/{id}/insights` | `TrainingInsightsDto`, `no-store` |
| POST | `/api/v1/me/plans/{id}/coach/decline` | `{ token, recovery }` from the reviewed proposal. 409 if the proposal has changed |

Apply (`coach/apply`) now also records an Accepted entry. Migration `CoachingDecisions` adds one table, with a cascade from `SavedPlans`.

## Tests

| Layer | File |
|---|---|
| Domain | `tests/StartLine.Domain.Tests/Coaching/TrainingTrendsTests.cs` |
| Integration | `tests/StartLine.Integration.Tests/TrainingInsightsTests.cs` |
| Client | `client/src/features/coaching/TrainingInsights.test.tsx`, `PlanAdjustment.test.tsx` |
| Playwright | `client/e2e/training-insights.spec.ts` (phone and desktop, 320–1440px, screenshots in `docs/qa/140`) |
