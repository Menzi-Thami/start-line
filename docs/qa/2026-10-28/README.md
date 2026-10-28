# Launch QA — 28 October 2026

Five independent personas used real Chrome against the production client build and real local API, starting in fresh browser contexts. First success means generating and viewing an actual training plan. The mobile persona used 375×812 touch emulation, 400 ms latency and 51,200 bytes/s download/upload throughput. These are controlled persona exercises, not a study of five human customers.

The initial impatient persona stopped at the first error. Its later recovery was recorded separately, not counted as baseline success. All five final reruns reached first success with no remaining reported usability findings.

## Consolidated findings, ranked by observed reach

Counts are distinct personas reporting each issue, not the number of screenshots or affected steps. The double-click defect was discovered during the first rerun and fixed before the final rerun.

| Rank | Finding | Observed reach | Change and final result | Evidence |
|---|---|---|---|---|
| 1 | Fixed header hides the newly focused wizard heading | 2/5: impatient, mobile | Scroll margin leaves focused headings below the header. Mobile headings measured 87.7 px against a 72 px header. | [Before](evidence/heading-before.png), [after](evidence/heading-after.png), [mobile before](evidence/mobile-before-heading.png), [mobile after](evidence/mobile-after-heading.png) |
| 1 | Review presents a preferred start as an actual start, despite existing plan-length caps | 2/5: mobile, literal | Start selection and review explain the possible later structured-training start. Generator rules and existing caps stay intact. | [Before](evidence/mobile-before-review.png), [after](evidence/mobile-after-review.png), [literal before](evidence/literal-before-review.png), [literal after](evidence/literal-after-review.png) |
| 3 | Pasted negative/junk numbers silently become positive training inputs | 1/5: breaker | Preserve the input and reject it with an accessible error. `-5`, pasted script text and `-20` weekly distance remain visible and invalid. | [Negative before](evidence/breaker-before-negative.png), [after](evidence/breaker-after-negative.png), [junk before](evidence/breaker-before-junk.png), [after](evidence/breaker-after-junk.png), [weekly before](evidence/breaker-before-weekly.png), [after](evidence/breaker-after-weekly.png) |
| 3 | Cold mobile load is blank, then adds a blocking intro | 1/5: mobile | Static branded loading status appears before React. Skip the intro when startup exceeds 2.5 seconds. At 1.5 seconds the loader is visible; a passive DOM observer confirmed no intro mounted during the throttled rerun. | [Before](evidence/mobile-before-loading.png), [after](evidence/mobile-after-loading.png) |
| 3 | First primary action immediately raises a validation error before any selection | 1/5: impatient | Initial action says “Choose a race” and focuses the choice without an error. Required-field validation still applies when building. | [Before](evidence/impatient-before-error.png), [after](evidence/heading-after.png) |
| 3 | Strength disclosure describes running and has unclear scope | 1/5: literal | “About this session” accurately describes the description/purpose disclosure; exercise cards and set controls remain visible. | [Before](evidence/literal-before-strength.png), [after](evidence/literal-success.png) |
| 3 | Double-clicking Continue can skip a question | 1/5: breaker, discovered during rerun | Ignore the second click in a double-click. A 60 ms double-click advances only to step 3; double-click Build sends one plan request. Added a regression test. | [Final step](evidence/breaker-after-double-continue.png), [independent results](breaker-rerun.json) |

The skeptic found no confirmed blocker: free pricing and the privacy policy were readable before generating a plan. The instance exposes no dedicated Terms link; this exercise does not establish a legal requirement for one. Hidden-radio automation actionability errors and normal browser Back behavior were excluded from product findings.

## User-reported strength persistence

Strength has a direct Add/Change strength days action. Rebuilding a saved plan with strength-only changes preserves its original build date and generator version. Same-race account edits offer “Save changes” immediately, explain when changes are unsaved, and confirm success. Saves reject concurrent double-clicks and remain retryable after errors. The runner must explicitly save an edited preview to keep it in their account.

Two frontend contract tests cover an existing account plan, adding strength, one save after double-click, save failure/retry, sign-out and a fresh sign-in with local storage cleared. These use controlled authentication/API responses; they are not live Entra or SQL proof. A new database-backed integration test checks that adding strength updates the same saved plan ID and that a new authenticated client retrieves its strength inputs and sessions; it compiled but could not run without SQL Server.

The literal persona additionally verified real anonymous strength editing: Monday remained selected, Wednesday was added, `gym=mo.we` survived reload, and both generated sessions remained visible. [Reload evidence](evidence/literal-strength-reload.png).

## Final persona results

| Persona | Final result | Evidence |
|---|---|---|
| Impatient | First plan success; first action gives guidance; focused heading visible | [Screenshot](evidence/impatient-success.png), [observations](impatient-rerun.json) |
| Skeptic | Privacy → back → real plan success | [Privacy](evidence/skeptic-privacy.png), [success](evidence/skeptic-success.png), [observations](skeptic-rerun.json) |
| Mobile | Slow 3G plan success; loader, no intro, visible headings, no horizontal overflow | [Success](evidence/mobile-success.png), [observations](mobile-rerun.json) |
| Literal reader | Accurate start wording, strength overview, edit and reload | [Success](evidence/literal-success.png), [observations](literal-rerun.json) |
| Breaker | Invalid input rejected; answers survive in-app Back; double actions safe; plan success | [Success](evidence/breaker-success.png), [observations](breaker-rerun.json) |

JSON observations preserve original workspace paths for the complete raw screenshots. The selected before/after images linked above are committed alongside this report.

## Validation and launch limits

- Frontend TypeScript, lint, all 488 tests across 54 files, and production build pass. npm audit reports zero vulnerabilities. Main JavaScript: approximately 436 kB before gzip / 134 kB gzip; auth remains a separate lazy chunk.
- Strict backend build: zero warnings/errors. API production publish passes. Formatting and model/migration checks pass; no schema change. EF tooling currently warns that 10.0.12 is older than runtime 10.0.13.
- Backend: 812 domain, 103 application, 7 architecture and 25 SQL-independent integration tests pass (947 total).
- Real-browser suite: 17 desktop/phone checks plus 4 Android Chromium emulation checks pass. Coverage includes keyboard charts, reduced motion, calendar feed, share/reload, offline PWA, and representative phone/tablet/desktop/ultrawide layouts.
- Live account registration, Entra sign-out/sign-in and SQL-backed persistence remain unverified. No SQL connection was supplied; SQL Server download redirects are denied by this environment's network policy. The full `scripts/check.sh` gate has therefore not passed. Keep the PR in draft until database integration checks pass.
- Mobile Safari/WebKit and physical iPhone, Android and iPad checks remain outstanding. Chromium device emulation is not physical-device proof.
- Deploy logs and PR creation through GitHub's API remain blocked by `api.github.com: Forbidden`. The supplied 07:51 UTC failed-run log shows `TS2769` from `exact: true` in `Home.test.tsx`; commit `49f4882` already removed it and is merged into `main`. Current production builds pass. Separately, the owner reports Azure SQL has exhausted its monthly free allowance. That requires the allowance reset or an explicit billing-tier decision; no code fix replenishes it. Production migrations/readiness remain unverified. See [deployment recovery](../../deploy.md#investigating-a-failed-deploy).
- GitHub's website provided a read-only fallback: run #87 failed Build website, while #88 and #89 both reached and failed Migrate database. Detailed signed-in logs were unavailable. This confirms that the two later runs passed the previous build failure; it does not establish SQL recovery.
