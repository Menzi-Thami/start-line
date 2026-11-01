# Taperday — Claude implementation handover and visual preservation contract
Updated 2026-11-01. Applies to roadmap PRs #140–#149 and follow-on corrections to already-merged #141, #142 and #145.

## The non-negotiable product brief
Taperday is a distinctive running coach for plans from 5K to ultras, not a generic SaaS fitness dashboard. Give runners the next useful decision quickly, with optional deeper data. Preserve existing React/TypeScript/Vite PWA, .NET API, persisted plans, Strava and FIT/GPX/TCX import, completed sessions, calendar, strength, alerts, dark mode and share stickers.

## CURRENT design source of truth (do not use older concept mockups as overrides)
Read **docs/design/race-signal/style_guide.md** and **client/src/styles/tokens.css**, **skin.css**, **landing-refresh.css**, plus existing component CSS and actual production screenshots before any UI work. Despite early conversations using the name "Night Run", the implemented design is **Frame**, with a landing-specific dark hero refresh. Keep the current approved implementation, not an unrelated redesign.
- A grey outer page and rounded paper frame, soft surface cards without heavy borders or shadows, compact deliberate spacing.
- Sage is the brand accent. Light tokens include page #e4e4e4, paper #fff, surface #f3f3f3, sage #b4c7a8, deep accent #4f6f45, ink #111. Respect tokenized dark mode; never hardcode light-only surfaces.
- Instrument Serif **weight 400** for editorial headings and key figures; Instrument Sans for UI and tabular figures. Do not add a new font, neon gradients, generic stock cards, badges everywhere, or decorative illustrations.
- The real landing runner artwork is **client/public/landing/runner.webp**. Preserve its crop, overlay placement, genuine dynamic countdown, existing conversion CTA, and masthead. Do not replace it or reintroduce duplicate sign-ins.
- Existing run-share PNG/sticker designs must remain available. Keep them separated from the Run Journal's primary metrics; don't remove export/share/copy options.
- Preserve four app destinations **Home, Plan, Runs, Account**; mobile nav remains accessible, existing plan tab gestures and date deep links should continue working.
- Use CSS tokens, scoped selectors and existing shared components. No broad global restyles, token rewrites or CSS resets. Avoid per-feature style forks.
- No excessive words or forced onboarding. Leading information: next workout, weekly progress, race countdown; drill-down for analysis.
- Motion: use existing duration/easing tokens and prefers-reduced-motion. Targets >=44px; keyboard and screen-reader support. Contrast >=4.5:1 for text, >=3:1 for meaningful UI strokes. Responsive 320/390/768/1024/1440/2560, Safari iOS PWA and desktop. No horizontal overflow.

## Delivery discipline: one PR at a time, FULL scope
1. Start from latest main; inspect existing implementation and tests; identify all files touched by parallel feature PRs and resolve overlapping imports. Do not overwrite changes from other merged PRs. Keep each feature independently testable and migration-safe.
2. Implement complete UI + APIs + validated persistence, migrations as needed, accessible states, real data derivation, and tests. Never treat a localStorage-only placeholder, static tips, plain text export, online/offline label or text-only share as final delivery of advanced requirements.
3. No hallucinated HR or medical diagnosis; indicate prediction uncertainty and missing data. Keep recommendations inspectable, accept/reject actions explicit; never change plans without confirmation.
4. Before merging: lint, typecheck, frontend tests, backend build/tests/migration consistency, Playwright phone+desktop; screenshot comparison for light/dark desktop+phone, runner photo/landing, Home/Plan/Runs/Account, sticker modal, builder and race mode. Check 320–2560 widths, reduced motion, offline and loading/error states. Fix failures without disabling tests.
5. CI green is necessary, not sufficient. If new provider permission, live integration, OAuth scopes, Garmin/Apple watch support or migration cannot be verified, label BLOCKED and document exact missing work. No fake compatibility claims.
6. Rebase or rebuild against latest main before merge and verify PR diff only includes intended files. Avoid premature merging; confirm production deployment after each merge and inspect telemetry.
7. Native GitHub auto-merge may be disabled in repo. Do not bypass branch protections or force updates to main. Make merge/deploy explicit and verified.

## Roadmap-specific acceptance gates
- **#140 Training Intelligence** — derive real load, consistency and relevant effort trends from deduplicated runs and completed sessions; explain with evidence; handle insufficient/incorrect data; present actionable plans suggestions with explicit approval and audit history; no unsafe automatic progression.
- **#141 Recovery readiness (already merged as starter)** — persist account-linked optional subjective check-ins, history and edit/clear, integrate with plan adjustments cautiously, avoid medical diagnosis; local-only prompt is insufficient.
- **#142 Life Happens (already merged as starter)** — user-selected missed run/time/travel/illness/moving long run flows that propose actual schedule edits, respect hard-day spacing and plan history, preview and confirm/revert; static coaching text is insufficient.
- **#143 Progress Story** — meaningful 4/8/12-week real charts, consistency, appropriate pace comparisons, long-run growth and race-goal progress, data availability/limitations and screen-reader equivalents.
- **#144 Shoes** — persisted per-run shoe assignment, account-scoped shoes, automatic totals with import/edit/delete/dedup, configurable mileage thresholds and optional reminders, accessible responsive views. Avoid claiming automatic mileage from manual local totals.
- **#145 PWA (already merged as starter)** — reliable app-shell and last-plan offline reads, explicit sync/pending/error/retry for allowed writes, tested iOS PWA startup, graceful offline route and notifications; online/offline text alone is insufficient.
- **#146 Structured workout export** — convert real SessionStep prescriptions into truly importable structured workout formats for precisely documented compatible destinations/devices; unit, interval and warmup/recovery validation; tests with import-capable readers; do not label a .txt list "watch compatible".
- **#147 Race Week** — real race-relative 7-day contextual mode with plan sessions, checklists, configurable reminders, pacing/fuelling *guidance* with conditions/caveats and post-race transition; user choices persist.
- **#148 Milestone sharing** — visual downloadable cards/images and device sharing for genuine PB, long-run, consistency, weekly and race milestones, privacy defaults and graceful fallback; text-only Web Share is insufficient.
- **#149 Data Quality** — source and sync-state provenance, dedupe/collision resolution, missing-data notices, transparent totals, errors/retry, exports/deletes, privacy, automated integration tests; a "source + missing" notice alone is insufficient.

## Current PR/release caveat
At handover time #138 and starter PRs #141/#142/#145 had merged. UX #137/#139 and advanced #140/#143/#144/#146–#149 were still in progress. Verify current status; GitHub may have changed since this note. Inspect PR checks rather than trusting earlier status reports.

## PR review deliverable
Each PR description must include: feature scenarios, out-of-scope limitations, API/schema/migrations, UX screenshots phone+desktop light+dark, CI links/results, accessibility, provider testing, rollback strategy, and conflict/integration resolution. Protect this design contract in code review.
