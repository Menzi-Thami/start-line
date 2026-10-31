# Taperday launch film: brief

## What it's for
An 18-second film that introduces Taperday in its new Frame look. It's for social posts and the landing page:
- Vertical 1080x1920 for Stories, Reels and Shorts.
- Wide 1920x1080 for X, LinkedIn and YouTube.

Both are cut from the same timeline. It must also play muted, so every beat reads without sound.

## The one idea
**You've entered the race. Taperday gets you to the start.** Other plans are written for nobody. Taperday asks which race, and when you can run, then builds your weeks around them.

## Story (five beats, 18 s at 30 fps)
| Beat | Time | What we see | What it says |
|---|---|---|---|
| Hook | 0.0–3.0 | The runner photo card from the landing page, toned sage. The frosted countdown and race cards spring in over it. | This is about *your* race. |
| Problem | 3.0–6.0 | Type only, on the grey page: generic plans don't know your race or your week. | The pain. |
| Reveal | 6.0–10.5 | The real builder: "Which race?" → "When can you run?" → "Check and build". The plan lands. | Taperday asks, then builds. |
| Proof | 10.5–15.0 | The real plan: "This week" with its sessions, then the Calendar tab. | It's a real plan, week by week. |
| Close | 15.0–18.0 | The landing headline "You've entered the race. Let's get you to the start.", the "Start your plan" pill and taperday.run. | Go. It's free. |

The last frame dissolves back to the grey page, so the film loops cleanly into the first frame.

## Look (Frame, from `client/src/styles/tokens.css`)
- **Page and frame:** a grey page `#e4e4e4` with one white rounded frame.
- **Colour:** ink `#111` for type and pills. Sage `#b4c7a8` is the only colour, with deep sage `#4f6f45` for accent text.
- **Type:** Instrument Serif for headlines and Instrument Sans for everything else (Fontsource, OFL, loaded from the client's `node_modules`).
- **Motion:** closed-form damped springs. Things settle; they don't bounce more than once. There are no linear slides, no timers and no `Math.random`.
- **App screens:** shown as a phone-sized card inside the frame. Vertical puts the card under the type; wide puts it beside the type.

## Truth rules
- **Real assets only.** That means `client/public/landing/runner.webp` and the real app screens, captured by Playwright from the Frame branch.
- **Screens and data:** signed-out screens come from the dev server with the API running locally (never production). Signed-in screens use the e2e fixture pattern (`client/e2e/fixtures/plan-edit.html`) with mocked APIs.
- **The plan:** Thami's real race, the Hoka Half on Sunday 28 February 2027, with a 1:50:00 goal. It's built by the real generator. Every number on screen is whatever the app rendered.
- **Pinned date:** the app's "today" is 2 November 2026, so the countdown is the real figure for that date.
- **No invented metrics, testimonials, user counts or UI.** The problem beat is type only. No fake "other app" screen.

## Method (from the "Opus 5.5 Motion Design" article)
1. **The composition** is `film.html`, one seekable page. `window.seek(t)` sets every layer from `t` alone, so any frame renders on its own, in any order.
2. **Capture:** `render.mjs` opens it in Playwright at each format's size, calls `seek(i / 30)` for every frame and screenshots it. ffmpeg encodes H.264 (yuv420p, CRF 18).
3. **Contact sheet:** `render.mjs --sheet` renders one still per beat (plus in-betweens) into `contact-sheet.png`.
4. **Critique loop:** each round, review the sheet and fix the **worst 3** defects only, then re-render. Rounds are logged in `critique.md`.
5. **Poster and loop check:** the poster is a still from the hook. The loop check puts the last and first frames side by side.

## Deliverables (`marketing/launch-film/`)
- `taperday-launch-vertical.mp4` and `taperday-launch-wide.mp4`
- `poster-vertical.png` and `poster-wide.png`
- `contact-sheet.png` and `critique.md`
- The source: `film.html`, `spring.js`, `capture-screens.mjs`, `render.mjs` and the captured screens in `assets/`
- `README.md`, which explains how to re-render

## Open questions for Thami
1. **ffmpeg isn't installed on this PC.** I can either:
   - add `ffmpeg-static` (an npm package that downloads an ffmpeg binary) to the film folder's own `package.json`, or
   - you can install it yourself with `winget install Gyan.FFmpeg`.
2. **Sound:** silent by default. If you want it, I'd synthesize a soft footfall tick at 170 steps per minute and one sage-warm chord on the reveal, all in code.
3. **Close line:** the landing headline as-is, or a shorter end card, "Let's get you to the start."?
