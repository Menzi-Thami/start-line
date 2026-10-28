# Basic SQL follow-up

This follows the initial [five-persona QA exercise](README.md). Main now includes Basic SQL preparation and deploy
[#90](https://github.com/Menzi-Thami/start-line/actions/runs/40711039696) succeeded. The free monthly database
allowance is no longer a reason to show a database-waking screen, though the free API host can still cold-start.

## Account loading and plan creation

- Account loading shows a compact status and opens the page as soon as its request finishes. Dependency health
  checks start only after a slow response; retry and sign-out remain available.
- The runner film appears on the final review/build step for a new plan. It does not appear during account loading
  or when editing an existing plan. It never delays completion of the API request or opening the ready plan.
- Twenty training tips advance with Next tip, giving readers time to finish. Pause/resume controls the film,
  and the operating system's reduced-motion preference stops scene changes and animation.
- Email one-time codes remain the authentication method. This PR changes no Entra configuration or credentials.

The review/build theatre was checked against the real API: [375 px](evidence/plan-theatre-375.png) and
[desktop](evidence/plan-theatre-1440.png). Reduced motion is enabled in these screenshots.

## Strength work

- Strength-only edits retain the original plan inputs, including its build date, custom start date, generator
  version and any replan settings. An unchanged historical custom start is allowed for those edits; new start
  choices still use normal date validation.
- After building, Save changes persists account edits. Unsaved and saved messages distinguish the two states.
- Strength sessions have their own workout cards and exercise counts, without running distances or pace labels.
  Home says No run today when strength is the only session, with the strength card below it.
- The weekly strip requires strength's own completion ticks; an uploaded run cannot tick strength off. The four
  running days still count as four runs when strength is added.
- The generator already excludes strength on the long-run day. The form now explains that rule and disables new
  conflicting selections. An old conflicting selection can be unchecked and corrected, with a validation message
  instead of silently accepting a session the generator will omit. No generator rule or historical plan output changes.

[Mobile strength card](evidence/strength-card-mobile.png), using an anonymous generated plan. Strength-day choices
also remain expanded when the last selection is removed, making it possible to choose a replacement immediately.

## Validation

The first full [branch CI run #185](https://github.com/Menzi-Thami/start-line/actions/runs/40712645895) passed,
including the new SQL-backed account-persistence regression. Later changes extend the test to verify original
running sessions and selected strength weekdays, and add historical custom-start and replan coverage on the client.
The [latest branch runs](https://github.com/Menzi-Thami/start-line/actions?query=branch%3Afeature%2Flaunch-qa-strength-persistence)
publish checks for the final revision: backend formatting/build, all SQL-backed tests, model/migration verification,
frontend lint/types/tests/build/audit, and real-browser scenarios. CI is enabled on push for this branch only.

SQL tests use a disposable SQL Server container on the GitHub runner, never the production Basic database. Local
SQL access remains unavailable. Frontend tests model account sign-out and a fresh session with device storage
cleared; API integration tests use test authentication. These do not establish live Entra identity-provider behavior.
Physical-device and mobile WebKit validation remain outstanding.
