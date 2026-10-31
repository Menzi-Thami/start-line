# Shot list

- **Timeline:** 18.0 s at 30 fps, 540 frames, one timeline for both formats.
- **Notation:** `spring(k, d)` is a closed-form damped spring with stiffness k and damping d (mass 1), starting at the cue time.
- **Layout:** V = vertical 1080x1920, W = wide 1920x1080.

## 1. Hook (0.0–3.0 s)
- **Assets:**
  - `runner.webp`, sage-toned exactly as the landing card styles it (`.countdown` in `skin.css`).
  - The frosted countdown card (the real number for 2 Nov 2026).
  - The race card (the real next race in the catalogue).
  - The "Built around your week" chip.
- **Motion:**
  - 0.0 s: the photo card rises 60 px and scales 0.94 → 1 on `spring(170, 22)`. A slow push-in of 1.00 → 1.04 runs across the beat.
  - 0.5 s: the countdown card springs in from the right.
  - 0.8 s: the ring draws to its real fill.
  - 1.1 s: the race card springs in from below.
  - 1.4 s: the chip pops in (scale 0.8 → 1, opacity).
- **Layout:**
  - V: the card is centred and fills about 80% of the width.
  - W: the card sits right of centre, with the left third empty grey, ready for the type in beat 2.
- **Exit (2.7–3.0 s):** the card slides up and out, and the white frame stays.

## 2. Problem (3.0–6.0 s)
- **Assets:** type only.
- **Copy:** three serif lines on the white frame, one after another, each line rising 24 px:
  - "Most plans are written for nobody."
  - "Not your race."
  - "Not your week."
- **Motion:**
  - 3.0 s: line 1 springs in.
  - 3.9 s: line 2 springs in.
  - 4.5 s: line 3 springs in.
  - 5.4 s: an ink rule wipes under them and the lines fade to 30%.
- **Layout:** V is left-aligned in the upper half. W is left-aligned, vertically centred.

## 3. Reveal (6.0–10.5 s)
- **Assets:** real builder screens at 390 px (signed-out builder, local API, pinned date):
  - `builder-race.png`: "Which race?" with Hoka Half picked.
  - `builder-days.png`: "When can you run?" with Tue, Thu, Sat and Sun, and the long run on Sunday.
  - `builder-check.png`: "Check and build".
- **Type:** the serif headline "Taperday asks." becomes "Then builds." Both sit beside the phone (W) or above it (V).
- **Motion:**
  - 6.0 s: a phone card (rounded 32 px, soft shadow) springs up from below on `spring(140, 20)`, showing `builder-race`.
  - 7.4 s: `builder-days` slides in from the right, a 24% overlap on `spring(200, 26)`.
  - 8.6 s: `builder-check` slides in the same way.
  - 9.6 s: the ink "Build my plan" pill gets a press: scale 1 → 0.96 → 1.
  - 10.0 s: a sage wipe clears the card, ready for the plan.

## 4. Proof (10.5–15.0 s)
- **Assets:** real plan screens at 390 px (Hoka Half, 28 Feb 2027, goal 1:50:00), from the generator:
  - `plan-week.png`: a full-height capture of the "This week" tab.
  - `plan-calendar.png`: the Calendar tab.
- **Type:** "Your race. Your week." in serif, with "Every session paced from your goal." in sans beneath.
- **Motion:**
  - 10.5 s: the plan header lands.
  - 10.5–12.8 s: `plan-week` scrolls 0 → about 600 px on an eased spring, so the sessions pass by.
  - 12.8 s: the tab pill slides from "This week" to "Calendar" and `plan-calendar` crossfades in, a 0.25 s spring.
  - 13.2–15.0 s: a slow push-in on the calendar.

## 5. Close (15.0–18.0 s)
- **Assets:**
  - The landing headline in Instrument Serif: "You've entered the race. Let's get you to the start."
  - The ink pill "Start your plan".
  - "taperday.run · free".
- **Motion:**
  - 15.0 s: the phone card drops away.
  - 15.2 s: the headline springs in word by word, 60 ms apart.
  - 16.3 s: the pill scales in.
  - 16.8 s: the URL fades in.
  - 17.4–18.0 s: everything fades to the grey page. The frame keeps its exact hook-frame geometry, so frame 539 → frame 0 loops cleanly.

## Checks per round
- **Contact sheet:** frames at 0.6, 2.0, 3.6, 5.6, 6.8, 8.0, 9.8, 11.5, 13.8, 16.0 and 17.9 s, in both formats.
- **Defects to look for:**
  - text under 40 px on V
  - anything off the safe area (V: 120 px top and bottom)
  - a spring overshoot that shows a gap
  - two moves at once
  - type over the photo's face
  - screens soft from scaling
