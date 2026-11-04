# Calendar day summaries

Select any date in **This week** or **Calendar** to show a compact preview. Selecting another date changes the preview; **Open day details** navigates to the canonical day screen with a `day=YYYY-MM-DD` query parameter. The weekly schedule uses a seven-date strip on phones and a vertical schedule beside the preview on larger screens. Previous/next week controls and a short coming-up list keep the schedule scannable.

The dedicated day screen preserves the existing prescription, logging and exercise controls. It has no internal height cap or outside-click dismissal. Back/Close/Escape returns to the schedule and restores focus; browser Back/Forward and refresh retain the day URL. Week, tab and month context is included in the history entry.

**Planned** keeps the current prescription identifiable: workout name, distance, pace, instructions and steps, strength exercises, or a rest day. A past outstanding workout says **No completion recorded**, rather than assuming the runner missed it. Future dates show upcoming training; dates outside the plan are explicitly identified.

**Recorded** uses existing account check-ins and available activities on their actual local calendar date. Strava and uploaded runs appear before the runner logs anything. An explicit activity/check-in link displays one run, including independently entered corrections when present. Separate additional runs stay separate. Strength completion remains on the device and never comes from a running activity.

On a saved plan, runners can log an imported run, enter a manual or time-only run, replace a prescribed workout, edit or remove an entry, and share an existing run sticker. Logging inside a day keeps its date fixed. Future dates and dates outside the plan cannot accept logs. Viewing a date does not complete a session or adjust training. Existing APIs, generator versions and storage semantics are unchanged.

Imported measurements still follow their source's availability. Removing an activity or its cached details does not remove the saved completion or independently entered measurements. An unavailable distance/time is described as unrecorded rather than invented. See [automatic running totals](automatic-running-totals.md) and [run logging](run-logging.md). This feature adds no permanent Strava storage or extra database calls on day selection.

## Accessibility and performance

Date buttons expose date, prescription, status and pressed selection in text. Arrow keys, Home and End move between dates (Up/Down move one week in the monthly calendar). Preview selection keeps focus on the date. Opening detail focuses its heading; Back/Close/Escape restores the date. At very narrow widths larger previous/next-date buttons complement the seven-date strip. Detail pages scroll naturally and include bottom safe-area padding. Reduced-motion users get no entrance animation. The day view remains a separately loaded JavaScript chunk.

Shared week/calendar/preview statuses distinguish confirmed completion, cut-short and skipped answers, provisional Strava evidence, recorded activity, scheduled training and rest. An activity on a rest day does not imply a prescribed workout was completed. Comparison text explicitly states that distance alone does not assess structure.

Unloaded imported history is distinguished from an empty list. A loading/failed check-in request is not displayed as an empty saved history, and logging stays unavailable until the existing check-in load succeeds. Failed save/delete actions retain the existing form/entry and error/retry flow.

## Validation

`DaySummary.test.tsx` covers planned versus actual, rest days, independent runs, explicit links, saved entries after cache removal, time-only records, skipped/future/outside-plan days, unavailable history, strength tracking, distance units and mutation failures. Existing run-visibility journeys now open a day instead of jumping to its week.

`client/e2e/calendar-day.spec.ts` drives the real PlanView and check-in hook in Chromium with synthetic API responses: preview-to-detail navigation, opening by keyboard, natural focus movement/return, date/month/tab changes, responsive page bounds, reduced motion, sticker creation, link/save/reload, replacements, edits, time-only logs, cache removal and failed/successful deletion. No real runner, production database or live provider is used. Physical Safari/iOS/Android and live Entra authorization are not established by these tests.

See [redesign verification](qa/2026-11-04/redesign/verification.md) for the executed checks, screenshots and remaining rollout scope.
