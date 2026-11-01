# Hand-over: launch film, landing fixes and the sign-in page (1 Nov 2026)

## State
| Item | Status |
|---|---|
| Launch film (#132) | **Merged** to main and deployed (the deploy run passed). |
| Landing fixes and film refresh (#135, branch `fix/landing-ticker-ring`) | **Open, not merged.** All 4 checks green (backend, frontend, end-to-end, gitleaks), mergeable. Already rebased onto #133 and #134. |
| Focused sign-in page | **Not started.** It's Thami's request, described below. |

## #135: what it does, and what's left
- **The ticker showed beside the sticky masthead.** Race names showed in the frame gutters at 390 px.
  - *Cause:* `skin.css` had `.masthead { box-shadow: none }`.
  - *Fix:* `box-shadow: 0 0 0 100vmax var(--paper); clip-path: inset(0 -100vmax);`, so the paper bleeds sideways only.
  - *Checked:* 320, 390, 768, 1024 and 1440 px.
- **The "Built around your week" chip covered the runner's face** at desktop, after #133's new photo. It now straddles the card's top edge (`.countdown::after { top: -22px }`). Phones are unchanged (top-left, above her head). Thami asked for this.
- **"DAYS TO GO":** #133 already fixed it (0.62rem, no letter spacing, 9rem phone ring). Re-measured with Instrument Sans: 59 px against 62 px of room on phones and 69 px on desktop. This PR adds nothing there.
- **Film:** re-rendered from the fixed app.
  - The new photo appears in black and white on sage, with the moved chip.
  - The ticker is no longer hidden, and the masthead is pinned as the full-width band.
  - The pinned button bar is seated 3 px lower.
  - `critique.md` rounds 6–7 have the details.
- **Left to do:**
  1. Main has moved on (now at #141). The PR still merges cleanly, but if `skin.css` changes again, rebase and keep main's countdown CSS.
  2. Re-check the hero at 390 and 1440, then merge (squash). Note: commit 042a9cd's message still mentions DAYS TO GO, but its final diff is only the masthead fix. The squash title covers it.
  3. Merging deploys production (`deploy.yml` on push to main).

## Focused sign-in page (Thami's request, not started)
> "remove the unnecessary te[x]t on the landing page on top when logging in, we need to have a focused logging page, theres too much going on there"

- **Ask:** when a runner signs in, they should get a sign-in view on its own, not the landing hero and copy stacked above the sign-in.
- **Where to look:**
  - `client/src/app/App.tsx`: routing, and what renders with the masthead's Sign in.
  - `client/src/features/account/`: `SignInWait.tsx`, `SignUpPitch.tsx`, `AccountPage.tsx`.
  - `client/src/features/home/Hero.tsx`: the landing hero, with its `onSignIn` link.
- **Before you start:** confirm with Thami which screen they mean (masthead "Sign in" → which view, on phone and desktop), and check `docs/plan-history.md` and `client/src/app/sign-in-flow.test.tsx` for the expected flow.
- **What done looks like:** a sign-in screen with just the wordmark, one heading and the email-code form, with tests updated (`sign-in-flow.test.tsx`, `account.test.tsx`).

## Other app observations (not fixed; ask Thami)
- **Race rack (builder "Which race?"):** the year ("2027") on the deep-sage cards is dark text on dark green, nearly invisible. The Comrades card renders as white text on light grey, which is low contrast. Seen at 390 px.
- **Phone runner card (390 px):** the 9rem countdown card sits right next to the runner's face. It's clear, but tight.

## Environment notes (this PC)
- **Worktrees:** `%TEMP%\slfix` (branch `fix/landing-ticker-ring`, its own `client/node_modules`) and `%TEMP%\slfilm` (film branches, done). `%TEMP%\slrs` belongs to another session, so leave it alone.
- **Local API without a database (E2E mode, port 5123):**
  `ASPNETCORE_ENVIRONMENT=E2E ConnectionStrings__StartLine="Server=127.0.0.1,1;Database=Unused;User Id=e2e;Password=unused;TrustServerCertificate=True" dotnet run --project src/StartLine.API -p:UseAppHost=false --no-launch-profile --urls http://localhost:5123`
  Nothing is running now.
- **Plan dates:** the API accepts a plan date of at most its clock (UTC) + 1 day, which is why the film's capture date is 2026-11-01.
- **Shared node_modules:** a junctioned `node_modules` breaks Vite (its optimizer cache and `fs.strict`). Use a real `npm ci` per worktree.
- **Re-rendering the film:** see `README.md` (`npm install` here for ffmpeg, then `npm run sheet` / `npm run render`).
