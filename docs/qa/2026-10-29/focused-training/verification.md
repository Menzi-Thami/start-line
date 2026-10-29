# Focused training QA — 29 October 2026

The user chose a Home focused on today's training and weekly progress, with the existing dark/volt identity retained. The screen map is in [the design guide](../../../design/night-run/focused-training.md).

| Journey | Evidence |
| --- | --- |
| Four main destinations; three Plan views; no extra Home tab strip | `focused-training.spec.ts`, actual App with synthetic authentication/API data |
| Today/week first; insights/tools discoverable; calculator opens by keyboard | Focused browser journey and Home tests |
| Imported activity versus prescription → log → retain one result → close/switch view | Focused journey, day-summary, running-total and source-association suites |
| Log on rest/strength/running days → navigate → reload → expire source | `run-history.spec.ts`, all original persistence/measurement assertions retained through the compact agenda |
| Log Wednesday → edit days/strength → failed save/retry → reload → move start | `plan-edit-history.spec.ts`, original manual/time-only/tick/Strava variants |
| Inline day open at a short phone viewport → one tap on Calendar | The browser first reproduced a missed click on both desktop and phone after source expiry; click-after-action dismissal now passes |
| Day controls retain keyboard behavior; agenda moves down one day | `WeekGlance.test.tsx` and existing calendar keyboard journeys |
| Profile draft → collapse → data/privacy → cancel deletion → reopen draft | Focused browser journey |
| Source imports/exports, upload errors, account erasure, old plan versions and strength persistence | Existing unit/integration suites, with explicit navigation to the newly grouped controls |
| Printing expands instructions without leaving compact sections open afterward | Existing plan-edit browser journey and before/after-print handling |

Test helpers open the same summaries a runner uses. They do not query hidden controls to bypass navigation. JSDOM does not consistently exclude closed native-details descendants from role queries; unit checks assert actual visibility, with Chromium separately verifying the accessible controls and interaction order.

Focused browser checks have passed after the dismissal fix. Complete validation is in progress; final counts and tested commit are recorded before merge. Screenshots use synthetic runner/activity data only. No tests run against production SQL or real runner accounts.

Physical iOS/Android/WebKit, live Entra/Strava authorization and a new archived-plan browser are outside this validation. Existing source-retention and device-local strength limits remain unchanged; this change does not reconstruct previously deleted records.
