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
