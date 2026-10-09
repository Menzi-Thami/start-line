# Taperday brand

## The name

- In sentences it's **Taperday**: one word, capital T. Never "TaperDay", "Taper Day" or "TAPERDAY".
- The logo is the only place it's written all lowercase: **taper**day.
- Domain: taperday.run.

## The idea

A taper is the last few weeks before a race, when training volume steps down so you arrive fresh.
The logo does exactly that: the letters of "taper" each get a step smaller and lighter, then "day"
comes back at full size in track red. Race day, fresh.

## Logo (the wordmark)

| Part | Light background | Dark background |
|---|---|---|
| "taper" | Ink `#16181b`, fading by step | `#eeebe5`, fading by step |
| "day" | Track red `#b93a1c` | `#e8613b` |

In the app the colours come from the `--ink` and `--accent` tokens (`client/src/styles/tokens.css`),
so dark mode follows automatically. Don't hard-code them in components.

- **Type:** Bricolage Grotesque, bold, letter-spacing −0.03em, letters sitting on one baseline.
- **The taper**, relative to the size of "day":

  | Letter | t | a | p | e | r | day |
  |---|---|---|---|---|---|---|
  | Size | 1.12 | 1.00 | 0.88 | 0.79 | 0.70 | 1.00 |
  | Opacity | 1 | 0.85 | 0.70 | 0.58 | 0.48 | 1 |

- **Clear space:** at least the height of the "t" all round.
- **Smallest size:** "day" at least 20px tall. Below that the small letters turn to mush, so use the
  app icon instead.
- Screen readers get the plain word "Taperday"; the stepped letters are hidden from them.

## App icon (small sizes only)

The wordmark can't shrink to a browser tab, so tiny places use a mark with the same idea: three
bars stepping down and a race-day dot, white on a track-red rounded square
(`client/public/favicon.svg`). Use it for the favicon, the home-screen icon and social avatars,
never next to the wordmark.

## Please don't

- Make "taper" red, make "day" fade, or reverse the steps (it must get smaller towards "day").
- Stretch the logo, or add shadows, gradients or outlines.
- Write the name with separators (`taper.day`, `taper|day`): `taper.day` is someone else's domain.
- Put the full logo on a busy photo. Use a solid background, or the app icon.

## Voice

Runner to runner: plain, warm and specific. Say what to do and why in as few words as it takes.
No hype ("crush it", "beast mode"), no medical claims, and no guilt about missed runs.
