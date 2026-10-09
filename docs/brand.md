# Taperday brand

## The name

- In sentences it's **Taperday**: one word, capital T. Never "TaperDay", "Taper Day" or "TAPERDAY".
- The logo is the only place it's written all lowercase: **taper**day.
- Domain: taperday.run.

## The idea

A taper is the last few weeks before a race, when training volume steps down so you arrive fresh.
The mark draws exactly that: four bars stepping down, then a dot for race day. It's the same
shape as the weekly-distance chart in every plan, so the logo and the product tell one story.

## Logo

| Part | Light background | Dark background |
|---|---|---|
| Bars and "taper" | Ink `#16181b` | `#eeebe5` |
| Race-day dot and "day" | Track red `#b93a1c` | `#e8613b` |

In the app these come from the `--ink` and `--accent` tokens (`client/src/styles/tokens.css`), so
dark mode follows automatically. Don't hard-code them in components.

- **Wordmark type:** Bricolage Grotesque, bold, letter-spacing −0.03em.
- **Mark geometry** (44 × 26 grid): bars 6 wide with gaps of 3, heights 22, 17, 12 and 7, corner
  radius 1.5; dot radius 3.5, centred at (39.5, 20.5).
- **Clear space:** at least the height of the "t" all round.
- **Smallest size:** the full logo at 20px tall; below that use the mark or the app icon alone.

## App icon

The mark in white on a track-red rounded square (`client/public/favicon.svg`). Three bars plus the
dot, because four bars blur at 16px.

## Please don't

- Recolour the bars, or make every part red.
- Change the order of the bars, stretch the mark, or add shadows, gradients or outlines.
- Write the name with separators (`taper.day`, `taper|day`): `taper.day` is someone else's domain.
- Put the full logo on a busy photo. Use a solid background, or the app icon.

## Voice

Runner to runner: plain, warm and specific. Say what to do and why in as few words as it takes.
No hype ("crush it", "beast mode"), no medical claims, and no guilt about missed runs.
