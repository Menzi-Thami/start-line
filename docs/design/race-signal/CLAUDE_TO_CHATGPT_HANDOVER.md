# Claude → ChatGPT hand-over: roadmap features #140–#149

Written 2026-11-01 by Claude, at Thami's request: ChatGPT finishes the remaining roadmap work. Read it with the design and acceptance contract in `docs/design/race-signal/CLAUDE_ROADMAP_HANDOVER.md` (#150).

## Where the ten features stand

| # | Feature | Status | Owner now |
|---|---|---|---|
| 149 | Data quality | **Merged** as #151 (an earlier version). **Follow-up #158 is open:** automatic duplicates and one-line provenance, as Thami asked; it drops the unused `DuplicateDismissals` table. Merge #158 next. | ChatGPT: merge #158 when CI is green |
| 144 | Shoes | **#157 is open and complete, but needs rebuilding on `main`** after #158. See [Rebuilding #157](#rebuilding-157-shoes-on-main). Old #156 is closed. | ChatGPT |
| 140 | Training intelligence | In progress by ChatGPT, on the #140 branch | ChatGPT |
| 146 | Structured workout export | In progress by ChatGPT, on the #146 branch | ChatGPT |
| 143 | Progress story | Not started (only the stub) | ChatGPT |
| 141 | Readiness, follow-up | Not started (only the localStorage stub) | ChatGPT |
| 142 | Life Happens, follow-up | Not started (only the static-advice stub) | ChatGPT |
| 147 | Race week | Not started (only the stub) | ChatGPT |
| 148 | Milestone sharing | Not started (only the stub) | ChatGPT |
| 145 | Offline PWA, follow-up | Not started (only the online/offline label) | ChatGPT |

Claude started from the order 149, 144, 140, 143, 141, 142, 147, 146, 148, 145, building the foundations first. #149 and #144 are done.

## What #149 and #144 built (reuse these)

**Run data** (`docs/run-data-quality.md`)
- `RunningLogReader` (`src/StartLine.Application/Features/Activities/RunningLogReader.cs`) is the one place that reads check-ins and runs for totals. Home's totals and the run-data breakdown both use it. **Use it for #140 and #143 trends**, rather than adding a third copy of the totals logic. The client copies (`ranKmByWeek`, `weeklyBars`) already duplicate it.
- `RunMatch` (`src/StartLine.Domain/Activities/RunMatch.cs`) is one run, one recording, chosen automatically. `ActivityImporter.RelinkAsync` moves everything that points at a replaced recording to the kept one. **Anything new that links to a run by id** (milestones, shoes) **must be moved in `RelinkAsync`.**
- `GET /me/run-data` returns sources, the week and month breakdown by source, missing measurements, and Strava sync issues with retry. It also offers a CSV export and bulk delete.

**Shoes** (`docs/shoes.md`, on #157)
- Pairs plus id-only `ShoeAssignment`s. **Distances are worked out on read** (`ShoeMileage`), so nothing derived from Strava is stored.
- The default pair is put on new uploads and synced runs automatically.
- Reaching a pair's limit sends one push, as `NotificationKind.ShoeMileage`.

## Rebuilding #157 (shoes) on main

#157's branch is stacked on the old #151 branch. That branch includes **a regenerated `RunDataProvenance` migration (`20261101075107`) which must not go to main**: main already has `20261101060622_RunDataProvenance`, and it's deployed. Once #158 is merged:

1. Branch from `main`.
2. Bring over #157's shoe changes: `git diff 3c779bb origin/feature/shoes -- . ':!src/StartLine.Infrastructure/Persistence/Migrations'`, applied with `git apply`, or cherry-picked by file.
3. Keep `main`'s migrations and model snapshot. Then run `dotnet ef migrations add ShoeTracker --project src/StartLine.Infrastructure --startup-project src/StartLine.Infrastructure`. That should create only `Shoes` and `ShoeAssignments`.
4. In `ActivityImporter.RelinkAsync`, also call `shoes.FollowAsync(replaced, kept, ...)` and return its result. #157 already has this. Then rebuild and run `ShoeTests` and `RunDataTests`.
5. Open it as a fresh PR and close #157. Force-pushing isn't permitted here, so use new branches rather than rewriting pushed ones.

## Ground rules Thami set

- **Speed over exhaustive local checks.** Locally, run only the tests for the files touched, plus build, lint and `tsc`. CI on the PR is the full gate: the repo is public, so Actions are free. Per feature: about 4–6 integration tests, one client test file, a Playwright spec only when navigation changes, and one light and one dark screenshot at phone and desktop.
- **Merging:** Claude didn't merge feature PRs; ChatGPT merges after green CI. **Don't merge docs-only PRs** like this one; they exist for context.
- **No duplicate prompts or busywork for runners.** Thami rejected asking runners to resolve duplicates. Prefer automatic, explainable behaviour, and keep explanations to one line.
- **Frame design:** grey frame, Instrument Serif and Sans, sage. Tokens only, light and dark, no new fonts. See `style_guide.md`.

## Gotchas found the hard way

- **Strava rules.** Nothing derived from Strava runs may be stored (Policy 6.2, and 5.3 and 5.5 on derived data). Compute on read, from `Visible(now)` copies. Coaching evidence uses uploads only.
- **Integration tests and Strava sync.** Every test class that runs a Strava sync pass must be in `[Collection(StravaInSeries.Name)]` (the same collection as `RemindersInSeries`). Otherwise classes running in parallel take each other's sync jobs and throw `DbUpdateConcurrencyException`. Each class also needs **its own fake athlete id range**:

  | Range | Class |
  |---|---|
  | 50,000 | `StravaSyncTests` |
  | 70,000 | `RunDataTests` |
  | 90,000 | `TickPromptTests` |
  | 110,000 | `ShoeTests` |

  Colliding ranges cause 409 `strava_in_use`.
- **The local test database can rot.** On Thami's PC, LocalDB `StartLine_IntegrationTests` became unopenable. Point `STARTLINE_TEST_SQL` at a fresh database whose name contains "Test", for example `...;Database=StartLineSomethingTests;...`. Also use a fresh name after rewriting an unmerged migration.
- **Regenerating client API types.** Run the API against a throwaway local database:

  ```bash
  ASPNETCORE_ENVIRONMENT=Development ConnectionStrings__StartLine='Server=(localdb)\MSSQLLocalDB;Database=StartLineSchemaGenN;Trusted_Connection=True;TrustServerCertificate=True' dotnet run --no-build --project src/StartLine.API --urls http://localhost:5122
  ```

  Then run `npm run gen:api` in `client/`.
- **Paths on Linux.** `Path.GetFileName` on Linux CI doesn't treat `\` as a separator. Split on both slashes, as `ActivityOrigin.Uploaded` does.
- **Defensive panels.** E2E specs often answer every unknown endpoint with `[]`, so new panels must check the response's shape and show "not available" rather than crash a page. See `isRunData` in `RunDataPanel.tsx`. Also add a quiet default handler for new endpoints in `client/src/test/server.ts`.
- **Known flakes:**
  - `strength-persistence.test.tsx` times out under parallel load and passes alone.
  - `CheckInCard.test.tsx`, "leaves a failed save open", failed once on CI with `--maxWorkers=1` and passes locally.
- **Never edit a merged migration.** Add a new one, as #158 does to drop a table.

## Notes for the remaining features

These come from a map of the existing coaching code, so you can extend it rather than duplicate it.

| Feature | Existing code to build on |
|---|---|
| #140, #141, #142: approval and history | The weekly coaching review already gives explicit approval: `GET`/`POST /me/plans/{id}/coach/proposal` and `/coach/apply`, with a token-guarded `ReviewCoachingHandler`, and `remaining-week/proposal` and `/apply` for easing this week. **Accepted** calls are stored as `CoachWeek`; remaining-week edits go into `SavedPlan.Adjustments`. Not stored: declines, previews, the evidence snapshot, or the readiness answer. An audit-history table would be new. There's no automatic progression: even small calls need apply. |
| #141 Readiness | `RecoveryReadiness` (`Domain/Coaching/WeeklyReview.cs`: NotReported, Ready, Tired, Unwell) is only a query or body parameter to the coach proposal, and **isn't persisted**. The Home chip `ReadinessCheckIn.tsx` is localStorage only. Persisting daily check-ins per account, with history, and feeding `WeeklyReview.Guide` is the gap. |
| #142 Life Happens | Reuse `RemainingWeek` (`Domain/Plans/RemainingWeek.cs`), which only eases or rests runs, plus `SavedPlan.AdjustRemainingWeek`, for real previewed schedule edits with confirmation. Moving a long run needs new adjustment types that respect hard-day spacing. |
| #143 Progress | Durable signals are check-in `Effort` (RPE 1–10), `Pain`/`PainArea`, distances, and upload metrics (pace, heart rate, drift, best efforts). Strava-only runners have only 7-day data for those. The existing 12-week `WeeklyChart.tsx` and the `Overview` sparklines (`dashboard-math.ts` `easyTrend`) can be extended. Put drill-downs in Home's "Running insights" disclosure: Home's lead (today's workout, this week, countdown) stays first. |
| #147 Race week | Race dates come from the race catalogue or the plan inputs. The plan's race week and taper are known in the generator (v3). |
| #148 Milestones | The run sticker (`features/sharing/run-sticker.ts`) is the canvas pattern for shareable images. Personal bests: `GET /me/activities/bests`. |
| #145 Offline | `client/public/sw.js` and `lib/install-app.ts` (`runningInstalled`). The theme switch is hidden in the installed app (`lib/theme.ts`). |

## Open PRs from Claude

- **[#158](https://github.com/Menzi-Thami/start-line/pull/158), the run-data follow-up.** Ready for CI and merge.
- **[#157](https://github.com/Menzi-Thami/start-line/pull/157), shoes.** Complete; rebuild it on main after #158, as described above.
