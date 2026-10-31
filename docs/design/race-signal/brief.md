# Race bib: brief

**The one thing a runner keeps:** Taperday feels like race day in your pocket, with the bib on, the clock running and your plan printed on paper you can trust.

**Audience:** runners from first 5K to Comrades, mostly on phones (390px), printing plans at home, reading the Monday email in Gmail.

**Why now:** another running app looks almost the same as Taperday (dark UI, soft cards, one bright accent). Slow Miles owns cream, dark green and gold. We need a look nobody else in running has.

## Assets (real only)
- The real app screens: landing, sign-in, home, plan, calendar, run detail, account, PWA install.
- The peeking mascot (`client/public/email/peek.svg`), the wordmark and the PWA icons.
- Fonts: free, OFL-1.1 and self-hosted through Fontsource (the CSP blocks font CDNs).
- Components: our own React and CSS, rebuilt from ideas. No copied code and no paid kits. Dependencies must be MIT, ISC or OFL.

## Hard lines
- UI only. Behaviour, routes, APIs and tests stay the same.
- Never invent a screen, metric or number. Rings, tickers and charts show real data or nothing.
- Light background. No dark-first UI, no cream or green-and-gold, no glows, neon, glass, aurora or particles.
- Nothing merges or deploys without Thami's explicit OK.

## Gates
1. **References and assets.** Approved in the PR #130 handoff and the designeer.xyz pass.
2. **Style guide.** `style_guide.md`, accent chosen from a contact sheet of real screens rather than swatches.
3. **Stills.** Every key screen at 390 and 1440, critiqued and with the worst 3 fixed.
4. **Full pass.** All screens at 320, 390, 768, 1024, 1440 and 2560, plus motion, emails and PWA.
5. **Polish.** Reduced motion, keyboard, safe areas, print, then the client checks.

## Deliver
The style guide, contact sheets in `docs/design/race-signal/reviews/`, the branch `feature/race-signal` (PR #129) with commit SHAs, and a pass or fail per gate.
