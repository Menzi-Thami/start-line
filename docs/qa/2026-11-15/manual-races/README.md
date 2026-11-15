# Manual race setup

The builder offers **Add a race manually** before the catalogue. Selecting it brings the name, distance and date fields into view, with a way back to catalogue browsing that retains the draft. Catalogue loading and failure do not block manual entry.

Searching offers **Add this race manually**, reusing the typed name and focusing its field. Standard shortcuts include 5K, 10K, 15K, half marathon and marathon; typing a distance overrides a preset. Kilometre values remain exact through shared links and edits. Mile displays retain the original saved/preset kilometres until the runner types a new value, avoiding repeated conversion and rounding.

Manual events belong to the runner's plan and share link; they do not publish a new public catalogue listing. Existing limits remain: positive distances up to 400 km, with a race at least 14 days away and within two years. Names remain optional for personal goals. Training session prescriptions retain their existing rounding and generator versions; event metadata retains the entered distance.

| Viewport | Light | Night Run |
| --- | --- | --- |
| 320px | [Manual fields](manual-320-light.png) | [Manual fields](manual-320-dark.png) |
| 375px | [Manual fields](manual-375-light.png) | [Manual fields](manual-375-dark.png) |
| 1440px | [Manual fields](manual-1440-light.png) | [Manual fields](manual-1440-dark.png) |

Screenshots show the real production client against the local API, scrolled to the manual fields. The floating Back to top action stays out of this form so it cannot cover the date picker. Colours, typography and race animations remain intact.

Coverage:

- `ManualRace.test.tsx`: exact standard distances in kilometres/miles, typed distance overrides, catalogue loading/failure, search-name reuse and focus, invalid input, draft retention and saved decimal distances through URL/edit round trips.
- `GeneratePlanTests`: unlisted 5K, 10K, 15K, 15.75 km, half marathon and marathon retain their name/date/exact event distance with unchanged rounded prescriptions.
- `manual-race.spec.ts`: real API generation after a failed build and retry, equal retry payloads, link metadata, reload and edit; catalogue failure/retry; overflow and WCAG checks at each viewport/theme. Runs in the main desktop/phone suite and the Chromium, WebKit and Firefox connection matrix.

Full results are recorded in the follow-up PR. Browser profiles emulate devices; live sign-in and physical keyboards/devices are outside this evidence. No schema or generator-rule changes are required.
