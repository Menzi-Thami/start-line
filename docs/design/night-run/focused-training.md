# Focused training experience

Taperday keeps Night run's near-black surfaces, volt accent, wordmark and type families. The layout follows a summary-first approach: one purpose per screen, one main action in context, and detail opened deliberately. Strava is an information-hierarchy reference, not a source of new metrics, capabilities or branding.

## Screen map

| Destination | Leads with | Detail lives here |
| --- | --- | --- |
| Home | Today's workout and one logging action; compact weekly progress | Recent saved activity expands to existing editing/sharing; coaching review, history/personal bests and running tools open separately |
| Plan | This week's seven compact day rows | One inline day for the selected date; Calendar for monthly navigation/full schedule; Progress for distance, goal outlook, insights and paces |
| Runs | Compact rows of imported activities and existing range filters | A row opens the activity; file-upload guidance opens on demand; Training log links to the plan calendar |
| Account | Named settings groups | Profile/picture, connections/run sources, app/calendars, notifications, data/privacy; sign-out belongs here |

Strength is a workout type within Plan. Its prescribed days remain in the agenda and its weekly exercise guide opens from Strength workouts. It does not take a main-navigation or plan-tab slot. Set progress remains device-local and shared by the day and guide views.

Home has no nested Today/Tools navigation or repeated weekly workout list. Legacy `?view=home&tab=tools` links still open running tools. Closing tools preserves calculator inputs and their lazy loading. Desktop places weekly progress and race context beside today's workout; phones follow a single reading order.

## Interaction rules

- Four main destinations: Home, Plan, Runs, Account. Three Plan views: This week, Calendar, Progress.
- Keep the prescription separate from what happened. Imported activity does not silently complete training; saved logs, source availability, unknown measurements and failures retain their existing meaning.
- Calendar day details appear at their agenda row, or under the monthly calendar. Only one is open. No full-page day screen, duplicated full weekly cards or modal focus trap.
- An outside click acts before it dismisses the inline day. Dismissing on pointerdown can move the clicked control before its click lands. Use the event's original path so a submitted form disappearing still counts as an inside click.
- Agenda Up/Down moves one day; monthly Up/Down moves a week. Opened-day controls keep their own keyboard behavior. Close/Escape returns focus appropriately.
- Keep risk warnings and the current coach's note visible. Move reference material and management actions, not essential safety feedback, behind named controls.
- Printing opens training guides/instructions and restores sections that were previously closed. Settings and calculator inputs stay mounted when folded, preserving drafts.

No database, API, generator-version, source-retention, auth-provider or notification contract changes. This is a presentation/navigation change. See [calendar day behavior](../../calendar-day-summary.md), [plan-history guarantees](../../plan-history.md) and the [QA record](../../qa/2026-10-29/focused-training/verification.md).
