# Share Studio — acceptance and release notes (22 November 2026)

## Scope implemented
- Retain original Frame/Night Run theme: light-mode sage and dark-mode electric-lime, driven by the existing `--sage` token. No colour or typography rebrand.
- Preserve old portrait (1080×1280), horizontal (1600×900) and transparent (1600×700) export sizes and existing button entry points.
- Add Story overlay (1080×1920) and square (1080×1080). Story supports top, centre and bottom placement.
- For Story and square, the runner may select a JPEG/PNG/WebP photo of up to 12 MiB. It is processed locally with canvas: no server upload, no EXIF copied to the new PNG; cover-crop fills output. Without a photo the outside remains transparent.
- On clear layouts, translucent dark backgrounds or bold shadow/outline make stats more readable over bright and dark moving footage. Bright/dark scene preview is CSS only; exported pixels stay true.
- Optional real elevation, average HR and calories appear only if present. Heart rate and calories are *off by default*; elevation is selected by default when available. Missing readings are omitted, never fabricated. Activity detail passes all available readings; day summary and check-ins pass the metrics actually held there.
- Share through Web Share API where supported, copy PNG where supported, open or save PNG, and separately copy the Taperday homepage URL. Images cannot contain a clickable link; an Instagram native Link sticker can carry the homepage link.
- Existing Strava attribution stays on Strava-originated stickers. No publicly readable run-result URL or cross-user Strava data exposure is introduced.

## Quality gates
Run against final PR head:
1. `cd client && npm ci && npm run lint && npm run typecheck && npm test && npm run build`
2. `cd client && npx playwright test e2e/run-sticker.spec.ts` (build first; tests import the built asset).
3. Existing calendar/day/run share flows, all responsive widths 320/390/768/1440, light/dark, reduced-motion, keyboard, error/retry, missing data and time-only activities.
4. Inspect actual exported PNGs over moving video, blue sky and low-light photography. Verify no overflow, the dark backing, 9:16 social safe zones and legibility at phone scale. Check on a physical iPhone (Safari/PWA), Android, and desktop where available.

## Known limits / no unsupported promises
- Browser emulator/CI does not prove Instagram transparency or video-editor import on a real handset.
- No server-hosted run URLs: a public run sharing feature would require a new consent/privacy model and verification of Strava API display restrictions before implementation.
- Photo background is a still image; Taperday is not exporting an encoded video.
- No production deployment is implied by this PR. Merge to staging after green gates; verify visual QA there and release only after approval.
