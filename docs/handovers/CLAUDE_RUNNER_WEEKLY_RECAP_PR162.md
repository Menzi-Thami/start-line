# Claude handover — runner weekly recap emails (PR #162)

**Date:** 2026-11-01  
**Owner taking over:** Claude  
**PR:** https://github.com/Menzi-Thami/start-line/pull/162  
**Branch:** `feature/runner-weekly-recap-email`  
**Head before this handover:** `704678190d2b81099f3a92d6b4ba5c82bc144b5a`  
**Status:** OPEN, DRAFT, **DO NOT MERGE OR DEPLOY YET**. Both CI workflows (security and full pipeline) passed at that head. A new docs-only commit will rerun checks.

## User's request

1. Send a **weekly training recap to opted-in runners**: what happened last week and what's next.
2. Make the email match the approved Taperday **Frame** style (grey ground, white rounded card, sage, Instrument Serif/Sans with fallbacks, mascot). The user asked for site-like animation: most email clients strip CSS animations and scripts, so use reliable static email-safe HTML and optional lightweight progressive enhancement only if compatible; do not promise animation in Outlook.
3. **Stop the owner's operational Monday report** that they currently receive.
4. **Send the first test to `paulmenzi@outlook.com`**, and **do not enable bulk delivery before the user reviews it**.
5. Keep this PR open so Claude can finish it. Do not merge or deploy without confirmation.

## Implemented in PR #162

- `src/StartLine.Infrastructure/Email/RunnerWeeklyRecap.cs`: Frame-styled HTML + plain-text recap; sample metrics are runs and kilometres; intro and next-week link. Uses existing `EmailLayout.Wrap`, `Figures`, `Heading` and `Paragraph` rather than a separate design.
- `src/StartLine.Infrastructure/Email/RunnerWeeklyRecapWorker.cs`: scheduled worker. `RunnerWeeklyRecap__Enabled` defaults **false**. `RunnerWeeklyRecap__TestTo` triggers a **synthetic** sample preview on app startup if explicitly configured. Never include real runner data in a preview addressed to another recipient.
- `src/StartLine.Infrastructure/DependencyInjection.cs`: unregisters `WeeklyReportWorker`, registers `RunnerWeeklyRecapWorker`. This disables future owner reports **only when deployed**; existing production deployment remains unchanged.
- `client/src/features/account/ProfileForm.tsx`: weekly-email opt-in label updated.
- `docs/runner-weekly-recap.md`: current rollout instructions and constraints.

## IMPORTANT: production gaps to close

- **Idempotency/delivery ledger:** worker must track a unique runner + week, avoid repeat emails after restarts/retries/multi-instance deployment; handle partial failure, cancellation, sending status and race conditions. Consider a database entity + new additive EF migration; never edit deployed migrations. Verify using SQL integration tests.
- **Per-runner timezones:** existing worker schedules all runners Monday 07:00 SAST; preference and profile copy imply runner-local timing. Move to local-time windows and timezone-aware scheduling.
- **Actual weekly data:** existing worker sums visible `Activities` for a SAST date range only. Integrate `RunningLogReader` / check-ins and deduplicate consistently; respect Strava 7-day retention and policy 6.2 (nothing derived from Strava stored, calculate from visible cache on read). Avoid double counting and ungrounded progress claims. Make next-week copy useful but evidence-based from the current plan.
- **Weekly preference unsubscribe:** `Runner.WeeklyEmails` is separate from `UpdateEmails`. Existing update-email unsubscribe endpoint should NOT turn off the wrong preference. Add a secure one-click / in-app weekly-email-specific mechanism if feasible, and keep settings synced.
- **Safety and scale:** validate opt-in and recipient at send time, cap/send rate within Brevo limits, retry transient errors safely, respect privacy, avoid logging email addresses or personal run data. Handle no-plan/no-run/expired Strava data and invalid timezones.
- **Email rendering:** preview Outlook desktop/mobile, Gmail and dark mode with 320px+ widths. Inline styles/accessible plain-text fallback; links and mascot should work. No unsupported motion or external scripts. Reuse approved Frame tokens, not Night Run branding.
- **Tests:** domain/template tests, timezone/zero-run/dedup/opt-out tests, idempotent dispatch integration tests and CI. The first implementation is a **test-preview prototype**, not a complete production mailer.

## Test-first release procedure

1. Finish above safeguards on this PR. Keep `RunnerWeeklyRecap__Enabled=false` by default.
2. Confirm both workflows green and deploy explicitly with the user’s approval.
3. In Azure App Service `app-taperday-api-3ghg5t` configuration, set:
   - `RunnerWeeklyRecap__Enabled=false`
   - `RunnerWeeklyRecap__TestTo=paulmenzi@outlook.com`
   - Keep existing `Email__BrevoApiKey` secure; never paste it into code, GitHub or chat.
4. After app restart, a **synthetic test** (currently 3 runs / 24.5 km) should be sent once per startup to that address. **No email has been sent as of this handover**; GitHub integration alone cannot modify Azure configuration or trigger Brevo.
5. Inspect the delivered email with the user. Clear `RunnerWeeklyRecap__TestTo` immediately after the test to avoid repeated sends on restarts.
6. Only after explicit approval and complete operational safeguards, enable scheduled runner emails.

## Other repository coordination

- User wants this PR **kept open** for Claude. Do not merge automatically even when CI is green.
- Original maker report is `src/StartLine.Infrastructure/Email/WeeklyReportWorker.cs` and `WeeklyReport.Compose`. Worker remains in source but is unregistered in the PR.
- Existing email documentation is `docs/email.md`; update it when the final design changes.
- PR #161 addresses the misleading signup “Coming soon” banner separately; don't accidentally overwrite its copy when reconciling `main`.
- Shoe Tracker #160 remains draft due to its EF migration; unrelated changes should stay out of this branch.
- No test messages or production sends have been initiated. The address above is the user's expressly selected test recipient.
