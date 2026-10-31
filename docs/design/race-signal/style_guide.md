# Frame: style guide

Chosen by Thami on 2026-10-31 from a landing-page reference.

**How we got here:**
- Rejected first: Race bib's single accents (tartan, cobalt, pacer), the colour-field palettes, Cape coast, and the Xhosa beadwork and umbhaco rounds.
- Kept in `reviews/` for the record.

## The look
- **Frame:** a grey page (`--page` `#e4e4e4`) holding one white rounded frame (`#root`, 32px corners, 8px on a phone).
- **Cards:** soft grey panels (`--surface` `#f3f3f3`, 20px corners), with no borders and no shadows.
- **Landing hero:** a grey-gradient panel with a huge serif headline.
- **Runner card:** the runner photo toned sage, with frosted cards on top (the real countdown and the real race) and a ticked pill.
- **Logo strip:** the bottom strip is the real race list.
- **Buttons:** pills, primary in ink. Selected tabs and chips are ink pills.
- **One colour, sage:**
  - Soft sage `--sage` `#b4c7a8` fills fields: the Today card, the runner card and confetti.
  - Deep sage `--accent` `#4f6f45` is the accent wherever it is text or a thin stroke, so it keeps 4.5:1 on white.

## Type
| Role | Face | Rules |
|---|---|---|
| Headlines and big numbers | **Instrument Serif** (OFL, one weight) | 400 only, mixed case. `font-synthesis-weight: none`, so the browser never fakes a bold |
| Everything else | **Instrument Sans** (OFL, variable) | 300 for the hero lede, 400 to 700 for UI. Numbers use tabular figures; there's no monospace face |

## Effort ramp
Greys rising into sage, ending in ink for race pace: recovery `#dcdcdc`, easy `#c2c2c2`, long sage, tempo `#7f9a73`, interval deep sage, race ink. It always sits beside a text label.

## Assets
| Asset | Where | Notes |
|---|---|---|
| Runner photo | `client/public/landing/runner.webp` | Supplied by Thami. Self-hosted, because the CSP is `img-src 'self'`. Cropped clear of the shop sign; the shoe brand is still visible |
| Icons | `app-icon.svg`, `home-icon.svg`, `favicon.svg` | Rasters re-rendered from them: a sage tile with ink taper bars, and "td" in white and sage on ink |
| Mascot | `email/peek.svg` and `.png` | Sage body, ink face |
| Share card | `og-image.png` | The frame, the headline and the runner card |
| Run sticker | — | Sits on runners' photos, so it stays a dark card: ink and sage |
| Emails | `EmailLayout` | A grey ground, a white 28px card, a serif title, ink pill buttons and sage markers. Email apps fall back to Georgia and Segoe UI |
| Boot screen, theme colour, manifest | — | Grey `#e4e4e4` |

## Checks before delivery
- **Contrast:** 4.5:1 for text and 3:1 for icons and control edges.
- **Interaction:** 44px targets and visible focus (a 3px ink outline).
- **Layout:** no horizontal scroll at 320, 390, 768, 1024, 1440 and 2560px. The hero stacks below 1024px.
- **Motion:** reduced motion is respected.
- **Print:** white.
