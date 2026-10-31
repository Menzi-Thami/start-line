# Race Signal UI branch

Branch: `feature/race-signal`. This is an **unmerged, undeployed UI-only experiment**.

## Brand palette
- Midnight `#101820` / darker inset `#0c141b`
- Signal coral `#ff694a` / raised coral `#ff9b84`
- Bone white `#f2efe7`
- Raised surface `#1b2830`
- Instrument blue `#8db4c4`

## Scope of changes
- Shared design tokens and explicit Race Signal stylesheet, imported after existing styles.
- Responsive desktop width, runner dashboard typography, card composition, accent strips, track-grid motifs, pace and distance instrumentation, chart and progress treatments.
- Keyboard focus and existing motion interactions retained; reduced-motion override added.
- Browser theme, PWA manifest, loading screen, and **SVG** branding recoloured.
- Hardcoded lime highlights in base CSS updated to signal coral.
- No backend, route, API, persistence, data model, test or package dependency change.

## Quality gates (must pass before considering merge)
Run from `client/` with Node 22+:
```bash
npm ci
npm run typecheck
npm run lint
npm run build
npx vitest run --testTimeout=30000 --maxWorkers=1
```
Use the existing Playwright suite, then visually inspect 320, 390, 768, 1024, 1440 and 2560px layouts on the actual app. Check PWA safe areas, race countdown, plan builder, calendar, tools, connected runner home, Strava flow and reduced motion.

**Execution limitations:** Changes were committed using the GitHub connector without a local checkout or execution environment. None of the above checks was executed here, and the visual result is not browser-verified. Do not merge based only on the stylesheet changes.

## Remaining design work
- Regenerate raster PWA icons (`apple-touch-icon.png`, `home-icon-192.png`, `home-icon-512.png`, app icon PNGs) from the revised SVG sources, and any OG/social assets that still show Night Run.
- Review any feature-specific hardcoded Night Run colours and adjust chart contrast, semantic status colours and appearance on all screens.
- Conduct a complete screen-by-screen visual QA pass and make follow-up improvements.
- Third-party visual libraries were consulted as references only. No extra dependency added without an identified benefit.

Keep this branch separate from `main`; no deployment is authorized.
