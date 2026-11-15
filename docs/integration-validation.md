# Provider and device validation

Automated SQL, fake-provider and browser tests cover contracts and recovery behavior. A live provider or native share-sheet result requires separate evidence. Record the tested commit, environment, test-account identifier (never a token), device/OS/browser, browser or installed mode, expected behavior, actual behavior, and pass/fail/unrun.

## Repeatable automated coverage

Every PR runs the normal Chromium suite plus `playwright.connections.config.ts` in Android-sized Chromium, iPhone-sized WebKit, iPad-sized WebKit and desktop Firefox. These jobs cover manual offline drafts, interrupted account requests and reload, race discovery/confirmation/history/recovery, portrait PNG/SVG generation, share cancellation, responsive forms and existing Strava-completion behavior. They retain failure traces and screenshots as CI artifacts.

```sh
cd client
npx playwright install --with-deps chromium webkit firefox
npm run e2e:connections
```

These are real browser-engine tests with synthetic account/provider responses. Device profiles do not exercise actual iOS keyboards, installed Safari, provider authorization, push transport or native application destinations.

## Check isolated staging configuration

Staging currently has no dedicated Strava/email configuration documented. Do not copy production runner credentials or run database-reset tests against staging. Configure a separate Strava application/test athlete and test-only Entra accounts, an owned test email inbox and opt-in test devices through the existing secure service settings. Provider callbacks and email unsubscribe links must point to staging. Keep scheduled email campaigns disabled while checking the explicit preview recipients; `TestTo` is a preview setting, not an allowlist for normal campaigns.

The manual **Ops - Staging integration readiness** workflow reads configuration only. It uses the existing staging Azure identity and `INTEGRATION_TEST_EMAIL` GitHub environment variable. The environment's branch restrictions still apply; this workflow never deploys, merges, syncs a runner, sends email/push or changes settings. It reports missing names and configuration/isolation checks without printing values. A configuration pass is not a provider-delivery pass.

With read access through Azure CLI, the same check is:

```sh
node --test scripts/staging-integration-readiness.test.mjs
# Set INTEGRATION_TEST_EMAIL to the dedicated inbox through local secure configuration.
node scripts/staging-integration-readiness.mjs
```

## Live verification matrix

| Journey | Required evidence |
|---|---|
| Entra | Test account sign-up, email code, returning sign-in, expired-token recovery, sign-out and different-account isolation. |
| Strava | Dedicated test athlete authorizes staging, existing recordings arrive, a second sync creates no duplicate, webhook import is processed, denied/expired consent is recoverable, disconnect removes cached source details. No real-runner account or production sync. |
| Race result | Find an already imported race by local date/distance, choose ambiguous candidates, compare recorded elapsed time with moving time, confirm explicitly, reload the current/past chapter, edit/undo and start recovery. Expired source data must leave an honest manual route. |
| Email | Preview delivery to the owned test inbox, readable light/dark rendering, staging unsubscribe links, and actual inbox receipt. Do not infer delivery from a successful HTTP response. |
| Push | Test device opts in, a test reminder arrives once, opens the intended screen, and opt-out stops it. Repeat on installed iPhone Safari and Android Chrome. |
| Offline | Load the plan and entries, use airplane mode, save/edit a manual entry, close/reopen the installed app, reconnect, confirm exactly one account entry and correct totals. Repeat with a conflict and unsynced sign-out cancellation. |
| Sharing | On physical iPhone and Android, generate the 1080 × 1920 PNG, open the native share sheet, share to an owned WhatsApp chat and Instagram Story draft, inspect image framing/text, cancel without unwanted clipboard fallback, and verify SVG download fallback. Do not publish the draft. |

See [device checks](device-validation.md) for keyboard, orientation, large text, safe areas and reduced motion. Current evidence and outstanding access are recorded in [the follow-up QA report](qa/2026-11-14/app-gaps.md).
