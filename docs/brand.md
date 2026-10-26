# Taperday brand

## The name

- In sentences it's **Taperday**: one word, capital T. Never "TaperDay", "Taper Day" or "TAPERDAY".
- The logo is the only place it's written all lowercase: **taper**day.
- Domain: taperday.run.

## The idea

A taper is the last few weeks before a race, when training volume steps down so you arrive fresh.
The logo does exactly that: the letters of "taper" each get a step smaller and lighter, then "day"
comes back at full size in volt. Race day, fresh.

The site's look is "Night run": near-black, one electric volt accent, frosted glass. Its full description,
motion rules included, is in `docs/design/night-run/README.md`.

## Logo (the wordmark)

| Part | On the dark site | On paper (print) |
|---|---|---|
| "taper" | `#f2f2f2`, fading by step | Ink `#111111`, fading by step |
| "day" | Volt `#d7ff3e` | Ink `#111111` |

In the app the colours come from the `--ink` and `--accent` tokens (`client/src/styles/tokens.css`),
so dark mode follows automatically. Don't hard-code them in components.

- **Type:** Bricolage Grotesque, bold, letter-spacing −0.03em, letters sitting on one baseline.
- **The taper**, relative to the size of "day":

  | Letter | t | a | p | e | r | day |
  |---|---|---|---|---|---|---|
  | Size | 1.12 | 1.00 | 0.88 | 0.79 | 0.70 | 1.00 |
  | Opacity | 1 | 0.85 | 0.70 | 0.58 | 0.48 | 1 |

- **Clear space:** at least the height of the "t" all round.
- **Smallest size:** "day" at least 20px tall. Below that the small letters turn to mush, so use one of the
  icons instead.
- Screen readers get the plain word "Taperday"; the stepped letters are hidden from them.

## Icons

The wordmark can't shrink to a square, so square places use one of two marks. Never put either next to the wordmark.

### Favicon (the taper)

Three bars stepping down and a race-day dot, near-black on a volt rounded square (`client/public/favicon.svg`).
It carries the idea at the tiniest sizes: the browser tab, the home-screen icon and social avatars.

On a home screen (and on reminders) it fills the whole square, so the phone rounds the corners itself, and the bars sit
inside Android's round crop (the maskable safe zone):

| File | Use |
|---|---|
| `client/public/home-icon.svg` | Source: the favicon's mark on a full-bleed volt square |
| `client/public/apple-touch-icon.png` | iPhone and iPad home screen (180 px) |
| `client/public/home-icon-192.png`, `home-icon-512.png` | The web app manifest (any and maskable), reminders and the install banner |

### App icon (td)

The initials in the wordmark's own colours: **t** in ink `#f2f2f2` for "taper", **d** in volt `#d7ff3e` for "day", on
near-black `#0a0a0b`. Use it wherever another service lists Taperday as an app beside others, such as Strava's
connected apps, where a square picture of the name reads better than a chart. Not on Taperday's own home-screen icon:
that's the taper.

| File | Use |
|---|---|
| `client/public/app-icon.svg` | Source. Letters are outlined paths, so it needs no font installed |
| `client/public/app-icon-512.png` | Uploads that want a picture (Strava's API app icon) |
| `client/public/app-icon-1024.png` | Listings that ask for a larger image |

- **Type:** Bricolage Grotesque, weight 700, optical size 96, set at 300 on a 512 square and centred on the ink.
  The letters sit a hair apart (+2 units) rather than at the wordmark's −0.03em, so they stay distinct when small.
- **Square, full bleed:** the services round the corners themselves, so the file doesn't.
- Same rules as the wordmark: never swap the colours, never make the "t" volt, and nothing but near-black behind it.

## Please don't

- Make "taper" volt, make "day" fade, or reverse the steps (it must get smaller towards "day").
- Put text on volt in anything but the near-black ground colour: white on volt is unreadable.
- Stretch the logo, or add shadows, gradients or outlines.
- Write the name with separators (`taper.day`, `taper|day`): `taper.day` is someone else's domain.
- Put the full logo on a busy photo. Use a solid background, or one of the icons.

## Voice

Runner to runner: plain, warm and specific. Say what to do and why in as few words as it takes.
No hype ("crush it", "beast mode"), no medical claims, and no guilt about missed runs.
