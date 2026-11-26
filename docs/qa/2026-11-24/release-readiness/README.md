# Release Readiness: implementation and QA evidence

Updated 26 November 2026. Start with the
[current completion handover in the existing QA contract](../master-regression-acceptance.md#current-completion-handover-26-november-2026)
and update the [existing results ledger](../master-qa-results.md). PR #326 merged into staging as
`16f013f1c76e67fcd12e2b6a45ebfb9355ed4d0f` on 26 November; continue the remaining auth work on #327 and verify the
new integrated build. The [Release Readiness Page](https://chatgpt.com/space/page_4e0cdceb0e188191b8f7265ba9eb9f8e)
remains the acceptance contract and live status tracker. This file records reproducible repository evidence; it is not a
second implementation plan. Baseline: staging `137deca5e29667f9ccde39c8904e89a2f60ad423` (PR #325).

**Production decision: HOLD.** The application fixes below do not resolve Azure quota, migrate Entra credentials or prove
physical-device sign-in. The owner authorised controlled production testing and deferred staging SQL restoration;
this is not general rollout or migration approval. The checks recorded below did not change tenant settings, billing,
production or real-runner data. Source integration does not establish a running deployment or live acceptance.

## Implementation

- Bound the complete plan build, original runner story, token lookup and edited-plan save to 30 seconds. Generation and
  the original film run concurrently. A failure offers an explicit retry with the same answers and expected saved-plan ID.
  Double submissions and late token/network completions cannot start another save or redirect after navigation, including browser Back.
- Keep interrupted edited-plan answers in the existing plan-link format under separate `editingPlan`/`editDraft` fields.
  Canonical plan fields remain the saved version until a successful write. Refresh opens the
  review screen without generating or saving automatically. A retry can update only the matching current plan and race;
  trusted history state binds the original account, tab and exact draft. Copied/altered links or a changed identity/current
  plan produce an unsaved preview requiring explicit replacement. The server's ownership checks remain authoritative.
- Bound API writes to 60 seconds and uploads to 180 seconds, including older Safari without `AbortSignal.timeout/any`.
  Unreadable responses become friendly errors. Writes are never automatically replayed after an uncertain outcome.
- Keep running actions independent, with at least 48 px height. Strength has one session heading, its actual mobility
  guidance and an explicit explanation that set ticks are device-local. Run feedback still uses the existing durable API.
- Add an owner acceptance guard to the production release workflow: exact tested staging SHA, direct HTTPS evidence link,
  explicit confirmation, then the existing CI/deployment gates. The smoke-test override cannot bypass acceptance.
- Stop migrations immediately on Azure SQL monthly quota error 42119. Preserve transient cold-start/firewall retries and
  failure status through `tee`. No automatic billing change.

The original Night Run/Daylight palette, wordmark, runner story, reduced-motion behavior and navigation remain in use.
There are no generator, database model, identity-key or Strava-retention changes. AI coaching was retired in PR #295;
the acceptance target is the current rules-based preview/apply/undo behavior, not the closed PR #296.

## Executed local checks

| Check | Actual result |
|---|---|
| Frontend full unit/integration suite | 149 files, **1,134 passed** |
| Focused App/build-deadline/API/Strength regression rerun after draft recovery | **61 passed** |
| Frontend lint, TypeScript and production build | Passed; existing large-chunk advisory remains |
| Dependency audit / security regressions | **0 vulnerabilities**, **5 passed** |
| Backend format / strict Release build | Passed, 0 warnings/errors |
| Domain / Application / Architecture tests | **1,281 / 237 / 11 passed** |
| SQL Server integration tests | **438 passed**, disposable local SQL Server 2022 only |
| EF model vs migrations | No pending model changes |
| Integration configuration + release guard + actual migration-shell regressions | **15 passed** |
| Copy checker self-tests / repository copy | **9 passed**, 4,168 text pieces in 286 files, **0 problems** |
| New Chromium browser journeys | **11 passed**, including the complete real-time runner film, browser Back cancellation, copied-draft boundary and two supported-engine WCAG audits per theme |

The pull request and canonical Page hold the final full GitHub CI and browser-matrix links/results. Those checks must refer
to the final candidate, rather than borrowing results from an earlier commit. Interrupted runs are not counted as passes.
Browser fixtures use synthetic identities and recorded HTTP responses; they do not authenticate with Microsoft or Strava.
The local engine matrix uses Playwright Chromium, WebKit and Firefox. Missing local WebKit host packages are supplied from
an isolated library directory; CI installs its native browser dependencies normally. Firefox's existing axe crash is
explicitly annotated; its functional/layout assertions still run, and no empty axe result is presented as an audit pass.

## R01–R18 evidence and remaining acceptance

| Test | Repository verification / remaining gate |
|---|---|
| R01 existing-account migration | **BLOCKED.** Email-code rollback is documented in [Entra acceptance](../entra-pwa-acceptance.md). No supported credential migration has been executed or identity/data preservation proven. |
| R02 password/new account/reset/biometrics | **BLOCKED provider/device.** Auth fallback/unit/browser tests exist; they do not prove hosted signup, OTP-to-password conversion or native credentials. |
| R03 installed iPhone PWA | Simulated route/session/cache recovery in `auth-gate`, `pwa-auth-cache`, `account-loading-recovery`; **physical iPhone/real Entra still required**. |
| R04 Android/macOS/Windows | Engine emulation in CI; **actual platforms, credential managers and installed-PWA modes still required**. |
| R05 signed-out private routes/cache/offline | `auth-gate.spec.ts`, `pwa-auth-cache.spec.ts`; service worker retains app assets only. API integration authorization tests pass. Real installed-device acceptance remains open. |
| R06 configuration/token/tenant/CA | AuthProvider/AppAuth and API integration tests pass; read-only staging configuration report ran. **Real tenant/Conditional Access denial and redirect evidence still required**. No policy weakened. |
| R07 timeout/session recovery | `api-client.test.ts`, `AuthProvider.test.tsx`, `account-loading-recovery.spec.ts`; bounded requests and friendly errors. Real-provider failure acceptance remains open. |
| R08 full build to saved calendar | `release-readiness.spec.ts`: actual five-scene film, calendar and exactly one expected-ID save; existing `plan-theatre` and `plan-edit-history` suites. |
| R09 failures/double submit/refresh | Deadline unit tests plus browser hung-generation, stalled-save, delayed-token, changed-answer refresh, mismatched-plan and navigation tests. Existing API/offline/edit suites cover retries and history preservation. |
| R10 combined running/strength | Six-kilometre run, six exercises/18 sets; separate views, one heading, no overlapping actions at 320/375/390/768/1440 px; ticks survive reload. |
| R11 daily state/moves/rest | `DaySummary`, `SessionStructure`, `SessionAdjustment` tests; `simplify-plan`, `mobile-usability`, `home-week` journeys in CI. |
| R12 manual feedback/durability | `CheckInTests`, `useCheckIns`, `CheckInCard`, `post-run-rating`, `offline-check-ins`; no Strava requirement. **Second physical device acceptance pending. Strength set ticks are intentionally local, not cross-device feedback.** |
| R13 optional Strava | Existing mocked import/consent/completion/race regressions; **real opt-in staging integration validation blocked by missing isolated credentials**. Manual running remains available. |
| R14 safe adaptation | Existing Domain coaching rules, SQL `CoachTests`/`ReadinessTests`/`SessionAdjustmentTests`, UI preview/apply/undo tests pass. AI-invalid/down is **not applicable** after AI retirement; no AI integration was reintroduced. |
| R15 navigation/post-race | Existing `release-regression`, `training-recovery`, `finish-line`, `race-review`, `journey-cabinet`; new pending-build tab navigation and browser Back cancellation regressions. Live smoke still required after deployment. |
| R16 visual/accessibility | Theme screenshots below, 320–1440 px action geometry, raw axe WCAG 2/2.1/2.2 AA audits on supported engines. **Physical screen reader, OS text size and device checks remain open**. |
| R17 API ownership/cache | All 438 SQL integration tests pass, including cross-runner access, ID/identity handling and replay/idempotency coverage. Copied/altered draft links cannot inherit saved-plan edit permission. Browser anonymous/cache tests remain in CI. Tenant security acceptance still required. |
| R18 release/migration/smoke | Node tests execute the real migration workflow block for success, quota and retry cases; release guard rejects wrong SHA/unconfirmed evidence. **Staging deployment/smoke and approved production smoke/rollback remain blocked, not executed here.** |

## External blockers and owner handover

1. **Azure SQL allowance exhausted.** [Staging deployment 45474581558](https://github.com/Menzi-Thami/start-line/actions/runs/45474581558)
   failed with SQL error 42119. The log says the database is paused until **1 December 2026, 00:00 UTC**. Restoring earlier
   requires the Azure owner's explicit decision to continue with additional charges. Retrying deployments cannot fix quota.
   The owner subsequently deferred restoration and chose controlled production testing. Verify the approved exact test
   candidate and shipping route as described in the current handover. Normal staging/release gates remain in force;
   the test authorisation does not permit an automatic general rollout or a billing change.
2. **Existing-account password migration is not achieved by changing a user flow.** Microsoft states that changing the flow
   affects new users; existing users keep their original method. Current passkey enrollment requires eligible password-backed
   local accounts, MFA and dedicated credential-management implementation. OTP/social enrollment is not currently supported.
   Approve and verify a supported migration path with the tenant administrator and synthetic identities first; preserve the
   existing application identity and all plan/history/connection keys. Do not merge accounts by email or promise that
   Forgot password converts an OTP-only identity. See [authentication methods](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers)
   and [passkey requirements](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-sign-in-with-passkey).
3. **Real-provider and physical-device acceptance remains required.** The earlier implementation environment lacked
   Microsoft/Azure live-network access, provider credentials and physical devices. Claude must verify its own current
   authorised access; the PR handover reports Entra access, not physical-device availability. The historical read-only
   [staging configuration report 45478086720](https://github.com/Menzi-Thami/start-line/actions/runs/45478086720)
   recorded missing Strava/email/push integration settings and Data Protection key URI; recheck before use. Staging is intentionally isolated;
   missing optional providers do not prevent manual training, and production secrets must not be copied into it casually.
   Brevo app email configuration does not establish Entra OTP delivery. Configure isolated providers only if exercising them.
4. **Guard installation requires care.** A workflow dispatched on main uses main's definition. This PR cannot retroactively
   protect main before promotion. Follow the HOLD/acceptance checks manually for the first owner-approved promotion; the
   input guard is active after the workflow update reaches main. See [shipping instructions](../../../how-we-ship.md).

## Mobile before and after

These are synthetic 390 px Chromium captures of the current staging baseline and this patch, in both themes. Existing
staging had already separated the exercise list from daily running; this patch restores strength instructions and removes
the remaining repeated title. The reported historical screenshot is retained in the canonical Page, not copied into this
public repository. Full-page captures place the fixed bottom navigation at the viewport boundary.

| View | Before | After |
|---|---|---|
| Run, Daylight | [Before](before/run-390-light.png) | [After](after/run-390-light.png) |
| Run, Night Run | [Before](before/run-390-dark.png) | [After](after/run-390-dark.png) |
| Strength, Daylight | [Before](before/strength-390-light.png) | [After](after/strength-390-light.png) |
| Strength, Night Run | [Before](before/strength-390-dark.png) | [After](after/strength-390-dark.png) |

The new browser suite records continuous videos, including the complete runner film, into the normal Playwright CI
artifacts. The original 97-second recording exceeded the connected Page reader's file limit and was not independently
replayed in this pass. Its earlier observation remains historical evidence; the newly reproduced unbounded-request gap
must not be represented as the proven cause of that old recording.
