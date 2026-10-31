# Taperday launch film

An 18-second launch film for Taperday in the Frame look, rendered from code. It comes in two formats from one timeline:

| File | What it is |
|---|---|
| `taperday-launch-vertical.mp4` | 1080x1920, 30 fps, H.264, silent, for Stories, Reels and Shorts |
| `taperday-launch-wide.mp4` | 1920x1080, 30 fps, H.264, silent, for X, LinkedIn and YouTube |
| `poster-vertical.png`, `poster-wide.png` | The hook at 2.2 s, for thumbnails |
| `contact-sheet.png` | 13 stills per format, for review |
| `loop-check.png` | The last frame beside frames 0 and 1; the film loops cleanly |
| `brief.md`, `shotlist.md` | The gate 1 plan. `film.html` holds the final timings |
| `critique.md` | Every critique round: the worst 3 defects and their fixes |

## How it works
- **`film.html`** is the whole film as one page. `window.seek(t)` sets every layer from `t` alone, with closed-form springs from `spring.js` and no timers or randomness. Any frame renders on its own, in any order. `?format=v` or `?format=w` picks the layout, and both share the same timeline.
- **`capture-screens.mjs`** drives the real app from this branch and writes the screens into `assets/`:
  - The builder for Thami's Hoka Half: Half, 28 Feb 2027, 1:50:00 goal, Tue/Thu/Sat/Sun with Sunday as the long run.
  - The plan the generator built from it, and its Calendar tab.
  - The landing page's countdown and copy, written to `landing.json`.
  - Scroll anchors, written to `anchors.json`.

  The browser clock is pinned to 1 November 2026, so every number is what the app shows on that day.
- **`render.mjs`** serves the repo root, so the film uses the app's own fonts (Instrument Serif and Instrument Sans, from Fontsource, under the OFL) and photo (`client/public/landing/runner.webp`). It opens the page in Playwright, captures each frame with `seek(i / 30)` and pipes the PNGs to ffmpeg.

Nothing on screen is invented. One adjustment is disclosed: while the race step scrolls, the builder's sticky masthead band and button bar are captured separately and pinned to the phone's edges, where the app keeps them. The film's runner card mirrors the landing CSS (`skin.css`). The two app bugs the film once worked around (see `critique.md`) are fixed in the app itself, so the film has no workarounds left.

## Re-render
You need Node 22+, `npm ci` in `client/`, and Playwright's Chromium (`npx playwright install chromium` in `client/`).

```bash
cd marketing/launch-film
npm install            # ffmpeg, via @ffmpeg-installer (a prebuilt binary, no install script)
npm run sheet          # contact-sheet.png, about 1 minute
npm run render         # both MP4s, posters and loop check, about 4 minutes
node render.mjs --at 6.4,7.4   # full-size stills into stills/ (git-ignored)
```

To re-capture the screens, run the API locally on port 5123 with no database, the way the e2e suite does. Then, from the repo root:

```bash
ASPNETCORE_ENVIRONMENT=E2E ConnectionStrings__StartLine="Server=127.0.0.1,1;Database=Unused;User Id=e2e;Password=unused;TrustServerCertificate=True" dotnet run --project src/StartLine.API -p:UseAppHost=false --no-launch-profile --urls http://localhost:5123
node marketing/launch-film/capture-screens.mjs   # starts Vite on port 5201 itself
```

The API accepts a plan dated up to a day past its own clock, or up to 400 days back. So the pinned date (`TODAY` in `capture-screens.mjs`) re-captures until early December 2027. After that, move it forward, knowing the countdown and plan dates will change with it.

## Timeline
| Beat | Time | What's on screen |
|---|---|---|
| Hook | 0–3.0 s | The runner card, the countdown, the race card, the "Built around your week" chip, and the landing proof line |
| Problem | 3.0–5.6 s | Type only: "Most plans are written for nobody. Not your race. Not your week." |
| Reveal | 5.6–10.1 s | The real builder: "Which race?" scrolled to Hoka Half, "When can you run?", "Check and build", then a tap on "Build my plan" |
| Proof | 10.1–15.0 s | The plan's "This week", scrolled to the week, then the Calendar tab |
| Close | 15.0–18.0 s | "You've entered the race. Let's get you to the start." with "Start your plan" and taperday.run, then back to the empty frame for the loop |
