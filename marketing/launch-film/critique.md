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
