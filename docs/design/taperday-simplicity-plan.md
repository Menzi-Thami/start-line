# Taperday simplicity implementation plan

Status: application implementation and visual QA complete in PR #275. The dependency audit blocker has a temporary private security backport; current validation and review readiness are recorded on the PR.
Branch: `feature/taperday-simplicity-plan`. Target: `staging`.
Baseline inspected: `e09ca85fa6e90bbe5deacc778f0f2dacb42f1124` (PR #272).
Prepared: 17 November 2026.

## Start here

This is the single implementation brief and progress tracker for this refinement. A developer should be able to complete it without the original conversation. Continue the branch and PR containing this file; update its checklist and evidence instead of opening a competing redesign or copying the plan elsewhere. If the owner merges this planning document separately, use the same canonical document to track the subsequent implementation.

The owner subsequently authorized completing the implementation in this same PR. Merge and deployment remain separate owner actions. This document continues to track the delivered behavior and actual validation evidence.

Read [repository instructions](../../CLAUDE.md), [engineering principles](../../.claude/rules/engineering-principles.md), [testing](../testing.md), and [shipping](../how-we-ship.md). Check the latest branch, open PRs and runtime contracts before coding; the inspected baseline is a reference, not a reason to overwrite later work.

## Product outcome and agreed decisions

Opening Taperday should make today's priority immediately clear and require little administration. A connected recording should arrive without a logging form. Home remains a familiar home throughout training, racing, recovery and time between plans.

The reference [film portfolio](https://www.njabsdladla.com/film) and the supplied React prototypes inspire restraint: one focus area, strong hierarchy, short copy and quieter secondary content. They are layout references, not replacement applications or verified datasets. Their proposed navigation, state selectors, fixtures and fake imports are not approved production behaviour.

Decisions already made:

- Keep the welcome greeting, wordmark, existing runner animation, current type families, Night Run identity, theme choice and familiar navigation.
- Give Home one priority area and at most one prominent action. A rest day need not manufacture an action.
- Show today's workout before asking someone to log it. Manual entry remains easy to find and is secondary when an actual workout is available.
- A concluded training plan becomes history. Recovery is a separate optional plan, never an extension of the training dashboard.
- After recovery's schedule ends, Home stays calm without requiring a checklist of daily completion buttons and a final housekeeping button.
- Journey remains the destination for completed chapters, race history, achievements and trophies. Runs owns recordings and their details. Plan owns the full schedule and coaching.
- Reuse available facts. Preserve uncertainty, explicit confirmation, provenance and the distinction between a prescription and what happened.
- Improve existing components and services. Do not paste either prototype over `App.tsx`, introduce a new visual framework, or replace working persistence with local React state.

## Current implementation to reuse

| Area | Starting points | Responsibility to preserve |
| --- | --- | --- |
| Shell and navigation | [`App.tsx`](../../client/src/app/App.tsx), [`TabBar.tsx`](../../client/src/app/TabBar.tsx) | Home, Plan, Runs, Journey, Account; existing conditional Plan visibility, desktop behaviour, Back/Forward and deep links |
| Actual design system | [`main.tsx`](../../client/src/main.tsx), [`tokens.css`](../../client/src/styles/tokens.css), [`theme.ts`](../../client/src/lib/theme.ts), existing feature styles | Inspect the CSS import cascade. Runtime imports currently use Instrument Serif and Instrument Sans; older design documents describe previous fonts. Reuse runtime tokens and components rather than adopting the prototypes' palette, Inter or replacement runner glyph |
| Home | [`Home.tsx`](../../client/src/features/runner-home/Home.tsx), [`LatestRun.tsx`](../../client/src/features/runner-home/LatestRun.tsx), [`JourneyHomeCard.tsx`](../../client/src/features/journey/JourneyHomeCard.tsx) | Greeting, today's session, source-aware measurements, recent activity and real navigation callbacks |
| Lifecycle and state | [`journey-model.ts`](../../client/src/features/journey/journey-model.ts), [`useJourney.ts`](../../client/src/features/journey/useJourney.ts), [`TrainingLifecycle.cs`](../../src/StartLine.Application/Features/MyPlans/TrainingLifecycle.cs) | Existing training conclusion, local dates, archived/concluded chapters, current-plan association and independent recovery |
| Race discovery and review | [`race-match.ts`](../../client/src/features/journey/race-match.ts), [`useRaceRecording.ts`](../../client/src/features/journey/useRaceRecording.ts), [`RecordedRaceSuggestions.tsx`](../../client/src/features/journey/RecordedRaceSuggestions.tsx), [`RaceResultForm.tsx`](../../client/src/features/journey/RaceResultForm.tsx) | Candidate evidence, ambiguity, actual metrics, confirmation, corrections and historical plans |
| Recovery | [`RecoveryPlanPage.tsx`](../../client/src/features/journey/RecoveryPlanPage.tsx), [`Recovery.cs`](../../src/StartLine.Application/Features/Journey/Recovery.cs), [`RecoveryPlan.cs`](../../src/StartLine.Domain/Journey/RecoveryPlan.cs), [`RecoveryGenerator.cs`](../../src/StartLine.Domain/Journey/RecoveryGenerator.cs) | Dated schedules, versions, pauses, extensions, readiness and red-flag gates |
| Recording details | [`MyRuns.tsx`](../../client/src/features/activities/MyRuns.tsx), [`ActivityPage.tsx`](../../client/src/features/activities/ActivityPage.tsx), existing analysis components | Selected activity identity, real splits/charts, upload and Strava sources, missing measurements, cache expiry, deletion and sharing |
| Durable history | [Plan history](../plan-history.md), [Journey and cabinet](../journey-and-trophy-cabinet.md), [finish-line API](../features/finish-line-api-contract.md), [run logging](../run-logging.md) | Saved histories, result time kinds, idempotent achievements, ownership, version checks and data retention |

The [focused-training document](night-run/focused-training.md) describes the existing navigation and detail destinations. Update it to the final implemented behaviour when this work is complete; do not silently remove its functionality.

### Existing open work

As checked on 17 November, these are independent open draft PRs:

- [#273](https://github.com/Menzi-Thami/start-line/pull/273), `fix/account-warmup-animation`, head `2abe018501ad574820910d05b4276933a1c9c1f9`: the slow account connection automatically plays the existing runner and rotates tips every eight seconds, with pause/resume, reduced-motion support and no Next tip button. Preserve this behaviour if integrated. It does not resolve a hosting cold start.
- [#274](https://github.com/Menzi-Thami/start-line/pull/274), `fix/strava-id-precision`, head `2b3c43836b4044206834114e1f22c04b365e9938`: browser-facing Strava identifiers are strings; provider ingestion remains exact C# Int64/SQL bigint. Do not reintroduce JavaScript-number conversions or undo generated API types.

Rechecked during implementation: both remain open draft PRs at the heads above, and staging remains at the recorded baseline. Their commits were integrated into this branch with merge commits `fc8f289` (#273) and `a9d6e2e` (#274). Neither dependency PR was merged to staging, closed or overwritten. Validation below covers their combined code with this refinement.

Both last reported a required audit failure on [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), whose expanded range included latest `picomatch@4.0.7` with no patched version then available. Recheck the current advisory and releases; this is dated evidence, not a permanent exemption. Do not lower audit thresholds, suppress the advisory or claim green CI while it fails.

## Screen design specification

### Home

**24 November 2026 refinement:** the owner superseded the compact-week direction below. During active training, Home shows all seven dated days as large, full-width vertical workout rows with original Taperday artwork, planned/recorded values and accessible links. Today stays first but takes less space. Plan uses the same visual language and keeps the full editing, drag/drop and explicit Move confirmation flow. This is a presentation change, not a new completion, matching or plan lifecycle. Post-race, recovery and settled Home states keep their existing calm next action; they do not acquire an old training week.

Mobile reading order:

1. Existing brand/theme header, welcome greeting and local date.
2. One focus area: a short context label, one headline, one concise explanation and at most one prominent action.
3. During active training only, the full seven-day vertical workout list and a link to Plan for editing. Each large row carries its date, workout, artwork and actual recording or clearly labelled prescription. Planned and actual values must remain distinguishable.
4. At most one compact recent-recording row with its actual date/source and a link to Runs. Keep it available after training and recovery end; hide the row gracefully if no recent recording exists.
5. Existing navigation, safe-area spacing and normal footer.

Desktop keeps the workout list full width beneath Today. It must not introduce another primary action or more Home modules. Reuse an existing panel for the focus area; use spacing and simple dividers for secondary content. Do not strip every container or replace pills with tiny controls.

Move weekly coaching review and adjustment controls to their relevant Plan location; keep essential current safety/coaching information available. Keep activity import/source diagnostics in Runs or Account, and historical detail in Journey. Preserve legacy links that currently open tools, reviews or settings and preserve unsaved calculator/form drafts. Do not merely conceal the existing dashboard beneath a large generic More disclosure.

Post-plan Home must not show an old prescription, stale feedback requests, training-completion chores, an obsolete weekly target, a 0 km progress hero, `0 / 0 km`, an empty weekly schedule, the full Training Story or a trophy cabinet. Archived chapters do not turn an experienced runner into a first-time onboarding state. Connection/setup/install invitations must not compete with the day's priority; ordinary setup lives in Account, with a concise contextual recovery action when a connection actually fails.

Use existing branding and straightforward copy: Today, Your week, Run details, Review my race, Open recovery plan, Choose my next challenge. Avoid Runner State, telemetry, manual provenance, numbered analysis zones and version numbers in runner-facing labels. An idle headline can be Ready when you are. Do not claim that a runner is recovered simply because dates elapsed.

### Home state and action matrix

This specifies presentation states, not new persisted status enums. Derive them from the existing current-plan, Journey, activity and recovery contracts. Dates use the runner's local calendar. Inject time into logic; do not implement a competing lifecycle in a component.

| Actual state | Focus and primary action | Required boundary |
| --- | --- | --- |
| Account/current-plan lookup pending | Retain a correctly scoped cached greeting/shell; one real connection status, then the existing automatic warm-up for a slow connection | Unknown is not no plan. No simultaneous chapter spinner, empty statistics or new-plan flash |
| Account/plan/Journey read failed | Retain safe known content and show one relevant Retry action | Failed history is not empty history. Do not expose a previous account's snapshot |
| Plan starts in the future | Start date and next scheduled workout; Open plan | Do not fall back to the first workout as today's run |
| Active running day, no matched recording | Today's prescription; Open today's workout | Manual logging is secondary; imported measurements do not come from planned defaults |
| Today's valid recording is available | Compact actual result/source; Open run details for that recording | Preserve the prescription and actual training/check-in status separately; a recording alone is not durable confirmation |
| Rest or strength day | Actual rest guidance or strength session; existing day/strength action only when useful | Do not require a run log on a rest day or treat a run as strength completion |
| Race day, no confirmed result | Race-day context; Open race day | No finish celebration or automatic finisher award |
| Training concluded, likely race recording | Short candidate summary; Review my race | Open the actual candidate and prefill its known metrics; confirmation still required |
| Training concluded, multiple/missing/expired candidates | Concise review invitation; Review my race | Reuse known race metadata, disclose missing recording and present choices only when needed. Historical review stays available in Journey without a permanent Home nag |
| Confirmed Finished or DNF result, no recovery chosen | Brief saved-result context; Start recovery plan while the offer is relevant | DNF may receive recovery but never a finisher award. Starting recovery remains a choice |
| Confirmed DNS | Neutral conclusion; Choose my next challenge | Do not imply a race effort or offer race-effort recovery by default |
| Relevant recovery active or paused | Today's dated guidance or paused status; Open recovery plan | One day's response does not advance the calendar, complete the whole plan or overwrite training history |
| Recovery schedule ended, or recovery Completed/Ended | Calm next-step focus; Choose my next challenge | No mandatory Finish recovery button, 0 km target or uncompleted-day backlog. Keep any relevant readiness/safety restriction visible |
| Maintenance/easy-running plan active | Today's optional easy-running guidance; Open easy running | Preserve its existing schedule; do not force a new race or recovery cycle |
| No current plan, including long after a past race | Familiar greeting and Ready when you are; Choose my next challenge | Same Home shell; history remains in Journey and recordings in Runs |

Resolution rules:

- Resolve current-plan loading and identity before using historical chapters. A newer active plan must not be replaced on Home by an unrelated past race or recovery.
- Use explicit activity associations and the existing evidence-based matching service. No `find(activity.date === workout.date)` shortcut: multiple recordings, additional runs, skips, non-running days and source expiry have distinct meanings.
- Use the existing recent-conclusion policy for a brief race/recovery invitation. Do not invent a new arbitrary timer or require a result before accessing Home or starting another challenge. Older unresolved results remain reviewable in Journey.
- A linked activity that no longer exists must show that specific recording as unavailable. Never substitute `activities[0]`, another race, or the first workout.
- Training concludes after race day using the existing idempotent lifecycle. The passage of time does not confirm any session, race finish or achievement.

### Recovery completion: presentation versus evidence

The existing API's `Completed` status and `canComplete` have readiness semantics. A schedule ending must not auto-submit `Complete`, set GoodToGo, clear red flags, or label the runner Recovered. Present an ended schedule calmly on Home while retaining the true server status and recovery history. Recovery detail can retain explicit pause, extend, end or readiness-confirmed completion controls.

Use actual dated recovery days and pause-adjusted `endsOn`, not the first unticked day. Missing ordinary daily completion ticks must not strand Home or keep presenting yesterday's task. Existing recovery readiness check-ins that gate exercise remain; simplifying routine logging does not remove safety gates. A paused plan does not progress by elapsed wall-clock days. Relevant seek-care guidance takes precedence over normal exercise invitations until resolved by the existing contract.

Do not replace the versioned, distance/effort-dependent generator with a fixed five-day program, generic heart-rate caps or automatically increased training. Persist any necessary lifecycle changes through existing versioned API commands; keep presentation changes read-only where possible.

### Run details and race review

- Open the selected recording by stable ID from Home, Runs, Plan or Journey. Back returns to the actual origin, including the selected date/filter. Refresh and direct URLs retain the same recording.
- Lead ordinary runs with distance and supporting duration/pace. Lead a saved race result with its confirmed finish time and the correct time-source label. Use the existing typography, tabular numerals and a quiet metric row.
- When official chip time is absent, show Recorded elapsed time or the stored time kind. Never display an elapsed-time fallback beneath an Official net time label. Runner-entered official time is not independently verified timing.
- Keep official event distance and actual recording distance distinct. Official race pace uses official time and the event distance when both are known; recorded pace uses its labelled recording time/distance. Never quietly replace GPS distance with the planned event distance.
- Keep moving time, elapsed time and official time distinct. Use existing server calculations and formatters, not duplicate constants or formulas in JSX.
- A short factual observation is optional. Do not repeat every visible number in prose. No inferred weather, heart-rate zone, readiness, corral delay or cardiac-drift claim without the evidence required for it. A faster final section is not automatically an equal-halves negative split.
- Splits must use their real distances/durations, include the final partial distance and label intervals correctly. A 1.10 km interval is not a one-kilometre split. `350 / 1.10` formats to approximately `5:18/km`. Account for split time bases and missing coverage; do not force split totals to equal chip time.
- Keep useful existing splits, charts, stages, heart rate, elevation, upload/delete/share controls and source information available through named detail sections. Avoid duplicate summary blocks or a second navigation system. Charts remain optional detail and must show a clear scale rather than exaggerating pace differences through unexplained normalization.
- Empty, malformed, zero-distance, equal-pace, time-only and partially available data must render honestly. Missing splits can affect imports too; do not always blame manual logging. No fabricated HR, effort or split samples.
- Retain FIT/GPX/TCX/ZIP uploads and manual entries as well as Strava. Phone runners without heart-rate hardware must have a complete usable experience. Do not advertise direct Garmin/Nike/Health integrations that do not exist.

### Logging, confirmation and saved history

Available recordings prefill their own actual metrics without re-entry. Brand-new manual measurements start blank; effort starts unanswered and stays optional. Preserve existing time-only logs, additional runs, edits and original prescription labels. Do not require the prototype's distance-plus-duration form for every kind of run.

Never convert a prescribed distance/pace into an actual result or label a manual record as imported. Imports can count in the current source-aware view under existing rules; durable check-ins, coaching evidence and achievements retain their current confirmation and retention rules. Strava cache expiry must not be circumvented by automatically copying provider measurements into permanent user history.

Race review reuses race date, event and available recording data. Ask only for unresolved choices and appropriate finish confirmation. Handle DNF/DNS, duplicate imports, more than one candidate, historical plans, corrections, failed saves and retries. Result corrections must reconcile or withdraw achievements/trophies under existing rules, and must not replay celebrations unnecessarily. PNG/SVG exports retain honest time/source labels.

Preserve stable IDs, optimistic concurrency, account ownership and idempotency. A concluded plan keeps its own check-ins and race snapshot; a recovery has a separate identity and saved history; replacing or removing a current plan must not destroy either. Home presentation must not delete/archive data merely to hide it. Continue paging Journey rather than loading every historical plan for a simplified screen.

## Accessibility, motion and mobile requirements

- Use current design tokens, runtime fonts and the actual runner component. No Tailwind or icon-library adoption is required for this work. Avoid another broad override stylesheet; edit the responsible components/styles and remove only redundant rules touched by the change.
- Verify both themes and saved/device theme selection, visible keyboard focus, semantic labels, heading order, keyboard navigation, screen-reader status/error announcements and 200% text zoom.
- Normal text needs at least 4.5:1 contrast; large text and meaningful non-text controls need the applicable WCAG contrast. Test actual rendered/composited colours, including placeholders, errors, disabled states and chart selections; comments claiming AA are not evidence.
- Use comfortably tappable controls (target 44px where practical), labelled chart alternatives and keyboard-operable split inspection. Avoid 21 tiny chart bars as the sole way to inspect values, clickable-only table rows, hover-only content or colour-only states.
- Honour reduced motion and existing pause/resume controls. No required animation wait, artificial progress, focus trap or new blocking transition. The loading animation must disappear as soon as the real request completes.
- Check 320, 375/390, 820, 1440 and 2560px. At minimum capture 375px and 1440px before/after in both themes. Preserve PWA safe areas, navigation clearance, text wrapping, browser Back/Forward and focus restoration.

## Ordered implementation and acceptance checklist

All phases belong to the same brief. Keep completed work and remaining work distinguishable. Update the tracker below with actual commits and evidence after each phase; never mark an item complete based on a mock alone.

### 1. Establish the actual baseline

- [x] Recheck staging and PRs #273/#274; reconcile dependencies without replacing their work.
- [x] Capture the real Home in training, just-synced, concluded-race, recovery, post-recovery and settled states. Record the commit and the current screenshot/source map.
- [x] Identify which current selectors, navigation callbacks, API contracts and tests already meet this brief; keep those implementations.

### 2. Specify and test state selection

- [x] Extend the existing lifecycle presentation model to cover the state/action matrix with explicit pending/error states and local-date inputs.
- [x] Test active/newer-plan precedence, race review/correction, multiple recordings, missing IDs, recovery dates/pauses/readiness and the long-settled state.
- [x] Confirm no date-only achievement, automatic subjective check-in, first-workout fallback or unrelated-activity fallback is introduced.

### 3. Simplify Home and relocate detail

- [x] Preserve the shell/greeting/navigation and implement the focus-area hierarchy in both themes.
- [x] Make workout opening primary, keep manual logging secondary and let real imports appear without a form.
- [x] Replace active-training dashboard repetition with a compact preview. Remove post-plan targets, stale coaching/feedback and redundant actions.
- [x] Keep a compact recent activity link after training/recovery; retain coaching, tools, history and their deep links in the appropriate destinations.
- [x] Verify the actual destinations and labels for every Home state; no blank or unrelated race review page.

### 4. Refine recording and race detail

- [x] Apply the simpler result/metric hierarchy to the real activity-scoped page and race review.
- [x] Preserve actual-vs-planned measurements, event-vs-recorded distance, time kinds, optional effort and every source's provenance.
- [x] Preserve useful analysis, partial splits, accessible chart/table alternatives, unavailable states, existing sharing and expiry behaviour.
- [x] Verify manual log, recorded import and reviewed result through save/edit/failure/retry/navigation/reload, including account and plan changes.

### 5. Finish lifecycle integration and historical access

- [x] Training conclusion retains the old chapter; recovery remains its own dated, readiness-gated plan.
- [x] Recovery's calendar ending gives a clean Home without daily tick or Finish recovery chores; no automatic claim of readiness or medical recovery.
- [x] Journey keeps plans, independent/plan-linked races and trophies accessible without an active plan. Manual catalogue-free race creation remains available.
- [x] Confirm a new challenge, optional maintenance and an old/paused/extended recovery cannot produce conflicting Home priorities or lose history.

### 6. Validate and prepare review

- [x] Complete the acceptance matrix below using synthetic runners and disposable local SQL, with no production/real runner data.
- [x] Complete mobile/desktop, both-theme, keyboard, reduced-motion and text-zoom review; commit before/after screenshots and a short evidence index under `docs/qa/<date>/simplicity/`.
- [x] Preserve every required local/GitHub check and add mandatory dependency exploit regressions; record results for the final SHA on the PR.
- [x] Update the existing focused-training/design documentation to the final behaviour, update this tracker and rewrite the PR summary around the delivered implementation.

Final review readiness is tracked by the PR's draft/ready state and checks for its current SHA. Mark it ready only after every required check passes and the evidence is recorded. Leave merging and deployment to the owner.

## Regression acceptance matrix

Extend existing tests rather than building a disconnected demo test suite. Use the real App/screens/hooks with controlled API responses for browser journeys; use the actual API and disposable SQL for persistence and ownership. Cover both successful transitions and failures.

| Scenario | Required observable result |
| --- | --- |
| Active workout, then automatic import | Correct recording appears with actual metrics and no input form; prescription remains identifiable; its details open immediately and after reload |
| Rest/strength day, extra run and multiple same-day recordings | No mistaken workout completion or double counting; additional runs remain visible on their real dates |
| Blank manual entry, time-only entry, edit and failed save/retry | No prefilled actuals or default effort; draft survives failure; one saved entry after retry; preserved IDs, dates and totals after reload |
| Past plan, single race candidate | Known fields are reused; appropriate confirmation creates one result; celebration/award occurs once |
| Ambiguous candidates, duplicate import, missing/expired source | No arbitrary winner, duplicated result/award or substituted recording; saved result/history survives provider-cache expiry according to retention rules |
| DNF/DNS and correction/withdrawal | Correct recovery eligibility, no inappropriate trophy, and consistent history after correction/reload |
| Training ends at local midnight and on another device | Home concludes training independently of race outcome; no stale dashboard or dependence on a cached profile |
| New plan while older history/recovery exists | Current plan has correct precedence and historical records stay accessible |
| Recovery missed day, no check-in, paused, resumed or extended | Current date and versioned schedule stay correct; no click-through progression; readiness/red-flag gates remain effective |
| Recovery window ends with or without completion status | Clean Home, no stale target or housekeeping requirement; status labels stay truthful and safety restrictions persist where relevant |
| Weeks/months after recovery, no current plan | Familiar Home with one next-challenge action, compact recent activity and working Journey; no 0/0 progress or onboarding reset |
| Slow/failed account, Journey, runs or plan requests | One appropriate loading/retry experience; no empty-history substitution, stale account leak or discarded successful edit |
| Navigation, direct activity/race links, Back/Forward and reload | Correct selected entity and origin restored; missing ID gives an honest unavailable state |
| Race card and PNG/SVG/native sharing | Actual time kind, distance and source remain accurate; exports work without new re-entry and remain readable |
| Light/dark, phone/tablet/desktop, keyboard, zoom and reduced motion | Same information hierarchy, no overflow/hidden CTA, accessible controls and no animation-imposed wait |

Relevant existing suites include `Home.test.tsx`, `HomeAfterTraining.test.tsx`, `HomeLanding.test.tsx`, Journey model/Home/recovery/race tests, `RunVisibility.test.tsx`, `useCheckIns.test.tsx`, activity lifetime/analysis tests, and browser journeys `account-loading-recovery`, `focused-training`, `phone-runs`, `run-data`, `run-history`, `calendar-day`, `journey-cabinet`, `journey-fallback`, `finish-line` and `ui-polish`. Locate the current files before extending them; names may evolve. Backend coverage includes Journey, recovery, race results, Strava imports, run-data and ownership tests. Add meaningful missing sequences, not tests that mirror CSS or duplicate existing coverage.

## Required validation and review evidence

Follow [safe testing](../testing.md). With a disposable local SQL connection and the repository SDK/Node versions, run `dotnet tool restore` and `scripts/check.sh` from the root. The required checks cover backend formatting, strict Release build/tests, architecture, EF model consistency, frontend lint/TypeScript/unit tests/build/audit and browser journeys. Also run the configured GitHub browser-engine matrix and secret scan. Preserve all existing assertions and report actual results, skips, failures and limitations for the tested SHA.

The implementation PR must link the canonical plan, list completed and outstanding work, include a state-by-state before/after screenshot index, report PNG/SVG/sharing verification, and distinguish browser emulation from physical devices and live authentication/provider delivery. Synthetic tests do not prove production cold-start reliability. Do not turn loading UX into a claim that hosting or account reliability has been fixed; investigate reproducible loading failures separately without billing changes or fabricated progress.

The initial planning commit was documentation only. Implementation validation is recorded separately in the QA index below; dependency PR counts are not presented as results of this combined revision.

## Scope boundaries

This is a refinement of Home, its relevant destination pages and the existing lifecycle presentation. Preserve catalogue-free/manual race creation and distances, anonymous/shared-plan generation, training versions, calendars, notifications, strength, imports, saved history and current source policies. No new data provider, unsupported official-result verification, training prescription changes, automatic achievement rules, authentication rewrite, retention exception, billing change or hosting migration is included.

Existing API contracts should normally suffice. If a real contract gap needs a backend change, make it minimal, version/concurrency-safe and covered by real integration tests. Do not introduce a parallel state model or a broad schema migration merely to implement a cleaner screen.

## Handoff record

| Work | Status | Evidence |
| --- | --- | --- |
| Canonical brief and repository/PR reconnaissance | Written | Baseline and open dependency heads recorded above; documentation changes only |
| Application implementation | Complete | Compact Home, explicit lookup failure/retry, actual recording identity, calendar-aware recovery, named detail destinations and simpler recording overview |
| Before/after visual QA | Complete: 44 matched before/after pairs | [Evidence index](../qa/2026-11-17/simplicity/README.md) |
| Local implementation checks | Application checks complete; dependency backport validated | Previous implementation: 1,010 frontend tests, 1,819 backend tests and affected browser runs passed. Backport: clean install/audit, five security regressions and 1,986 upstream tests passed; see QA index for the latest reruns |
| GitHub implementation CI | Final SHA/results and review readiness tracked on [PR #275](https://github.com/Menzi-Thami/start-line/pull/275/checks) | The required audit and all behavior checks remain enabled; keep draft until every required check passes |
| Merge/deployment | Not authorized | Owner review and explicit action required |

## Delivered implementation notes

- Home is split into its overview, `TodayFocus`, shared data hooks and a lazily opened `RunningDetails` destination. The overview does not mount its hidden controls while running details are open; calculator drafts remain mounted when their own disclosure closes. Selecting Home or the wordmark from a detail bookmark closes that view and updates the active navigation from the actual URL.
- `recordingForToday` prefers explicit saved/server associations, excludes skipped/additional runs and expired Strava copies, and requires a unique planned-session association for unlinked uploads. A manual confirmation without an activity ID never acquires another recording automatically.
- `recoveryOnHome` uses the actual calendar end, pause and seek-care state. Ending a calendar window changes presentation without a completion command or readiness claim. NextChapter still offers more rest/recovery, optional maintenance and a new race.
- A failed current-plan read remains unknown and exposes Retry current plan on Home, including after sign-in or on a fresh device. A later failure retains a known plan. It cannot silently show an empty account or strand the runner on the opening placeholder.
- Existing Strava, race confirmation/correction, offline edits, manual and time-only logging, strength, sharing and historical data contracts remain in use. No new API, schema, data provider, training prescription or retention exception was introduced.
- Browser tests open the actual destination controls. Full WCAG 2/2.1/2.2 tag sets stay enabled; fixtures use production theme initialization and assert the selected theme after reload. Home audits use a fresh document at each final width. The offline alert is audited on Home after closing running history, then history is reopened before reconnecting. No rule, audit threshold or behavior assertion is disabled.
- The audit blocker is addressed by a private, source-controlled `picomatch@4.0.7` security backport. The proposed upstream patch, provenance, compatibility limits and removal instructions are recorded in [SECURITY-BACKPORT.md](../../client/vendor/picomatch/SECURITY-BACKPORT.md). The audit database does not recognize the private fork, so required child-process exploit and consumer-resolution checks supplement the unchanged audit. Replace the backport when an official patched release is available.
