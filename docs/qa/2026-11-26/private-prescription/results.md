# Private prescription verification ledger

PR #332, branch `feat/private-prescription-pilot`, base `staging`. Synthetic data only. Local Linux, .NET 10.0.302, Node 24; disposable loopback SQL Server 2022. No real Entra, Strava, runner data, staging deployment, physical-device claim or real plan activation.

## Evidence recorded so far

- Focused domain: 7 passed, including generator strength cap, rest/Saturday race/Sunday long run, explicit step totals, repeat recovery and nonfinite/invalid rejection.
- Real SQL API: full integration suite 450 passed, including 11 private prescription cases covering activation concurrency, ownership, archive/restore, deletion, high-fatigue easing/undo and real Kestrel request limits.
- Authenticated persisted browser: 4 passed at 390 and 1440 widths, light and dark. Test-only Kestrel host + actual API + SQL, synthetic header authentication, no API route mocks. Import → review/consent → activate → private Plan/Strength → independent gym completion → API persistence assertion → reload → no private schedule in browser storage → sign-out. This does not establish Microsoft sign-in or physical-phone behavior.
- Focused client: 5 passed (entitlement UI, explicit consent/error recovery, independent gym endpoint, storage exclusion, private sharing controls).
- Full backend run through `scripts/check.sh`: Domain 1288, Application 239, Architecture 11 and SQL Integration 450 passed, zero skips. Strict Release build: zero warnings/errors. Migration/model consistency passed. An earlier dispatcher composition failure was corrected by registering the new infrastructure abstraction in the test composition root.
- Screenshots: `gym-390-light.png`, `gym-390-dark.png`, `gym-1440-light.png`, `gym-1440-dark.png`. Real locally persisted synthetic plan, Chromium viewport emulation. No provider credentials or private runner data.

## Required final gates

Final commands/results, exact commit SHA and CI links will be recorded here after checks finish. Do not interpret this initial ledger as a complete acceptance claim.

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
