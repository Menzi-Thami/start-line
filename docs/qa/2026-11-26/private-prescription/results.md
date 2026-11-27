# Private prescription verification ledger

PR #332, branch `feat/private-prescription-pilot`, base `staging`. Synthetic data only. Local Linux, .NET 10.0.302, Node 24; disposable loopback SQL Server 2022. No real Entra, Strava, runner data, staging deployment, physical-device claim or real plan activation.

## Evidence recorded so far

- Focused domain: 7 passed, including generator strength cap, rest/Saturday race/Sunday long run, explicit step totals, repeat recovery and nonfinite/invalid rejection.
- Real SQL API: full integration suite 450 passed, including the initial 11 private prescription cases covering activation concurrency, ownership, archive/restore, deletion, high-fatigue easing/undo and real Kestrel request limits.
- Authenticated persisted browser: 4 passed at 390 and 1440 widths, light and dark. Test-only Kestrel host + actual API + SQL, synthetic header authentication, no API route mocks. Import → review/consent → activate → private Plan/Strength → independent gym completion → API persistence assertion → reload → no private schedule in browser storage → sign-out. This does not establish Microsoft sign-in or physical-phone behavior.
- Focused private SQL API suite: 13 passed; two further security scenarios passed (another enabled owner and an injected insert failure with transactional rollback/retry), including exact fractional step/pace preservation, receipt retries after replacement, stored expired-preview export, safe move/easing refusal and undo.
- Full client suite: 151 files / 1148 tests passed. Lint, TypeScript, production build and audit passed (zero vulnerabilities). Final auth/private UI regressions: 48 passed, including a pending gym response after unmount/account change.
- Copy check: 4309 pieces in 293 files, zero style/spelling findings. Initial copy failures used “unlogged”; replaced with plain wording.
- Focused client: 5 passed (entitlement UI, explicit consent/error recovery, independent gym endpoint, storage exclusion, private sharing controls).
- Full backend run through `scripts/check.sh`: Domain 1288, Application 239, Architecture 11 and SQL Integration 450 passed, zero skips. Strict Release build: zero warnings/errors. Migration/model consistency passed. An earlier dispatcher composition failure was corrected by registering the new infrastructure abstraction in the test composition root.
- Screenshots: `gym-390-light.png`, `gym-390-dark.png`, `gym-1440-light.png`, `gym-1440-dark.png`. Real locally persisted synthetic plan, Chromium viewport emulation. No provider credentials or private runner data.

## Required final gates

This ledger records local results at commit creation. The exact pushed SHA, completed GitHub CI run links and subsequent results are recorded in the PR Conversation. Live checks: https://github.com/Menzi-Thami/start-line/pull/332/checks. Do not interpret pending gates as passed.

| Gate | Status |
|---|---|
| `scripts/check.sh` (format, strict build, .NET tests, model consistency, client lint/typecheck/unit/build/audit, existing Playwright and persisted private browser suite) | Running |
| Gitleaks 8.30.1 directory and staged-diff scans | PASS — zero findings, redacted reports |
| Exact pushed head GitHub Checks and Secret scan | Pending push |
| Deployed staging with synthetic enabled test account | NOT RUN — #332 staging merge/deploy requires approval |
| Actual Microsoft authentication, physical iPhone/Android/PWA and offline account changes | NOT VERIFIED by these local browser tests |
| Private owner activation | NOT RUN — separate approval and private payload required |

## Deliberate supported boundaries

Private generic replan/weekly regeneration/exact pace-distance editing do not silently replace prescribed steps; they report why unsupported and point to reviewed easing/replacement. Schedule-bearing push and public calendar subscriptions are suppressed; authenticated exports remain available. Weekly email omits the private schedule. No adaptive feature flag or AI/provider path was enabled. These boundaries must be retained during staging acceptance.

The first GitHub run exposed copy spelling and formatting of the new test host after it was added to the solution; both were corrected. The first local client run collected the separate Playwright spec as a Vitest file: explicit test-directory separation corrected discovery, and the persisted suite remains mandatory in backend CI and `scripts/check.sh`. No acceptance case was disabled. Private fractional DTO mapping and auth cache clearing were rechecked with focused regressions after the full-suite run.

Late private gym responses are discarded after account view cleanup, and App checks both owner and plan ID before accepting the result. The real SQL failure-injection test verifies that a failed insert rolls back the archive and the same reviewed import can be retried. Another entitled runner also receives 404 for an owner’s activation token.

Local verification uses the existing CI unsharded budget of 45 minutes for the 488-case browser suite; the script previously inherited the 20-minute shard budget. The earlier attempt was deliberately stopped and the complete script restarted against the finished source. Individual test timeouts and all acceptance cases remain unchanged.
