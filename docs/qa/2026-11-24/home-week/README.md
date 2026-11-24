# Large weekly workouts on Home

Baseline: `8f5370da88f7fa8356793f2fdc6ea5c14a858679` (staging/main, 24 November 2026). Branch: `feature/home-weekly-workouts`; target: `staging`.

The owner's final direction replaces the compact weekly preview with seven large, dated workout rows down Home. The artwork is original Taperday work using the existing runner, colours and typography. Plan uses matching rows, preserves drag/drop and adds visible Move buttons. Selecting a day shows its preview directly beneath that row. Post-race and recovery Home states keep their existing next action.

## Actual browser captures

These are the real application screens with synthetic API responses, the same fixed date (18 October 2026), fonts and account in both revisions. No runner data or provider account was used. Full-page captures include the unchanged fixed bottom navigation at its viewport position.

| Screen | Before | After |
| --- | --- | --- |
| Home, 375px, Night Run | [Before](before/home-375-dark.png) | [After](after/home-375-dark.png) |
| Home, 375px, Daylight | [Before](before/home-375-light.png) | [After](after/home-375-light.png) |
| Plan, 375px, Night Run | [Before](before/plan-375-dark.png) | [After](after/plan-375-dark.png) |
| Plan, 375px, Daylight | [Before](before/plan-375-light.png) | [After](after/plan-375-light.png) |
| Home, 1440px, Night Run | [Before](before/home-1440-dark.png) | [After](after/home-1440-dark.png) |
| Home, 1440px, Daylight | [Before](before/home-1440-light.png) | [After](after/home-1440-light.png) |
| Plan, 1440px, Night Run | [Before](before/plan-1440-dark.png) | [After](after/plan-1440-dark.png) |
| Plan, 1440px, Daylight | [Before](before/plan-1440-light.png) | [After](after/plan-1440-light.png) |

## Verification

- Frontend lint and TypeScript passed; the complete frontend suite passed **148 files / 1,122 tests**. The affected Home, post-plan, weekly and drag suites passed **73 tests** again after the final layout correction.
- Initial Chromium browser checks passed **8 tests**: Home/Plan at 375px and 1440px in both themes, exact recording navigation through reload, keyboard Move, drag move and swap. New tests check actual row dimensions, vertical stacking, overflow and real axe WCAG A/AA results.
- Copy checker: **9 self-tests**, **4,163 pieces of copy / 285 files**, no spelling or style findings. Dependency audit: **0 vulnerabilities**; private glob security regression suite: **5 passed**.
- The new screen audits use `@axe-core/playwright` directly and save the complete results as attachments; they require actual passing rules and no violations. No WCAG rules are disabled. Firefox reproduces the existing native browser crash documented in `e2e/axe.ts` / PR #276, in both default and legacy adapter modes. Its four audit cases are **explicitly skipped**, separate from its six layout/navigation cases, which all run. Chromium and both WebKit profiles perform all audits. No empty Firefox result is reported as an accessibility pass. Final browser matrix and complete GitHub CI results are recorded on the implementation PR.
- Local WebKit uses the matching Debian GLES library already extracted under the QA workspace. `LD_LIBRARY_PATH` and the local host-preflight override apply only to this machine; all browser engines and assertions still execute. CI installs its native dependencies normally.

The capture mode is opt-in: `HOME_WEEK_CAPTURE=1` with the desktop project. `HOME_WEEK_BASELINE=1 HOME_WEEK_FIXTURE_PORT=5186` captures the original revision from a separate local Vite server; this mode is only screenshot evidence, not an acceptance test. Ordinary CI runs all new assertions against the proposed implementation.

## Staging and production audit

Both branches pointed at the baseline above during inspection. [Production release 45395096500](https://github.com/Menzi-Thami/start-line/actions/runs/45395096500) passed deployment and its production smoke check on 24 November. This is deployment-log evidence, not a fresh authenticated production journey: direct live-site HTTP probes are blocked by this workspace's network policy.

[Staging deploy 45389697168](https://github.com/Menzi-Thami/start-line/actions/runs/45389697168) failed at database migration. Azure SQL returned **42119**: the November free database allowance is exhausted, and the database is paused until **1 December 2026, 00:00 UTC**. The staging smoke job was skipped. This is not fixed by the visual change. No billing settings, production data, merge or deployment were changed.

## Boundaries

The change does not alter training prescriptions, workout matching, saved completion, provider retention, race confirmation or achievements. Home opens an available recording by its actual ID; skipped/manual/expired-source boundaries remain explicit. Unknown check-ins do not become zero progress. Recording details and historical results stay in Runs/Journey. Physical device drag gestures, native sharing, Entra sign-in and a real provider import remain outside synthetic browser proof.
