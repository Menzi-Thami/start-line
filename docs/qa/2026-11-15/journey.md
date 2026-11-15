# Permanent Journey, race history and trophy cabinet — 15 November 2026

Follow-up to merged PRs #263–265, delivered from `fix/strava-race-detection-finish-story` to `staging`. The implementation was brought up to date with staging commit `7389236` before final verification. No training-generator version or workout prescription changes are part of this work.

## Result

- Journey is a permanent main-navigation destination, available after the last current plan is archived. Plan retains its own Progress view.
- Training chapters can be explicitly archived without losing logs, race results, achievements or ongoing recovery. The former 50-plan lifetime limit is replaced by 20-chapter paging.
- Existing plan results and independently entered past races share the same persisted result model. Names and advertised distances survive the race catalogue; actual distance covered and timing source remain separate.
- Confirmed, unambiguous finishes populate a personal trophy cabinet. The current eight Marathon Majors have illustrated city medals, original-six progress and repeat-edition detail. Local races, halves and ultras retain their own achievements and share cards.
- Correcting a result to DNF/DNS or removing it withdraws its cabinet trophy. Legacy duplicate results remain visible for explicit review and earn no cabinet trophy or personal best while ambiguous.
- Portrait PNG/SVG exports preserve Night Run colours, type and runner identity; prepared native-file sharing retains the original user gesture. Account export and deletion include independent races.

Product rules and maintained official reference links: [Journey and trophy cabinet](../../journey-and-trophy-cabinet.md).

## Verification

All automated accounts, activities and race memories are synthetic. Backend persistence checks use the disposable local `taperday-journey-test-sql` container and a test-named SQL database. No production or real-runner data is used.

| Check | Actual result |
| --- | --- |
| Backend formatting and strict Release build | Passed; zero warnings/errors |
| Application / Domain / Architecture / SQL integration tests | 169 / 1,230 / 7 / 383 passed; 1,789 total, zero skipped |
| EF model/migration consistency | Passed; no pending changes |
| Synthetic staging-readiness script tests | 4 passed |
| Frontend lint, TypeScript, production build and dependency audit | Passed; zero vulnerabilities |
| Full frontend suite | 889 passed across 124 files |
| Focused journey frontend tests | 82 passed across 10 files |
| Focused race SQL sequences, including original concurrent-create regression | 9 passed |
| New desktop browser journeys | 4 passed before the final whole-app run |
| New Android Chromium / Firefox journeys | 4 / 4 passed |
| New iPhone WebKit / iPad WebKit journeys | 4 / 4 passed |
| Full `scripts/check.sh` / Chromium regression suite | Passed end to end; all 210 browser cases passed in 12.3 minutes |
| Full GitHub CI | See the accompanying PR's checks for the committed revision |

WebKit uses the existing workspace's extracted runtime libraries. Its `ldconfig` preflight did not see that library directory, so local runs bypassed that host preflight while loading the real browser with `LD_LIBRARY_PATH`; all browser actions, accessibility checks, rendering and image exports still ran. CI installs browser dependencies normally. These are emulated device/browser profiles, not physical devices.

## Sequence coverage

| Journey | Evidence |
| --- | --- |
| Archive current plan → no active plan → reopen Journey → recovery retained | Actual App browser test, versioned SQL archive test |
| Save a race without a plan → reload → account export → account deletion | SQL integration; App browser save/reload |
| Failed race save → retained inputs → retry with same client id → one result | Frontend and browser sequences; SQL idempotency and concurrent uniqueness |
| Concurrent first confirmation for the same plan | Original integration assertions retained; all requests succeed with one result and one badge |
| Same event attached to another chapter or submitted with another id | SQL conflict checks; no extra result or trophy |
| Stale result update/delete → current result retained | SQL row-version checks and UI failed-removal retention |
| Finished → DNF → original chapter corrected → trophy withdrawn | Shared-result SQL test; frontend and browser correction sequence |
| Legacy conflicting duplicate results → no trophy → remove incorrect result → one eligible finish | SQL and frontend review-state tests; chapters retained |
| Fifty-five historical plans → load all pages → save next plan | SQL paging/retention test; frontend failed-page/retry/refresh test |
| Confirm recording → elapsed time → edit suggested time → explicit chip-time selection | Existing recording form plus new timing-source regression |
| Expired activity link → correct own result without relinking | SQL legacy-result test |
| Late read after save/delete; account switch during token acquisition | Frontend request-boundary tests |
| Local half-marathon finish with no Majors | Finish-focused export unit test; no empty-Majors achievement card |
| PNG download, SVG fallback, prepared native file sharing | Actual browser export tests; PNG signature/dimensions, SVG content and text bounds |

The full-suite investigation caught a genuine concurrent-create bug in the first duplicate guard: another request for the same plan must be treated as the same logical result. The guard now leaves same-plan retries to the existing per-plan idempotency path and still rejects another chapter for that event. The original concurrency test's later creation scenario now uses an independent synthetic runner, because its former setup deliberately reused the already recorded event. Its success, single-result, single-badge and goal-comparison assertions are unchanged.

Visual accessibility checks also caught a label/name mismatch in the first medal-button implementation. Buttons now expose their complete visible city, status and action through their native accessible names. Assertions and Axe checks remain enabled.

## Visual evidence

Before: the existing [plan-bound running-journey list](../2026-11-14/finish-line/11-running-journey-desktop-dark.png), captured for the original finish-line implementation.

After, captured from the actual App with synthetic API responses:

| View | Light | Dark |
| --- | --- | --- |
| Phone, 375 CSS px | [Cabinet](journey/cabinet-375-light.png) | [Cabinet](journey/cabinet-375-dark.png) |
| Tablet, 820 CSS px | [Cabinet](journey/cabinet-820-light.png) | [Cabinet](journey/cabinet-820-dark.png) |
| Desktop layout, 1440 CSS px | [Cabinet](journey/cabinet-1440-light.png) | [Cabinet](journey/cabinet-1440-dark.png) |

[Race history](journey/race-history-desktop.png) · [Archived plan and ongoing recovery](journey/archived-with-recovery.png) · [1080 × 1920 PNG](journey/cabinet-card.png) · [SVG fallback](journey/cabinet-card.svg) · [Standalone SVG rendered with fallback fonts](journey/cabinet-svg-fallback.png)

Phone/tablet captures use WebKit device profiles; the desktop layout is captured in Chromium. Screenshot pixel dimensions reflect device scale factors. Full-page mobile captures show the fixed navigation at its viewport position. Checks cover horizontal overflow, touch-target heights and Axe WCAG 2.2 AA rules. Desktop Chromium, phone light, phone dark, race history and the exported PNG were visually inspected.

## Remaining limits and release assessment

- Live Entra/Strava authorization, actual email delivery and physical-device install/reopen/native WhatsApp/Instagram sharing remain unrun. Dedicated test accounts, a test inbox and device access have not been supplied. Synthetic/native-share mocks establish application behavior, not receiving-app acceptance.
- The cabinet is a personal collection, not official star verification. Sydney 2024 Age Group World Championship exceptions require verification outside this implementation. Current membership/eligibility was checked against official sources on 15 November 2026.
- Custom-event identity uses name, date and advertised distance. Unknown original legacy metadata is never reconstructed from expired provider data; ambiguous recoverable duplicates require runner review.
- Independent race history is account-backed; this does not add offline race-result writes. Existing durable offline manual-run logging remains covered by the full suite.
- The migration makes the plan association optional, adds race metadata and direct runner ownership, and preserves recoverable legacy details. Downgrade refuses to discard independent results: use a reviewed forward fix or export/migrate that history first.

Implementation and automated verification are prepared for owner review. Live-provider/device validation remains a staging release gate; production promotion requires the owner's explicit release approval. This work does not merge staging or deploy production automatically.
