# A calmer Home after training

Before screenshots use PR #268's previous head, `51c20d9`. After screenshots use the real App and hooks with synthetic account, race and recovery data. Production fonts and Night Run/light tokens are unchanged.

| State | Before | After |
| --- | --- | --- |
| Recovery, phone, Night Run | [Previous Home](before-home-recovery-375-dark.png) | [One recovery card](../phase-handoff/home-recovery-375-dark.png) |
| Training concluded, phone, light | [Previous Home](before-home-concluded-375-light.png) | [Saved chapter](../phase-handoff/home-concluded-375-light.png) |
| Race confirmed, recovery not started | — | [Light](race-confirmed-375-light.png), [Night Run](race-confirmed-375-dark.png) |
| Recovery complete, phone | — | [Light](recovered-375-light.png), [Night Run](recovered-375-dark.png) |
| Recovery complete, desktop | — | [Light](recovered-1440-light.png), [Night Run](recovered-1440-dark.png) |
| Recovery ended, phone | — | [Light](recovery-ended-375-light.png), [Night Run](recovery-ended-375-dark.png) |
| Easy-running maintenance, phone | — | [Light](maintenance-375-light.png), [Night Run](maintenance-375-dark.png) |
| Saved history months later | — | [Night Run](saved-history-375-dark.png) |

Default Home has the greeting, one current-stage card and a closed “Your running” row. It no longer stacks weekly totals, the latest run, training-feedback prompts and onboarding/connection offers under recovery. An unconfirmed race leads to review; a confirmed finish or DNF offers recovery using that saved result; active recovery opens its own plan; completed or ended recovery leads to the next chapter. Recovery readiness and safety controls remain on the independent Plan screen; an actual safety warning still appears in the Home preview.

Totals and all-time history load when details are opened. Generic readiness questions stay off post-training Home. Recent activities stay one tap away in Runs; historical plans, race details and achievements stay in Journey. The existing bottom navigation, animation and colours remain. Tools bookmarks and saved Couch to 5K programmes remain accessible. A failed or pending lookup never becomes an empty running history; account ownership guards remain in place.

`HomeAfterTraining.test.tsx` covers concluded training, confirmed finishes/DNFs, active recovery with future training, paused recovery and safety alerts, completed/ended recovery, maintenance, older retained chapters, deferred requests, calculator bookmarks, saved beginner programmes and initial loading. Existing Home tests retain training, logging, source expiry and account isolation assertions with explicit resolved journey fixtures. `training-recovery.spec.ts` drives the transitions, default-screen simplicity, deferred requests, tools/reload, recent activity access and the saved race months later; accessibility checks cover 320, 375, 820 and 1440px in both themes and the additional browser matrix. Responsive audits and navigation checks use separate browser contexts to avoid a native Firefox crash after repeated audit/layout queries; every WCAG tag and navigation assertion remains enabled.

Browser profiles and account/Strava replies are synthetic. Physical native sharing and live Entra/Strava sessions remain outside this evidence. No backend or generator behavior changes in this Home cleanup. Full results are recorded in PR #268 and its CI runs.
