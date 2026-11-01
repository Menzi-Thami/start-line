# Life happens (#142)

**Where it lives:** Plan › **Life happens · change of plans?** on the runner's saved plan. It replaces the static advice from the earlier starter.

| Situation | What it proposes |
|---|---|
| Missed a run | An easy run is let go: missed kilometres are never made up. A missed key session can be made up on a free day later this week with no hard run the day before or after. The missed day stays in the history as missed. |
| Short on time (20, 30, 45 or 60 minutes) | That run becomes an easy run that fits the time, at the slow end of easy pace. Hard work isn't squeezed into less time. |
| Travelling (from–until, up to two weeks) | "I can still run easy": hard sessions become easy and runs are capped at 8 km. Otherwise those days rest. |
| Not feeling well (1–7 days) | Those days rest, and the next two runs come back easy and capped at 5 km. It says not to run with a fever or chest symptoms, and to see a doctor if it doesn't settle. Never a diagnosis. |
| Move my long run | Offers the free days left this week with no hard run either side and not the day before the race. The long run moves there as written, and its old day rests. |

**Rules:**
- Only today and the next 13 days change.
- Past days, strength sessions and the race never change.
- Sessions already logged are left alone.

## Preview, apply, undo

1. **Preview** (`POST /me/plans/{id}/life-happens/preview`) shows the changes and the plan as it would be. Nothing is saved.
2. **Apply** (`.../life-happens/apply`) takes the preview's token and applies exactly that. A plan or check-in that changed since gives 409, and the runner previews again.
3. **Undo / Restore** (`POST /me/plans/{id}/adjustments/restore` `{ dates }`) puts upcoming days back as the plan first wrote them. A move is undone whole from either end.
4. **History.** Changed days ahead are listed with a Restore button. Every change keeps the original prescription in `SavedPlan.Adjustments`.

## Model

`SessionRevision` gains an optional `MovedFrom`. The session planned that day is run on `Date` instead, as written. A move from a future day is two revisions: rest on the old day, and the session on the new one. A missed day in the past keeps its history and is only made up. Adjustments are stored as JSON, so there's no migration.

## Tests

| Layer | File |
|---|---|
| Domain | `tests/StartLine.Domain.Tests/Plans/LifeHappensTests.cs` (spacing, moves, short, unwell, travel, restore) |
| Integration | `tests/StartLine.Integration.Tests/LifeHappensTests.cs` (preview, stale token, apply, restore, privacy) |
| Client | `client/src/features/plan/LifeHappens.test.tsx` |
| Playwright | `client/e2e/life-happens.spec.ts` (screenshots in `docs/qa/142`) |
