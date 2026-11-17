# Account connection warm-up

A normal account request keeps the compact account-check line (or stays quiet above an already saved Home). After six seconds, the connection card reuses Taperday's volt runner on a moving track. It displays dependency-check results, concise copy explaining the wait, and optional tips about Strava, Journey, separate recovery and file uploads. It never reports a percentage or claims the account is ready before it responds.

Pause/Resume controls stop the runner and track. Reduced-motion users get a still runner without playback controls. Tips change only when Next tip is selected; connection progress does not cycle them. Live status announces actual dependency changes, decorative motion stays outside the accessibility tree, and the tips have a separate polite announcement when manually changed.

The card does not overlay Home, lock scrolling, move focus or change navigation. A saved greeting and navigation remain visible. Home's duplicate chapter-loading placeholder is suppressed only while the account connection already has its own loading state. The normal chapter/recovery UI resumes after the account loads. The existing 60-second account deadline and retry/sign-out behavior remain.

There is no minimum animation duration: the card disappears as soon as the account request completes. Health checks stop on unmount. This improves the waiting experience; it does not remove a hosting cold start. No Azure tier, billing setting, API behavior, database schema or provider retention changes.

## Screenshots

Normal motion is paused for consistent screenshots; the tests verify running, pause and resume styles before capture.

| View | Light | Night Run |
| --- | --- | --- |
| Phone, animation controls | [375px](warmup-375-light-no-preference.png) | [375px](warmup-375-dark-no-preference.png) |
| Phone, reduced motion | [375px](warmup-375-light-reduce.png) | [375px](warmup-375-dark-reduce.png) |
| Desktop, animation controls | [1440px](warmup-1440-light-no-preference.png) | [1440px](warmup-1440-dark-no-preference.png) |
| Desktop, reduced motion | [1440px](warmup-1440-light-reduce.png) | [1440px](warmup-1440-dark-reduce.png) |

## Validation

- `SignInWait.test.tsx`: delayed appearance, quiet saved Home, pause/resume, manual tips retained through health-stage changes, reduced motion, retry/sign-out and health-loop cleanup.
- `sign-in-flow.test.tsx`: existing fast account behavior, verified health ordering, cached Home, retry and sign-in regression cases remain; wording now states that the account is still loading after health checks pass.
- `account-loading-recovery.spec.ts`: real App, controlled pending account request, cached Home and navigation retained, no duplicate chapter spinner, timeout and retry, CSS animation pause/resume, reduced motion, tips, and immediate opening after the pending request resolves without another retry or a film-end delay.
- Both themes at 320, 375, 820 and 1440px: all WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags, overflow checks and mobile/desktop screenshots.

All account and provider responses are synthetic. No real runner data is used. Contrast audits wait for actual theme transitions to finish without disabling WCAG checks or the controlled runner animation. Browser projects emulate devices; they do not establish physical-device or live Entra/Azure behavior. Final counts, screenshots and CI links are recorded in the PR.
