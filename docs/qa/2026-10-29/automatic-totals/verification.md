# Automatic Strava totals — 29 October 2026

The reported screen counted a linked run but showed a dash for kilometres: the saved completion had no independent distance, while its card could resolve 10 km from the valid Strava activity. Home requested only saved history, making manual re-entry necessary to populate those tiles.

Home now opts into a read-only running-history view that includes available Strava measurements automatically. The month and year tiles show 10 km and one run before logging; logging the same activity leaves both unchanged. The source contribution is labelled. The average remains zero for this example because it covers the four completed weeks and excludes this week.

The default saved-only API is preserved. Current totals do not write measurements into check-ins, create completions, accept coaching changes, create a new Strava index or extend retention. HTTP requests/responses use no-store. Deletion/disconnection/expiry removes imported contributions; saved completions and independently entered measurements retain their own meaning.

Focused validation: eight domain cases, four SQL/API cases and 57 frontend checks passed; four desktop/phone browser journeys passed. The final full suite additionally covers no-plan runners and no-store headers. Final counts and tested commit are recorded in the PR.

Browser evidence uses the actual Home/Plan screens, check-in hook and API client with controlled account responses. It verifies automatic 10 km before/after logging, one run counted, no manual entry required, reload, a sync distance update, expiry, independent distance taking precedence and remaining after expiry/reopening, plus widths 375/820/1440. [Phone evidence](automatic-10km-phone.png).

SQL tests independently exercise real API persistence/query behavior and confirm no imported measurement is written to the saved check-in. All data is synthetic and SQL is disposable/local; no live Strava account or production database is used. Physical-device sign-in, push and provider approval are outside these regressions. See [behavior and boundaries](../../../automatic-running-totals.md).
