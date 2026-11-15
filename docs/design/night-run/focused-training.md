# Focused training experience

Taperday keeps Night run's near-black surfaces, volt accent, wordmark and type families. The layout follows a summary-first approach: one purpose per screen, one main action in context, and detail opened deliberately. Strava is an information-hierarchy reference, not a source of new metrics, capabilities or branding.

## Screen map

| Destination | Leads with | Detail lives here |
| --- | --- | --- |
| Home | Today's workout and one logging action; compact weekly progress | Recent saved activity expands to existing editing/sharing; coaching review, history/personal bests and running tools open separately |
| Plan | This week's seven compact day rows | Selected-date preview, then a dedicated day screen; Calendar for monthly navigation/full schedule; Progress for distance, goal outlook, insights and paces |
| Runs | Compact rows of imported activities and existing range filters | A row opens the activity; file-upload guidance opens on demand; Training log links to the plan calendar |
| Journey | Training chapters, races and trophy cabinet | Available between plans; chapter stories, versioned archive/result corrections, recovery and portrait sharing |
| Account | Named settings groups | Profile/picture, connections/run sources, app/calendars, notifications, data/privacy; sign-out belongs here |

Strength is a workout type within Plan. Its prescribed days remain in the agenda and its weekly exercise guide opens from Strength workouts. It does not take a main-navigation or plan-tab slot. Set progress remains device-local and shared by the day and guide views.

Home has no nested Today/Tools navigation or repeated weekly workout list. Legacy `?view=home&tab=tools` links still open running tools. Closing tools preserves calculator inputs and their lazy loading. Desktop places weekly progress and race context beside today's workout; phones follow a single reading order.

## Interaction rules

- Five main destinations: Home, Plan, Runs, Journey, Account. Journey remains available without a plan; Plan has This week, Calendar and Progress.
- Keep the prescription separate from what happened. Imported activity does not silently complete training; saved logs, source availability, unknown measurements and failures retain their existing meaning.
- Week and calendar select a compact day preview. Open day details navigates to one canonical screen, preserving the existing logging and strength controls. The day URL supports Back/Forward and refresh.
- The dedicated day screen remains open during outside actions; Back/Close/Escape returns to the schedule.
- Agenda Up/Down moves one day; monthly Up/Down moves a week. Opened-day controls keep their own keyboard behavior. Close/Escape returns focus appropriately.
- Keep risk warnings and the current coach's note visible. Move reference material and management actions, not essential safety feedback, behind named controls.
- Printing opens training guides/instructions and restores sections that were previously closed. Settings and calculator inputs stay mounted when folded, preserving drafts.

The original focused-training change left persistence and generator contracts unchanged. The later Journey addition
introduces independent race history, event metadata and paged chapter reads; training generation, provider retention and
notification contracts remain unchanged. See [Journey and trophy cabinet](../../journey-and-trophy-cabinet.md),
[calendar day behavior](../../calendar-day-summary.md), [plan-history guarantees](../../plan-history.md) and the
[original QA record](../../qa/2026-10-29/focused-training/verification.md).
