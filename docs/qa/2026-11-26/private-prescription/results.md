# Private prescription verification ledger

PR #332, branch `feat/private-prescription-pilot`, base `staging`. Synthetic data only. Local Linux, .NET 10.0.302, Node 24 and disposable loopback SQL Server 2022. No real Entra, Strava, runner data, staging deployment, physical-device claim or real plan activation.

## Local evidence

- Full backend checkpoint: Domain 1288, Application 239, Architecture 11 and SQL Integration 453 passed (1991 total), zero skips. Strict Release build: zero warnings/errors. Migration/model consistency passed. Public generator snapshots remain unchanged.
- Private SQL coverage: 14 tests, including owner/default-denied access, another entitled owner, strict invalid import rejection, consent/token/expiry/stale version, concurrent activation, idempotency after replacement, archive/restore/deletion, exact fractional steps and pace, independent gym completion/movement, high-RPE easing/undo and refusal of unsafe composition. An injected storage failure proves archive rollback and retry of the same reviewed import. Real Kestrel separately verifies the request limit.
- Full client checkpoint: 151 files / 1149 tests passed, plus lint, TypeScript, production build and dependency audit (zero vulnerabilities). The final journey-sharing and private UI checks passed 25 tests; current/archived private chapter flags also passed two SQL API regressions. Auth/private UI regressions previously passed 48 tests, including a late gym response after unmount/account change.
- Persisted browser: real Kestrel/API/SQL, synthetic header authentication, no API route mocks. Four phone/desktop and light/dark journeys cover import → review/consent → activate → private Plan/Strength → independent gym completion → persisted API assertion → reload → browser-storage exclusion → sign-out. A fifth scenario independently activates its own plan, switches between accounts with the same name but different verified IDs, verifies the old prescription disappears and receives 404 from the other account. Each scenario owns a separate synthetic account and retains production rate limits.
- Copy check: 4309 pieces in 293 files, zero style/spelling findings.
- Screenshots: `gym-390-light.png`, `gym-390-dark.png`, `gym-1440-light.png`, `gym-1440-dark.png`. Locally persisted synthetic plan, Chromium viewport emulation. No provider credentials or private runner data.

## Commands and final gates

The local full-script run began at the verified-account-identity checkpoint; subsequent navigation, private story sharing and isolated-browser-account changes receive focused checks and the complete exact-head CI run. Final pushed SHA, completed CI links and full-script outcome are recorded in the PR Conversation: https://github.com/Menzi-Thami/start-line/pull/332. Do not interpret pending gates as passed.

| Gate / command | Status at this commit |
|---|---|
| `scripts/check.sh` (format, strict build, .NET tests, migration consistency, client lint/typecheck/unit/build/audit, 488 existing Playwright cases and persisted private browser suite) | Running; backend/client stages passed |
| `npx playwright test --config playwright.private.config.ts --reporter=line` with disposable local SQL | PASS — all 5 scenarios, 1.5 minutes |
| `npx vitest run src/features/journey/TrainingStory.test.tsx src/features/journey/JourneyPanel.test.tsx src/features/journey/RunningJourney.test.tsx src/features/private-plans/PrivatePlans.test.tsx` | PASS — 25 tests |
| Targeted current/archived private chapter SQL API regressions | PASS — 2 tests |
| `npm --prefix tools/copy-check run check` | PASS |
| Gitleaks 8.30.1 directory, staged-diff and branch scans | Zero findings at the preceding checkpoint; repeated for final source |
| Exact pushed head GitHub Checks, Copy check and Secret scan | Pending final push |
| Deployed staging with synthetic enabled test account | NOT RUN — handover requires staging merge/deploy approval |
| Actual Microsoft authentication, physical iPhone/Android/PWA and offline account changes | NOT VERIFIED by local browser tests |
| Real-owner activation | NOT RUN — separate approval and private payload required |

## Boundaries and resolved findings

Generic replan, weekly regeneration and exact pace/distance editing explain unsupported private changes instead of replacing the prescription. Existing reviewed safe easing and moves remain available, with protected past/logged/race sessions and exact undo. Schedule-bearing push, public calendar subscriptions and private training-story share cards are suppressed; weekly email omits the schedule. Authenticated owner exports and actual recorded-run stickers remain available. No unfinished adaptive flag or AI/provider path was enabled.

Private rendering uses the verified account ID independently of the legacy convenience-cache fingerprint. Account changes clear the private route/view; late gym responses require both the same owner and plan ID. The owner can read current/archived training stories, but cards containing prescribed counts/distance cannot be shared.

Initial check failures were corrected: dispatcher test registration, test-host formatting, plain copy wording, separate Vitest/Playwright discovery and per-scenario browser identities. CI traces showed 429 responses when rapid browser scenarios reused one account; separate accounts remove that coupling without weakening production limits. No acceptance case was disabled.

The local script uses the existing CI unsharded budget of 45 minutes for the 488-case browser suite; it previously inherited the 20-minute shard budget. An earlier attempt was deliberately stopped before restarting the complete script. Individual test timeouts remain unchanged.
