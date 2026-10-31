# Race bib: style guide

## Reference
Take the look of race-day paper, never its logos or copy:
- **The bib:** white Tyvek, huge black condensed numbers, one coloured sponsor band, four safety-pin holes.
- **The timing slip:** mono figures, dotted leaders, a perforated tear line.
- **The finisher stamp:** a slightly rotated ink stamp.
- **The track:** lane lines and numbered lanes.

The same grammar shows up in the designeer.xyz finds (boarding pass, crumpled receipt, stamps, ID card, ticket) and fits nowhere else in running apps.

## Palette (one accent)
| Token | Value | Use |
|---|---|---|
| `--paper` | `#F4F5F7` | page: cool Tyvek grey, not cream |
| `--surface` | `#FFFFFF` | bibs and cards |
| `--surface-sunk` | `#E9EBEF` | wells, inputs, tracks |
| `--ink` | `#000000` | type, numbers, 2px bib rules: bibs print true black, not a tinted near-black |
| `--ink-2` | `#3A414C` | secondary text |
| `--muted` | `#5B6472` | labels (4.5:1 or better on white) |
| `--line` | `#D5D9E0` | hairlines |
| `--accent` | candidate below | the sponsor band, the active lane, primary buttons, race pace |

**Accent candidates.** Each is tested on real screens in the contact sheet, and one wins.
- **Tartan** `#C8361F`: athletics-track rubber.
- **Cobalt** `#1F3FD1`: timing-mat blue.
- **Pacer** `#B0175A`: pacer-flag magenta. No one in running uses it.

(Swiss red was dropped: frontend-design flags red on heavy black as a generated-look default.)

The effort ramp is ink tints (recovery is lightest, interval is ink) ending in the accent for race pace, and it always sits beside a text label.

## Type
| Role | Face | Rules |
|---|---|---|
| Display and numbers | **Archivo** (variable, wdth 62–125) | Condensed (wdth 75), weight 800, tabular numbers. Caps only for the bib number and page titles; everything else is sentence case |
| Body and UI | **Instrument Sans** (variable) | 400 and 600, normal case |
| Timing | **Martian Mono** (variable) | Real timing values only (paces, splits, clock), weight 500. Never small labels |

All three are OFL-1.1 through Fontsource. Fluid sizes use clamp (Utopia method). Bib numbers scale from 3rem at 320px to 7rem at 1440px.

## Shape
- Squared corners: radius 2px on buttons and chips, 4px on cards.
- **Bib card:** white, a 2px ink border, the accent band on top (6px) and four pin holes (6px circles in `--paper`) inset in the corners.
- **Timing slip:** a dashed top tear line and mono rows with dotted leaders.
- **Lane tabs:** an underline that slides under the active tab, with the lane number in mono.
- **Buttons:** primary is ink fill with white text, accent on hover and focus. Secondary is a 2px ink outline.
- **Focus:** a 3px accent outline, offset 2px.

## Motion (springs, not slides)
| Object | Rule |
|---|---|
| Small UI (checks, chips, toggles) | Snaps in 160ms, overshoot ≤ 4% |
| Panels and sheets | Settle in 260ms with no overshoot |
| Headlines and bib numbers | Land hard in 220ms, then hold |
| Mascot | Bounces on purpose, the only playful thing |
| Numbers | NumberFlow (MIT) rolls only to a real value |

Signature moments:
- **Session done:** the bib stub tears along the perforation.
- **Run ticked:** a spring check and a finisher stamp.
- **Sync status:** status marks for idle, working, done and failed.

Reduced motion: all of these become instant state changes.

## The one bold thing
The bib: race countdown on home, the plan header and the run sticker. Everything around it stays quiet. Before shipping a screen, remove one accessory.

## Banned
- Tracked-out ALL-CAPS eyebrow labels, 'A · B · C' meta strings, '→' on buttons, 01/02/03 markers on things that are not a sequence.
- Fade-and-slide-up on every section; one orchestrated moment per screen at most.
- Dark-first pages, glows, gradients on text, glass, aurora or particles.
- Centred hero on a gradient, and everything fading in at once.
- Cream, dark green or gold (Slow Miles). Coral (the old skin). Volt `#d7ff3e` (the old brand).
- More than one accent on a screen.

## Checks before delivery (ui-ux-pro-max)
Contrast 4.5:1 for text and 3:1 for icons and control edges, 44px targets, visible focus, no layout shift on press, tokens only (no raw hex in components), 375px and landscape, reduced motion, largest text size, safe areas.

## Free resources used (from designeer.xyz)
- **Fontsource:** fonts.
- **NumberFlow:** MIT, number rolls.
- **Lucide:** ISC, icons, only if needed.
- **Utopia:** fluid type maths.
- **OKLCH, Huetone and APCA:** palette and contrast checks.

Skipped:
- Fontshare and Klim: not OFL, or paid.
- Paper Shaders and the paid kits.
