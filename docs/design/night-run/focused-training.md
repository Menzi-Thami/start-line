# Focused training experience

Taperday keeps Night run's near-black surfaces, volt accent, wordmark and type families. The layout follows a summary-first approach: one purpose per screen, one main action in context, and detail opened deliberately. Strava is an information-hierarchy reference, not a source of new metrics, capabilities or branding.

## Screen map

| Destination | Leads with | Detail lives here |
| --- | --- | --- |
| Home | Today's prescription or actual recording and one next action; compact active-week preview | Manual logging is secondary; compact recent recording links to Runs; post-plan priority comes from the real Journey/recovery state |
| Plan | This week's seven compact day rows (race prep on top in race week only) | Selected-date preview, then a dedicated day screen (logging, Move run); Calendar for monthly navigation; Progress for the weekly review (your week, check-in, coach's note, suggested change), the goal outlook, distance, consistency, easy-run pace, personal bests and training paces. One **Change my plan** entry and one tools row (Share link, Add to calendar, Export to watch, Save/Delete) sit under This week and Calendar |
| Runs | One Add runs button (Strava sync and file uploads, with per-device export help folded inside), running totals, then compact rows of imported activities behind one Filter control | A row opens the activity as one scroll (summary, plan vs actual, splits, pace, stages, bests, shoe, sharing, delete); Share a milestone and Running tools (calculators) are small entries at the foot; old Running insights and Running tools links land on Runs. Progress, trends and personal bests live in Plan › Progress; Your run data lives in Account › Your data |
| Journey | Training chapters, races and trophy cabinet | Available between plans; chapter stories, versioned archive/result corrections, recovery and portrait sharing |
| Account | Named settings groups | Profile/picture, connections/run sources, app/calendars, notifications, data/privacy; sign-out belongs here |

Strength is a workout type within Plan. Its prescribed days remain in the agenda and its weekly exercise guide opens from Strength workouts. It does not take a main-navigation or plan-tab slot. Set progress remains device-local and shared by the day and guide views.

Home has no nested Today/Tools navigation or repeated weekly workout list. Legacy `?view=home&tab=tools` links still open running tools. Closing tools preserves calculator inputs and their lazy loading. Both sizes follow one reading order: greeting, today's priority, a compact preview during active training, then recent activity. Completed plans and recovery schedules do not leave weekly targets or feedback requests on Home.

## Interaction rules

- Five main destinations: Home, Plan, Runs, Journey, Account. Journey remains available without a plan; Plan has This week, Calendar and Progress.
- Keep the prescription separate from what happened. Imported activity does not silently complete training; saved logs, source availability, unknown measurements and failures retain their existing meaning.
- Week and calendar select a compact day preview. Open day details navigates to one canonical screen, preserving the existing logging and strength controls. The day URL supports Back/Forward and refresh.
- The dedicated day screen remains open during outside actions; Back/Close/Escape returns to the schedule.
- Agenda Up/Down moves one day; monthly Up/Down moves a week. Opened-day controls keep their own keyboard behavior. Close/Escape returns focus appropriately.
- Keep risk warnings and the current coach's note easy to reach: the weekly review in Progress opens by itself when there is a note for this week. Move reference material and management actions, not essential safety feedback, behind named controls.
- One place for each job (simplified 18 November 2026, see [Plan tab evidence](../../qa/2026-11-18/simplify-plan/README.md)): progress only in Plan › Progress; every change to the plan behind **Change my plan**; race prep only in race week; units only in Account › profile (signed out or from a link: kilometres). Legacy links still land: `?view=home&review=1` opens Plan › Progress with the weekly review open; `prepare=race` opens race prep; `prepare=long&date=…` opens that run's day.
- The browser's own Print (there is no Print button) opens training guides/instructions and restores sections that were previously closed. Settings and calculator inputs stay mounted when folded, preserving drafts.

The original focused-training change left persistence and generator contracts unchanged. The later Journey addition
introduces independent race history, event metadata and paged chapter reads; training generation, provider retention and
notification contracts remain unchanged. See [Journey and trophy cabinet](../../journey-and-trophy-cabinet.md),
[calendar day behavior](../../calendar-day-summary.md), [plan-history guarantees](../../plan-history.md) and the
[original QA record](../../qa/2026-10-29/focused-training/verification.md).

The [canonical simplicity tracker](../taperday-simplicity-plan.md) records the follow-up implementation and its [before/after evidence](../../qa/2026-11-17/simplicity/README.md). Recovery uses dated, pause-adjusted days and keeps its independent identity. An ended calendar window offers a next challenge without submitting completion, clearing safety restrictions, or calling the runner recovered. Newer current training takes precedence over older recovery in Home and the Plan navigation. Recording URLs retain their selected ID and return origin, including Runs filters, across refresh.
