# Critique log

Each round renders `contact-sheet.png` (`node marketing/launch-film/render.mjs --sheet`), scores it and fixes only the worst 3 defects.

## Round 1: about 5/10
1. **The phone card cropped the app's own button bar** ("Continue", "Build my plan"), so the tap landed off-screen. *Fixed:* the phone now uses the app's 390x844 shape (W 420x909, V 560x1212).
2. **In vertical, the problem and close type sat high**, leaving the lower half of the frame empty. *Fixed:* both beats are now centred optically (46% down) and set larger (150 px).
3. **The close headline broke badly** ("Let's get / you"). *Fixed:* wide breaks the line where the landing page does at desktop width; vertical gets one extra line.

## Round 2: about 6.5/10
1. **The race step's full-page capture froze the app's sticky masthead and button bar mid-page**, and a back-to-top arrow floated over the race list. *Fixed:* the step is now shot with those parts unstuck, and the real masthead and bar are shot on their own. The film pins them to the phone's top and bottom, where the app keeps them. The bar settles into the flow once the scroll reaches it, as it does in the app.
2. **In wide, the type hugged the left edge and the phone hugged the right**, with a dead gap between. *Fixed:* the type moves in to x 330 and is set larger; the phone moves in to x 1170.
3. **"taperday.run · Free" was too faint.** *Fixed:* it's now set in #3a3a3a at medium weight.

## Round 3: about 7/10 (stills shown to Thami at gate 2)
- **Fixed in round 2:** at 7.4 s the race step lands on the filled-in "Another race" fields (Hoka Half, Half, 28 Feb 2027), with the masthead and Continue bar where the app draws them.
- **Open for the next round:**
  - Wide still leans left in the hook, where the card sits alone in a wide frame.
  - The problem beat's three seconds of type may feel long once it's in motion.
  - At 6.4 s the scroll-progress line shows at the top of the phone (it's the app's own, but it reads as a stray mark).

## Round 4: about 8/10 (after Thami's go-ahead for the full render)
1. **The wide hook left the card alone in a wide frame.** *Fixed:* the card moves right and the landing page's own proof line ("Plans for Two Oceans Ultra, Cape Town Marathon and 2 more / or any race you name", with its runner mark) springs in beside it. In vertical, the line sits under the card.
2. **The problem beat dragged.** *Fixed:* it's 0.4 s shorter (3.0–5.6 s), and the plan proof gets the time. The new timings live in `film.html`; `shotlist.md` keeps the gate 1 plan.
3. **A stray "e" sat in the phone's top-right corner.** It isn't the progress line: it's the landing page's race-name ticker ("Cape Town Marathon · 42.2 km") peeking past the right edge of the sticky masthead as the page scrolls. That's a real app bug at 390 px, and it's reported for the race-signal branch. *Fixed:* the builder captures hide the ticker, which is off-screen in those shots anyway. Layout is unchanged.

## Round 5: about 8.5/10 (poster and MP4 frames)
1. **The proof line orphaned "more" in wide.** *Fixed:* it now uses balanced wrapping.
2. **"DAYS TO GO" was clipped against the ring.** The landing page clips it the same way at 1440 px, so that's another small app bug. *Fixed in the film:* the label's letter spacing goes from .12em to .06em, and the size from 11.2 px to 10.4 px.
3. **MP4 frames checked:** one per second of each encoded file, against the composition. They match. The loop check shows frame 539 identical to frame 0.

## Round 6: the app bugs, fixed at the source
- **The ticker peeking past the masthead.** Frame's `skin.css` had set `.masthead { box-shadow: none }`, which dropped the paper bleed that covers the frame's gutters. The masthead now bleeds its paper sideways only (`box-shadow: 0 0 0 100vmax var(--paper)` with `clip-path: inset(0 -100vmax)`), so the full-bleed ticker can't show beside it. Checked at 320, 390, 768, 1024 and 1440 px. The film no longer hides the ticker, and it pins the masthead as the full-width band the app shows.
- **"DAYS TO GO" in the countdown ring.** Measured as the hole's width at the label's cap height, not the ring's diameter, the label was 80 px against 57–65 px of room below 1024 px. It's now 0.62rem with .06em spacing. On phones the ring is 9rem (was 8rem), the number 2.2rem (was 2.6rem) and the spacing .04em. The label is now 63–65 px against 67–69 px of room at every width. The film's ring mirrors the new CSS exactly.
- **A sub-pixel sliver of page under the pinned button bar.** *Fixed:* the bar is seated 3 px lower, into its own padding.

## Checked and kept, by design
- **The yellow note on the plan** ("More than 16 weeks of structured training rarely helps…") is real product behaviour: the Hoka Half is 17 weeks out from 1 November. It stays.
- **The frosted cards' blur changes where they hang off the photo.** The countdown and race cards deliberately overhang the runner photo on desktop, so past its edge they blur the page instead. That's the landing design, not a defect.
