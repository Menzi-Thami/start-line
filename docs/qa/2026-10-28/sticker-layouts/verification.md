# Run sticker layout verification

Synthetic run: 10 km, 1 hour, Easy long run, 28 October 2026. No runner account or production database was used.

- Actual sharing dialog checked with all three layouts at 375, 820 and 1440 pixels: no horizontal overflow.
- Portrait remains 1080 × 1280; horizontal card is 1600 × 900; transparent horizontal is 1600 × 700.
- Every layout downloads with its own filename. Full-size preview opens the selected PNG.
- The transparent PNG was copied to and read back from Chromium's clipboard: 1600 × 700, background alpha 0.
- Keyboard layout selection retains focus; Escape closes and restores focus to the share trigger.
- Renderer browser tests cover all actual labels, PNG dimensions and painted pixel coverage, plus time-only runs with no invented distance or pace.
- Unit tests cover selection, keyboard interaction and an out-of-order export finishing after a newer selection.

Preview files in this folder came from the app's real Canvas renderer. Black behind the transparent image in some image viewers is the viewer's backdrop, not a painted PNG background.

Physical iPhone/Android sharing into Instagram and Instagram's handling of transparent PNGs still need device checks. Native share-sheet targets depend on the installed apps and operating system.

`scripts/check.sh` passed: .NET format/build (0 warnings), 819 domain + 103 application + 7 architecture + 218 SQL integration tests, migration-model check, frontend lint/typecheck, 517 frontend tests in 62 files, production build, npm audit (0 vulnerabilities), and 28 Playwright checks. SQL was the disposable local test database.
