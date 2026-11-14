# Taperday PR #262 — finish the implementation

You are the implementation owner for `Menzi-Thami/start-line`, PR **#262**, branch **`feat/finish-line-journey`**. Your job is to **complete the real working product**, not produce another plan, placeholder UI, or mockup. You have permission to use your normal GitHub and local development tools, but do not merge or deploy until verified.

## Required first reads

1. `CLAUDE.md`, `.claude/rules/engineering-principles.md`, `docs/testing.md`.
2. `docs/features/finish-line-recovery-handover.md` — product, APIs, lifecycle, safety, test matrix.
3. `docs/features/visuals/README.md` and the two committed SVG visual references:
   - `docs/features/visuals/finish-line-mobile-storyboard.svg`
   - `docs/features/visuals/finish-line-desktop-storyboard.svg`
4. All current commits and review comments in PR #262; inspect existing implementation before changing it.
5. Existing design system / brand, PlanView, Home, calendar, Run/Strava/check-ins, archived plans, database and authentication.

## Non-negotiable product contract

**Training complete is not race complete.** Confirmed training may trigger a unique celebration, but only an explicit race result or safely verified race recording unlocks the race-specific result/medal. A past date does not prove a completed workout or race. Recorded/Strava-only provisional evidence must not be silently turned into permanent achievements.

**Rest is scheduled, not absence of a workout.** The calendar must show Rest only within an active training or accepted recovery plan. Before/after plan bounds, dates are neutral. Preserve independently recorded runs outside plans and correct calendar/day detail accessibility labels.

**Recovery is optional and readiness-gated.** After actual race completion, offer an adjustable conservative recovery plan based on event distance/effort and symptoms. No compulsory hard training, no punitive missed-rest days, no fixed medical return-clearance or autoprescribed intervals. User can pause, extend, decline and choose maintenance or another race only when ready. Escalate concerning symptoms to professional care rather than prescribing exercise.

**Keep the Taperday brand.** Use existing Night Run colours, fonts, logos, cartoon runner and animation language, responsive desktop/tablet/mobile patterns, current nav, light/dark modes and reduced-motion support. The SVG storyboards specify structure and intent, not a rebrand.

## Execution mode

- Begin with a brief inventory of what is **already implemented**, **partial**, and **missing**. Do not mark TODOs complete because files exist.
- Work sequentially and independently until all acceptance tests are green or a real blocker prevents continuation. Avoid requesting confirmation for routine engineering decisions; make conservative choices.
- Refine/fix the first frontend slice already in #262 (semantic completion checks, existing saved plans, animation, share/download, focus and reduced motion).
- Build durable account-backed history of past/archived plans, confirmed training achievements, race results, and coherent source-attributed statistics with data migration, authorization, optimistic concurrency and idempotent award creation. Preserve user history when a plan is replaced.
- Build race-result capture/status and separate race celebration and goal-versus-actual recap.
- Build the real recovery generator with versioning, optional easy/rest/walk phases, readiness check-ins and safe progression, persistence and Home/Plan/calendar integration.
- Add maintenance running (no mandatory race) and explicit next-race transition; never replace a saved plan without consent.
- Ensure past finished plans show their earned achievements on first release (retrospective migration/eligibility).
- Use existing APIs and components where applicable; add server contracts only where needed, regenerate frontend schema, and do not modify existing immutable plan-generator version outputs.
- Commit logically scoped changes to the **same PR branch**. Update PR body/checklists and implementation handover as work progresses.

## Tests: actually run and report

- Run repo-required `scripts/check.sh` only on disposable local test services, never production SQL/data. Run .NET build/tests, client lint/typecheck/unit/build, integration and Playwright E2E. Do not claim a pass unless you observed it.
- Verify complete runner journeys from signed out / new signup / existing current plan / legacy completed plan / archived plan, then race confirmation, recovery, maintenance and next race.
- Cover plan starts mid-week, finishes mid-month/week, moved run, CutShort, Skipped, provisional Strava expiring, duplicate sync, multiple activities on a day, race DNS/DNF, injury and fatigue, time zones, data unavailable, deleted plans, migrations, offline PWA.
- Verify mobile screen sizes including 320/375px; tablet and desktop 768/1024/1440; dark and light modes; installed PWA where practical; Safari/WebKit and Chrome. Reduced motion, keyboard, dialog focus and 44px touch targets. Capture **actual screenshots** to versioned `docs/qa/` paths and reference them in the PR.
- Fix genuine failing checks and regressions, don't bypass validations or fake tests. If a test environment or connected service is unavailable, document the exact limitation and keep PR draft.
- Ensure sign-in email, Strava sync, movable runs, plan builder and active plan navigation continue working.

## Completion definition

Only claim 'ready to merge' once backend, frontend, persistence, visual UX, accessibility, acceptance tests, QA screenshots, and an end-to-end scenario on staging are verified. Report test commands and counts, screenshots, known limitations, migration concerns and rollback strategy. Follow the repo's release policy: stage, QA, then promote to production **only after explicit approval**. No AI co-author lines or AI attribution in commits.

## Final handover response

Return: (1) PR URL + commit SHA; (2) feature-by-feature completed/remaining table; (3) test results with executed commands; (4) screenshot links; (5) staging QA outcome; (6) any blocker and concrete fix; (7) merge/readiness verdict.

**Do not stop at a code review, prompt, plan or mockup. Complete the implementation and test it.**
