# Home, Builder and shared UI refinements

Continues draft #187 on top of `43c710e`. Product/test commits: `99f4cc0`, `c009602`, `1cfd4fb`, `e6de5f8`, `8224769`, `a157f2c`. Final product/test tree: `a157f2c`. The implementation remains on `feat/workout-intelligence-foundation-187`; main, #179 and #186 are not modified or merged.

## Working changes

- **Home:** Today and its next action appear before setup prompts. Tablet and desktop put the weekly summary and race context beside Today; phones stack them. Recorded/logged recent activity remains directly accessible. Monthly/yearly totals, historical trends, milestones and personal bests share the existing Running insights disclosure. Historical chart components load on first opening and stay mounted when it closes, retaining their controls and avoiding unnecessary initial requests. A direct View training progress action opens the canonical Plan Progress destination. Entry points and manual tab selection record their target in the URL, so refresh and browser navigation retain it. Returning Home and opening the plan or selecting Plan in the dock returns to This week without a stale Progress request. Empty history, unavailable data, source expiry and all existing feedback/logging actions remain available.
- **Builder:** named Race/Goal/Days/You/Review steps identify the current screen and let runners return to visited answers. Unvisited steps remain disabled. Review shortcuts retain drafts and full-form validation still prevents invalid submission. Account setup remains reflected in the step numbers where applicable.
- **Phone layout:** a measured question viewport places Back/Continue/Build in a separate action row; it does not overlay review content. The question scrolls independently, clears the app's bottom dock and retains safe-area padding. Short landscape and short viewport conditions use ordinary page scrolling. Width/height changes retain answers. These are browser viewport simulations, not physical software-keyboard tests.
- **Run analysis:** distance, moving time and pace lead the analysis above the tab bar, so a long stage breakdown cannot bury these facts. They remain visible across Overview/Pacing/Coach/Splits. Narrow phones use two rows of tabs so Overview and Pacing labels cannot overlap; individual button overflow is checked in the browser. Stream-evidence interpretation and source/ownership restrictions are unchanged.
- **Shared styles:** Home grid composition now has one component owner instead of conflicting rules in four global stylesheets. Builder typography/navigation are likewise component-owned. Obsolete inline weekly-accordion selectors were removed; unrelated skin rules and the approved Night Run tokens remain. New Builder transitions use 200 ms and honor reduced motion. Current-step text uses the existing on-accent token in light and dark themes.

No API, plan generator, persistence, migration, activity association or provider contract changes were made in this wave. #179's separate beginner entry points and model remain untouched. Its shared Home/Builder files still need final coexistence review when that branch is ready.

## Executed validation

Full frontend and repository-wide Chromium results below validate `8224769`. A final CSS-only patch at `a157f2c` puts narrow-phone run tabs in two rows. The focused suites are rerun on that final tree, including checks for text overflow inside every tab. Earlier investigation logs are not counted as passes.

- Final TypeScript and warning-denying lint: passed at `a157f2c`. [TypeScript](logs/typecheck-final.log), [lint](logs/lint-final.log).
- Full frontend suite: **677 passed / 91 files**, none skipped. [Output](logs/client-tests.log).
- Repository-wide Chromium suite: **128 passed**, none skipped, against `8224769`. [Output](logs/chromium-all.log).
- Final focused suites at `a157f2c`: **43 Firefox + 43 Chromium passed**, none skipped, including all nine viewport widths and the individual-tab overflow checks. [Firefox](logs/firefox-final.log), [Chromium](logs/chromium-focused-final.log).
- Production client build and dependency audit: passed; **zero audit vulnerabilities**. The existing large-chunk advisory remains. [Final build](logs/client-build-final.log), [audit](logs/audit.log).

The backend source is unchanged from the previous validated wave: 1,579 backend tests, including 342 disposable-SQL integration tests, passed there. They were not rerun for this frontend-only change; see [that evidence](../redesign/verification.md).

The literal pre-merge `scripts/check.sh` remains required before a future merge. No merge or deployment was performed.

## Browser coverage

| Concern | Actual automated coverage |
| --- | --- |
| Responsive composition | 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px; phone stacking and tablet/desktop side-by-side placement; no horizontal overflow |
| Home hierarchy | Workout action in the first viewport, setup below Today, historical totals closed initially, historical requests deferred until opening, retained insight controls and missing-data feedback |
| Home states | No plan, race day, empty imported recordings, failed plan refresh and long display name |
| Navigation | Actual App Home → day → Home → Progress → Home → week; real-browser Home → Progress → refresh → Home → week, plus dock Plan reset; existing week/calendar/day/run Back/Forward, focus and refresh journeys |
| Builder review | Existing answers and changed goal survive step shortcuts; invalid goal cannot submit; corrected goal submits the same race/days metadata |
| Builder adaptation | Action row is outside the question's visible bounds, final review text can scroll into view, fresh steps cannot skip ahead, drafts survive simulated short/long viewport changes |
| Accessibility | Keyboard tab/focus journeys, light/dark selected-step contrast at least 4.5:1, reduced motion, landscape and 200% CSS zoom (an approximation, not physical text scaling) |
| Run hierarchy | Primary facts stay in the initial viewport with detailed stage evidence at phone/tablet/desktop sizes |
| Existing functionality | Full frontend and Chromium suites retain logging, source expiry, duplicate prevention, failures/retry, plan editing, strength persistence, settings, image export and stateless plan generation checks |

Visual review also caught overlapping run-tab text at 320px, despite no page-level horizontal overflow. The two-row phone layout and individual-button overflow assertions address it.

The first broad run found a stale tab request after Home → Progress → Home: a later Open your plan could reopen Progress, and the old request was not encoded for refresh. Tabs and entry points now use canonical URL state, with explicit Plan reset behavior. The failing desktop/phone journey was retained and passed after the fix; final full-suite results are listed above.

## Browser availability

Chromium and Firefox were actually executed locally. Firefox has its own reproducible configuration: `npx playwright test --config playwright.firefox.config.ts` after `npx playwright install firefox` and the normal host dependencies. The Chromium suite supports `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for an installed Chrome.

WebKit downloaded but could not launch because this host lacks GTK4 and supporting libraries. Root package installation was unavailable, and the configured Debian snapshot package source was denied by the environment network policy. No WebKit or Safari pass is claimed. Physical iOS/Android/PWA, native sharing, assistive technology and a complete manual contrast/grayscale audit remain unverified.

## Actual before / after screenshots

Before images use the previous implementation at `43c710e`; after images use this wave. Both use the full shipped styles, the same synthetic plan/profile/activity, frozen date, Night Run dark theme and viewport. Published after images are from the final Chromium run. Earlier main-versus-implementation comparisons remain in the [redesign gallery](../redesign/verification.md).

| Width | Home | Builder |
| --- | --- | --- |
| 320 | [Before](home-before-320.png) · [After](home-after-320.png) | [Before](builder-before-320.png) · [After](builder-after-320.png) |
| 375 | [Before](home-before-375.png) · [After](home-after-375.png) | [Before](builder-before-375.png) · [After](builder-after-375.png) |
| 768 | [Before](home-before-768.png) · [After](home-after-768.png) | [Before](builder-before-768.png) · [After](builder-after-768.png) |
| 1440 | [Before](home-before-1440.png) · [After](home-after-1440.png) | [Before](builder-before-1440.png) · [After](builder-after-1440.png) |
| 1920 | [Before](home-before-1920.png) · [After](home-after-1920.png) | [Before](builder-before-1920.png) · [After](builder-after-1920.png) |

Additional after captures cover 390, 430, 1024 and 1280 px. Phone Builder captures also show the review scrolled to the bottom with actions still in view: [320](builder-bottom-320.png), [375](builder-bottom-375.png), [390](builder-bottom-390.png), [430](builder-bottom-430.png). All screenshots are actual local browser renders with synthetic data, not #186 campaign assets.

## Remaining review gates

- [ ] Validate #179 coexistence once its final contracts are ready, preserving both implementations.
- [ ] Physical device, Safari/WebKit, screen-reader, native sharing and full visual/accessibility review.
- [ ] Product review against the approved wireframes and final responsive screenshots.
- [ ] Fresh `scripts/check.sh` before any eventual merge; main deploys automatically and must stay untouched here.

Exact watch-lap/segment recognition is a future precision improvement. Current workout-stage windows remain explicitly estimated from recording start, with honest unavailable evidence and no interval-success inference from kilometre splits.
