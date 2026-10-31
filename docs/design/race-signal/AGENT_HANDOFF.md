# Taperday Race Signal — Agent handoff

## User's objective
Continue a UI-only, screen-by-screen redesign of Taperday, preserving every existing behavior. The owner saw another TikTok fitness app with an almost identical near-black + lime dashboard look and wants a more distinctive, premium running-product identity. The owner explicitly approved **Race Signal**, not a new choice of theme. This applies to desktop, tablet, mobile and installed PWA.

## Where to start
- Repository: https://github.com/Menzi-Thami/start-line
- Current implementation experiment: `feature/race-signal`
- Default / production comparison: `main`
- Conversation archive: `docs/design/race-signal/CONVERSATION_ARCHIVE.md` (in documentation PR)
- Existing repo implementation notes: `docs/design/race-signal/README.md` (in feature branch)
- Never merge or deploy unless the user explicitly authorizes it.
- Check the actual branch and recent GitHub Actions state; past assistant messages include **unverified status assertions**.

## Design direction
Race Signal:
- Background/midnight: `#101820`
- Accent/coral: `#FF694A`
- Primary text/bone: `#F2EFE7`
- Raised surface: `#1B2830`
- Secondary/technical blue: `#8DB4C4` (used in existing implementation)
- Coral hover/light accent: `#FF9B84` (existing implementation)
Do not just replace lime with coral: redesign component hierarchy, reduce generic repeated cards, use athletic editorial typography, race-timing instrumentation, track lines, splits, race countdowns, personalized running progress. Preserve tapering wordmark / taper bars design as foundational identity.

## Inspiration sources (references, not mandatory dependencies)
- React Bits https://reactbits.dev/
- Mobbin https://mobbin.com/
- 21st.dev https://21st.dev/
- Magic UI https://magicui.design/
- Aceternity UI https://ui.aceternity.com/
- Uiverse https://uiverse.io/
Use selectively and consider accessibility, performance, licensing and component conflicts. There is no reason to bulk-install these libraries.

## Technical architecture and requirements
Client: React 19, TypeScript, Vite, CSS token files, pre-existing animation system, Bricolage Grotesque headings, Atkinson Hyperlegible Next body, JetBrains Mono numeric display. Backend: .NET API / SQL. Existing UI includes plan builder, training calendar, dashboard/home, run history, tools/calculators, Strava sync, account, race intro, completion celebrations and PWA.

Scope is **UI only**: preserve generation logic, APIs, persistence, auth/Strava, routes, import/replanning workflows, existing tests and responsive interaction controls. Avoid backend edits and new dependencies.

## Verified work from the first GitHub editing turn
Tool confirmed creating `feature/race-signal` and updating `client/src/styles/tokens.css`, `main.tsx`, `app.css`, `polish.css`, `index.html`, several SVG assets and PWA manifest. New `client/src/styles/race-signal.css` and `docs/design/race-signal/README.md` were added. One compare call showed 12 commits, 12 changed files relative to main. That first turn did **not** execute lint/typecheck/build/tests or real browser visual checks.

## Later claimed work REQUIRES verification
An assistant later claimed raster PNGs were committed, that CI lint and typecheck passed, E2E was running, and draft PR #129 existed. In the visible tool record for that turn, the only confirmed corresponding operation was **local generation** of three home PNG files. Do not assume they were uploaded or tested until checking actual repo commits and Actions.

## Must-finish work
1. Inspect branch and identify every remaining hard-coded Night Run/volt colour, including JSX/HTML/CSS/SVG, the starting-line intro, runner, plan theatre, confetti, loading, workouts and motion states. Ensure semantic danger/warning/success colours retain meaning.
2. Generate and commit actual raster PNGs for Apple touch icon, 192/512 PWA, app-icon and relevant preview/social artwork. Verify transparent/opaque backgrounds, crop/safe zones, manifest and cache refresh.
3. Finish responsive screen-by-screen style/layout work on real components (320, 390, 768, 1024, 1440, 2560px) and accessible light-on-dark contrast.
4. Run `cd client && npm ci && npm run typecheck && npm run lint && npm run build && npx vitest run --testTimeout=30000 --maxWorkers=1`.
5. Execute Playwright through the existing setup, inspect actual rendered pages in browser and screenshots, verify reduced motion, keyboard support and mobile safe-area insets. Visual QA is not equal to a CSS code review.
6. Report explicit pass/fail, commit SHAs, screenshots/links and any blockers. Do not invent completed verification. Do not merge or deploy.

## User's explicit handover message from earlier conversation
> I'm continuing development on my Taperday running application.
>
> I've attached our previous conversation and a technical agent handoff.
>
> Please read both documents, inspect the existing GitHub repository and `feature/race-signal` branch, and continue from the current implementation.
>
> Verify what has actually been committed before making changes. Complete the remaining UI redesign, animations, PWA branding, automated tests and browser visual verification.
>
> Preserve all existing functionality. Do not merge into main or deploy anything without my approval.

## Additional product context
Taperday is `taperday.run`, an installable running-plan PWA intended for 5K through long-distance races, with plan sharing, accounts/Strava, activity import and adaptive training. Its aesthetics must be distinctive but must not distract from running data. The user wants it to look excellent on large laptop screens, not only phones.

## Archive notes
The companion conversation archive is a detailed reconstruction of visible messages; this interface does not expose a platform-native byte-for-byte export, and embedded media is represented by descriptions. Treat historical assistant status as statements to verify, not proof.
