# Training concludes; recovery is its own plan

Synthetic runners and recordings only. Before screenshots were captured from staging commit `0c0312f` in a temporary checkout, using the real App and controlled API replies. After screenshots come from `client/e2e/training-recovery.spec.ts`, using the real App, hooks and production fonts. They show the same Hoka Half example after race day. Mobile and browser profiles are emulations.

## Before and after

| Screen | Light | Night Run |
| --- | --- | --- |
| Before: Home includes recovery controls and the old training schedule | [375px](before-home-recovery-375-light.png) | [375px](before-home-recovery-375-dark.png) |
| After: Home gives a brief recovery preview | [375px](home-recovery-375-light.png) | [375px](home-recovery-375-dark.png) |
| After: recovery opens as its own Plan screen | [375px](recovery-375-light.png) | [375px](recovery-375-dark.png) |
| Recovery on tablet | [820px](recovery-820-light.png) | [820px](recovery-820-dark.png) |
| Recovery on desktop | [1440px](recovery-1440-light.png) | [1440px](recovery-1440-dark.png) |
| Training ended, result still unconfirmed | [375px](home-concluded-375-light.png) | [375px](home-concluded-375-dark.png) |
| Historical training link, schedule folded | — | [375px](training-concluded-375-dark.png), [1440px](training-concluded-1440-dark.png) |

Training retains its own chapter, race result, achievements and schedule. Its conclusion does not award a finish. Recovery retains its separate identity, dates, readiness and safety guidance. A future training plan can coexist and be opened explicitly from recovery.

## Regression sequences

- Runner-local midnight → training disappears from current-plan lookup, including a stale Active response → concluded Home card → reload → original race recording available for explicit confirmation. No automatic result, award or recovery.
- Recording with 20.3 km and 2:06:15 elapsed → one confirmation → saved race/celebration → separate recovery using those known values → Home preview → Plan destination → reload with the same recovery ID → check-in → completed recovery → next-chapter choices. The training chapter stays concluded throughout.
- Active recovery alongside future training → open future training → Home → Plan returns to recovery → its own days → old training URL opens a read-only chapter, without recovery days or save/replace controls.
- Late offline check-ins retain the original training dates. Post-race dates cannot extend that chapter. Old plan links cannot duplicate it or replace newer training. Concurrent reads conclude once and preserve identity.
- Signed-out recovery URL exposes sign-in instead of a blank page. Selecting another confirmed race does not open a completed recovery from an earlier event.
- Recovery completed → easy-running maintenance → Home → Plan → stop maintenance → next-chapter choices. Maintenance stays reachable even when the last training plan has concluded or the earlier recovery is no longer returned.

Accessibility checks cover both themes at phone, tablet and desktop sizes, keyboard/navigation behavior and horizontal overflow. The existing finish-line and cabinet suites retain PNG, SVG fallback and native-file-sharing assertions, including actual recorded metrics and elapsed versus official chip time.

## Boundaries

Backend persistence, ownership and migrations use disposable local SQL and CI SQL. Browser account and Strava responses are synthetic; these checks do not establish live Entra sign-in, a live runner's Strava sync or physical-device native sharing. Recovery keeps its own on-screen days; no recovery calendar subscription was added. Older records with an unknown original race date remain available without inventing a conclusion date.

No deployment or merge is performed by this change. No database migration is required: the existing string status column accepts `Concluded`, and model/migration checks verify that claim. Generator versions and output rules remain unchanged.
