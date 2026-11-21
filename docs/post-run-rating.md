# Post-run rating and rating-driven coaching

Strava completes a session automatically (on read, never stored: [Strava sync](strava-sync.md)). The runner may then rate it in
two taps. That rating is the runner's own lasting record, and Taperday's existing rules use it to keep the plan safe. No AI, no
chat, no new provider. Specification: [PR #295 contract](claude-pr295-execution-contract.md).

## The rating

`PostRunRating` (client/src/features/coaching) sits directly under the "Completed via Strava" box on the day view, and on Home's
"You ran today" card. It also works for a run Strava didn't match: any past or today's run on the day view can be rated.

1. **How hard did it feel?** Ten choices, 1–10, each with its word (`EFFORT_WORDS`), none chosen. Five by two on a phone up to
   480 px, one row of ten above; every choice is at least 44 px tall. Under it: the expected range for the workout
   (`EXPECTED_EFFORT`, the same as the server's `ExpectedEffort`).
2. **Save as planned**, disabled until an effort is chosen.

Optional: **Did something different?** (Cut short, Easy instead, Skipped: skipped hides the scale), **Pain or more details**
(pain, where, a note, and "Add your own distance and time", which opens the full run log), **Tick without rating** (a plain
Done) and, on Home, **Not now** (nothing saved; remembered for the day on this device).

After saving, the control becomes "Rated 4/10 · As planned" with **Edit feedback** and "Saved" or "Saved on this device,
syncing" (offline outbox), and takes focus without scrolling. Editing changes the same check-in. An answer that already has the
runner's own distance, time, run type or a linked recording is edited in the full run log, so nothing they typed is lost.

## What is stored

The existing `SessionCheckIn`, through `useCheckIns` and the offline outbox. No new table.

| Field | From the rating |
|---|---|
| Status | Done (as planned), CutShort, SwappedForEasy or Skipped: the runner's own declaration |
| Effort | Their 1–10, or null (skipped, or ticked without rating). Never defaulted |
| Pain, PainArea, Note | Only if they gave them |
| DistanceKm, Duration, ActivityId | **Always null.** No Strava distance, time, pace, heart rate or id is stored |
| ActualSessionType | Easy for "Easy instead", else null |
| DistanceUnreported | True for "Easy instead" (distance unknown); false otherwise, so a Done counts the planned distance as an estimate and a cut-short run half of it (`RunningLog.KmOf`, the existing convention) |

The Strava copy can lapse or be disconnected; the rating stays. A rating is never sent to an AI (there is none) or to Strava.

## What the coach does with it

Rules only, reusing what was there:

- **Weekly coach** (`WeeklyCoach`, the weekly review): already compares each check-in's effort with its workout type (easy
  2–4, long 3–5, tempo 6–7, intervals 7–8), eases after two runs at least 2 above the expected top, rests after pain that changed
  the running, and steps up only after strong, fully logged weeks; never in taper or race week, never from Strava data
  (`CoachEvidence` uses uploads and check-ins only). Unchanged.
- **Straight after a rating** (`AdaptationPrompt`): the rest of this week is checked with
  `GET /api/v1/me/plans/{id}/remaining-week/proposal?reported=true`. In this mode only what the runner reported counts (skips,
  short or swapped runs, pain that changed their running, and two runs that felt much harder than they should,
  `RemainingWeek.FeltHarderTwice`). A day without a check-in is **not** a missed run, so an unrated Strava run can't trigger
  anything, and nothing is ever made up.
  - No suggestion: nothing shows. One much-harder run alone: a quiet note, no change.
  - A suggestion: "Ease the rest of this week?" with each change (exact quarter-km distances, `exactDistance`), **Apply this
    easier week** or **Keep my plan**. Apply sends `{token, reported: true}`; the token covers the mode, the plan, the runner's
    check-ins and the day, so a stale or mismatched one gets 409 and the prompt checks again. Applied: **Undo** (the existing
    restore). Keep my plan is remembered for that suggestion (by its token) and asked again only when something changes.
- There are no silent automatic changes: every change is reviewed (`NeedsApproval`). Pace never changes from a rating alone.

## Exact run changes (rules only)

`POST /api/v1/me/plans/{id}/session-adjustment/preview` and `/apply` (`SessionAdjuster`, from #294) are kept on
`MyPlansController`, runner-scoped, with no feature flag and no AI. There is no screen for them (owner's choice, 21 November
2026); the rules and limits are in [the old coach doc](ai-coach-mcp.md#the-rules-sessionadjuster).

## Tests

- Domain: `RatingDrivenWeekTests`, `AdaptiveWeekTests`, `WeeklyCoachTests`, `SessionAdjusterTests`.
- API on disposable LocalDB: `RatingAdaptationTests`, `SessionAdjustmentTests` (including the staging QA cases from #296 and
  the retired AI routes returning 404 with the old settings on).
- Client: `PostRunRating.test.tsx`, `AdaptationPrompt.test.tsx`, `StravaCompletionPlan.test.tsx`, `Home.test.tsx`,
  `PlanTabs.test.tsx` (focus stays put on in-place changes), `MoveRunDialog.test.tsx`, `format.test.ts`.
- Browser: `e2e/post-run-rating.spec.ts` (two taps, edit, expiry, suggestion apply/undo, Keep my plan, offline sync, keyboard
  with reduced motion, 320/390/1440 px in light and dark, no chat), `e2e/strava-completion.spec.ts`.
