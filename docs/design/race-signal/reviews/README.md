# Contact sheet reviews

`contact-sheet.png` shows the real app at 390 and 1440, with one row per accent candidate. It's rendered with reduced motion, the dev server proxying the live API, and the run-history fixture for the signed-in home.

## Pass 1: about 5/10
Worst 3 defects:
- The headline painted one phrase in the accent. That's a generated-look tell.
- The countdown was a generic ring card, not a bib.
- Tile numbers were still in mono.

## Pass 2: about 7/10
- All three defects above are fixed in CSS.
- The countdown is now the bib: a 2px ink edge, the accent band and pin holes.
- The headline is all ink.
- The ticker is an ink course banner.
- Numbers are in condensed Archivo.

Also fixed:
- The pin holes are now visible.
- The race date keeps its case.
- The masthead spans the full width.

## Open for the next pass
- The plan and calendar views aren't in the sheet yet; they need the builder walk-through.
- The home race countdown ("56") is still small.
- The skeleton and "This week" tiles sit on sunk grey.

## Round 2 and 3: colour fields (taste-skill palettes)
Thami rejected the single accents (Tartan, Cobalt, Pacer). taste-skill's palette library (MIT) builds its strongest systems from whole fields of colour, not one accent on grey. ui-ux-pro-max's running palette (orange and green on dark) is the category default we're leaving.

Round 3 renders six field systems from `palettes-round3.json`:
- Cape coast
- Card pastels
- Race poster
- Ultramarine and yellow
- Mint and pink
- SA flag chapters

Fields fill the masthead, a full-bleed hero, the bib, the course banner, and the Today and This week cards.

Known defects to fix once a palette is chosen:
- Accent text on coloured cards needs a contrast check (for example the pace on yellow).
- The ring track on a coloured bib.

`render-sheet.mjs` re-renders the sheet. It needs the dev server on port 5199. Run it as `node render-sheet.mjs <outDir> <palettes.json>` from `client/`.
