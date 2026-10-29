# Calendar day summaries

Select any date in **This week** or the monthly calendar in **All weeks** to see that date's plan and recorded sessions. A compact dropdown expands directly below the calendar on every screen size. Selecting the same date again collapses it; selecting another date replaces its contents. The calendar stays in the page, and Close/Escape returns focus to the selected date.

**Planned** keeps the current prescription identifiable: workout name, distance, pace, instructions and steps, strength exercises, or a rest day. A past outstanding workout says **No completion recorded**, rather than assuming the runner missed it. Future dates show upcoming training; dates outside the plan are explicitly identified.

**Recorded** uses existing account check-ins and available activities on their actual local calendar date. Strava and uploaded runs appear before the runner logs anything. An explicit activity/check-in link displays one run, including independently entered corrections when present. Separate additional runs stay separate. Strength completion remains on the device and never comes from a running activity.

On a saved plan, runners can log an imported run, enter a manual or time-only run, replace a prescribed workout, edit or remove an entry, and share an existing run sticker. Logging inside a day keeps its date fixed. Future dates and dates outside the plan cannot accept logs. Viewing a date does not complete a session or adjust training. Existing APIs, generator versions and storage semantics are unchanged.

Imported measurements still follow their source's availability. Removing an activity or its cached details does not remove the saved completion or independently entered measurements. An unavailable distance/time is described as unrecorded rather than invented. See [automatic running totals](automatic-running-totals.md) and [run logging](run-logging.md). This feature adds no permanent Strava storage or extra database calls on day selection.

## Accessibility and performance

Date buttons expose their date, prescription and status in text. Arrow keys, Home and End move between dates (Up/Down move one week in the monthly calendar). Date buttons expose expanded state and identify their controlled dropdown. Its heading receives focus when opened; keyboard focus can move naturally back to the calendar or onward to the page. Close and Escape restore the selected date, while outside taps and tab changes dismiss without stealing focus. The page stays scrollable and interactive. The dropdown is bounded to 34 rem wide and the smaller of 24 rem/60% of the viewport high, scrolling longer content internally. Controls inside it retain their own touch gestures. Reduced-motion users get no entrance animation. The day view is loaded as a separate JavaScript chunk on first use.

Unloaded imported history is distinguished from an empty list. A loading/failed check-in request is not displayed as an empty saved history, and logging stays unavailable until the existing check-in load succeeds. Failed save/delete actions retain the existing form/entry and error/retry flow.

## Validation

`DaySummary.test.tsx` covers planned versus actual, rest days, independent runs, explicit links, saved entries after cache removal, time-only records, skipped/future/outside-plan days, unavailable history, strength tracking, distance units and mutation failures. Existing run-visibility journeys now open a day instead of jumping to its week.

`client/e2e/calendar-day.spec.ts` drives the real PlanView and check-in hook in Chromium with synthetic API responses: opening by keyboard, natural focus movement/return, same-date toggling, date/month/tab changes, compact bounds, responsive widths, reduced motion, sticker creation, link/save/reload, replacements, edits, time-only logs, cache removal and failed/successful deletion. No real runner, production database or live provider is used. Physical Safari/iOS/Android and live Entra authorization are not established by these tests.
